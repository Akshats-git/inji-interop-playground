/**
 * Issuer Studio: issuer profiles and credential types, kept in sync with Inji Certify's
 * /credential-configurations API, plus the public artefacts a verifier needs to check what Certify signs
 * (JSON-LD contexts, issuer documents, keys).
 */
import {
  buildCertifyConfiguration,
  buildContextDocument,
  buildVelocityTemplate,
  coerceClaims,
  configIdOf,
  CredentialTypeInput,
  IssuerProfileInput,
  publicUrlsFor,
  signingAlgOf,
  type CredentialType,
  type IssuerProfile,
  type SigningAlg,
  vctFor,
} from "@playground/core";
import type { CertifyClient, DidDocument } from "../inji/certify.js";
import { log } from "../log.js";
import type { Store } from "../store/types.js";
import { HttpError } from "../util/http.js";
import { createPublicKey } from "node:crypto";
import { base58btcDecode } from "../reference/keys.js";
import { now, uuid } from "../util/ids.js";

const RESERVED_ISSUER = "certify";

export class StudioError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export class StudioService {
  private didCache?: { at: number; doc: DidDocument };

  constructor(
    private readonly store: Store,
    private readonly certify: CertifyClient,
    private readonly baseUrl: () => string,
  ) {}

  // ---- issuers -------------------------------------------------------------------------------------
  async createIssuer(input: unknown): Promise<IssuerProfile> {
    const p = IssuerProfileInput.parse(input);
    if (p.slug === RESERVED_ISSUER)
      throw new StudioError(409, "reserved_slug", `"${RESERVED_ISSUER}" is reserved for Certify's own keys.`);
    if (await this.store.getIssuer(p.slug))
      throw new StudioError(409, "issuer_exists", `An issuer called "${p.slug}" already exists.`);
    const profile: IssuerProfile = { ...p, id: uuid(), createdAt: now() };
    await this.store.putIssuer(profile);
    return profile;
  }

  async updateIssuer(slug: string, input: unknown): Promise<IssuerProfile> {
    const existing = await this.requireIssuer(slug);
    const p = IssuerProfileInput.parse({ ...existing, ...(input as object), slug });
    const profile = { ...existing, ...p };
    await this.store.putIssuer(profile);
    // Branding and the issuer name live inside each type's Certify config and template, so re-sync them.
    for (const t of await this.store.listTypes(slug)) await this.pushType(t, profile, "update");
    return profile;
  }

  async deleteIssuer(slug: string) {
    for (const t of await this.store.listTypes(slug)) await this.deleteType(t.id);
    await this.store.deleteIssuer(slug);
  }

  async requireIssuer(slug: string) {
    const i = await this.store.getIssuer(slug);
    if (!i) throw new StudioError(404, "issuer_not_found", `No issuer "${slug}".`);
    return i;
  }

  // ---- credential types -----------------------------------------------------------------------------
  /** Preview exactly what would be sent to Certify, without sending it. */
  async preview(input: unknown) {
    const t = CredentialTypeInput.parse(input);
    const issuer = await this.requireIssuer(t.issuerSlug);
    const base = this.baseUrl();
    const urls = publicUrlsFor(base, t);
    return {
      configId: configIdOf(t),
      certifyConfiguration: buildCertifyConfiguration(base, t, issuer),
      template: buildVelocityTemplate(urls, t, issuer),
      context: t.format === "ldp_vc" ? buildContextDocument(base, t) : undefined,
      urls,
    };
  }

  async createType(input: unknown): Promise<{ type: CredentialType; advertised: boolean }> {
    const t = CredentialTypeInput.parse(input);
    const issuer = await this.requireIssuer(t.issuerSlug);
    const configId = configIdOf(t);
    if ((await this.store.listTypes()).some((x) => x.configId === configId))
      throw new StudioError(
        409,
        "type_exists",
        `${issuer.name} already has a ${t.format} type called ${t.typeName}.`,
      );
    const type: CredentialType = {
      ...t,
      id: uuid(),
      configId,
      createdAt: now(),
      syncedBaseUrl: this.baseUrl(),
    };
    await this.pushType(type, issuer, "create");
    await this.store.putType(type);
    return { type, advertised: await this.isAdvertised(configId) };
  }

  async updateType(id: string, input: unknown) {
    const existing = await this.requireType(id);
    const t = CredentialTypeInput.parse({
      ...existing,
      ...(input as object),
      issuerSlug: existing.issuerSlug,
      typeName: existing.typeName,
      format: existing.format,
    });
    const issuer = await this.requireIssuer(t.issuerSlug);
    const type: CredentialType = { ...existing, ...t, syncedBaseUrl: this.baseUrl() };
    await this.pushType(type, issuer, "update");
    await this.store.putType(type);
    return { type, advertised: await this.isAdvertised(type.configId) };
  }

  async deleteType(id: string) {
    const t = await this.requireType(id);
    try {
      await this.certify.deleteConfiguration(t.configId);
    } catch (e) {
      log.warn(
        { err: (e as Error).message, configId: t.configId },
        "Certify delete failed; removing locally anyway",
      );
    }
    await this.store.deleteType(t.id);
  }

  async requireType(id: string) {
    const t = await this.store.getType(id);
    if (!t) throw new StudioError(404, "type_not_found", `No credential type "${id}".`);
    return t;
  }

  private async pushType(t: CredentialType, issuer: IssuerProfile, _mode: "create" | "update") {
    const cfg = buildCertifyConfiguration(this.baseUrl(), t, issuer);
    try {
      // Idempotent: Certify may already hold the config (e.g. our store was reset but Certify's DB was not).
      if (await this.certify.getConfiguration(t.configId)) await this.certify.updateConfiguration(cfg);
      else await this.certify.createConfiguration(cfg);
      this.didCache = undefined;
    } catch (e) {
      if (e instanceof HttpError)
        throw new StudioError(
          502,
          e.code ?? "certify_rejected",
          `Inji Certify rejected the credential configuration: ${e.detail ?? e.code ?? e.status}`,
          e.body,
        );
      throw new StudioError(
        503,
        "certify_unreachable",
        "Inji Certify is not reachable. Is the container running?",
      );
    }
  }

  async isAdvertised(configId: string) {
    try {
      return configId in (await this.certify.metadata()).credential_configurations_supported;
    } catch {
      return false;
    }
  }

  /**
   * Make Certify match our database: re-create types missing in Certify (e.g. after a volume reset) and
   * re-push types whose public URLs were baked with a different PUBLIC_BASE_URL (e.g. a new tunnel).
   */
  async reconcile(): Promise<{ created: string[]; updated: string[]; failed: string[] }> {
    const out = { created: [] as string[], updated: [] as string[], failed: [] as string[] };
    let advertised: Record<string, unknown>;
    try {
      advertised = (await this.certify.metadata()).credential_configurations_supported;
    } catch {
      return out;
    }
    for (const t of await this.store.listTypes()) {
      const issuer = await this.store.getIssuer(t.issuerSlug);
      if (!issuer) continue;
      const missing = !(t.configId in advertised);
      // Also re-sync when the generated vct changed although the host did not (e.g. the vct length rule).
      const vctDrift =
        !missing &&
        t.format === "vc+sd-jwt" &&
        (advertised[t.configId] as { vct?: string }).vct !== vctFor(this.baseUrl(), t);
      const stale = t.syncedBaseUrl !== this.baseUrl() || vctDrift;
      if (!missing && !stale) continue;
      try {
        const next = { ...t, syncedBaseUrl: this.baseUrl() };
        await this.pushType(next, issuer, missing ? "create" : "update");
        await this.store.putType(next);
        (missing ? out.created : out.updated).push(t.configId);
      } catch (e) {
        out.failed.push(t.configId);
        log.warn({ err: (e as Error).message, configId: t.configId }, "reconcile failed");
      }
    }
    return out;
  }

  // ---- issuance -------------------------------------------------------------------------------------
  async createOffer(
    typeId: string,
    rawClaims: Record<string, unknown>,
    opts: { txCode?: string; expiresIn?: number; runId?: string | null } = {},
  ) {
    const t = await this.requireType(typeId);
    const { claims, errors, ok } = coerceClaims(t, rawClaims);
    if (!ok) throw new StudioError(400, "invalid_claims", "Some claims are missing or invalid.", errors);
    if (opts.txCode && !/^[A-Za-z0-9]{4,8}$/.test(opts.txCode))
      throw new StudioError(400, "invalid_tx_code", "The PIN must be 4 to 8 letters or digits.");
    try {
      const offerUri = await this.certify.preAuthorize(
        { configId: t.configId, claims, txCode: opts.txCode, expiresIn: opts.expiresIn },
        opts.runId,
      );
      return { offerUri, type: t };
    } catch (e) {
      if (e instanceof HttpError)
        throw new StudioError(
          502,
          e.code ?? "certify_rejected",
          `Inji Certify refused to create the offer: ${e.detail ?? e.code}`,
          e.body,
        );
      throw e;
    }
  }

  // ---- public artefacts (served under /pub/issuers and /pub/contexts) ------------------------------------
  async contextDocument(issuerSlug: string, typeName: string) {
    const types = await this.store.listTypes(issuerSlug);
    const t =
      types.find((x) => x.typeName === typeName && x.format === "ldp_vc") ??
      types.find((x) => x.typeName === typeName);
    return t ? buildContextDocument(t.syncedBaseUrl, t) : undefined;
  }

  private async certifyDid(): Promise<DidDocument> {
    if (this.didCache && Date.now() - this.didCache.at < 30_000) return this.didCache.doc;
    const doc = await this.certify.didDocument();
    this.didCache = { at: Date.now(), doc };
    return doc;
  }

  /**
   * Certify signs with keys it manages; we republish those public keys under each issuer's identifier.
   * Certify writes `proof.verificationMethod = <didUrl>#<kid>`, so the verification method ids are
   * rewritten onto the issuer's own did:web.
   */
  async issuerDidDocument(slug: string) {
    // "certify" has no stored profile, but over HTTPS Certify's status lists are signed as did:web:…:certify.
    if (slug !== RESERVED_ISSUER && !(await this.store.getIssuer(slug))) return undefined;
    const base = this.baseUrl();
    const did = publicUrlsFor(base, {
      issuerSlug: slug,
      typeName: "X",
      format: "ldp_vc",
      ldpSuite: "Ed25519Signature2020",
      sdJwtAlg: "ES256",
    }).issuerId;
    const certify = await this.certifyDid();
    const vms = (certify.verificationMethod ?? []).map((vm) => ({
      ...vm,
      id: `${did}#${vm.id.split("#").pop()}`,
      controller: did,
    }));
    return {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      id: did,
      alsoKnownAs: [`${base}/pub/issuers/${slug}`],
      verificationMethod: vms,
      assertionMethod: vms.map((v) => v.id),
      authentication: vms.map((v) => v.id),
    };
  }

  /**
   * Plain-HTTP key document for local runs (did:web requires HTTPS). Inji Verify's resolver fetches the
   * verificationMethod URL and expects a single key object, so this returns the key for one algorithm.
   */
  async issuerKey(slug: string, alg: SigningAlg) {
    // "certify" is reserved for Certify's own keys (it signs status-list credentials with them).
    if (slug !== RESERVED_ISSUER && !(await this.store.getIssuer(slug))) return undefined;
    const certify = await this.certifyDid();
    const typeFor: Record<SigningAlg, string[]> = {
      EdDSA: ["Ed25519VerificationKey2020", "Ed25519VerificationKey2018"],
      RS256: ["RsaVerificationKey2018", "JsonWebKey2020"],
      ES256K: ["EcdsaSecp256k1VerificationKey2019"],
      ES256: ["EcdsaSecp256r1VerificationKey2019", "JsonWebKey2020"],
    };
    const vm = (certify.verificationMethod ?? []).find(
      (v) =>
        typeFor[alg].includes(v.type) &&
        (alg !== "ES256" ||
          v.type !== "JsonWebKey2020" ||
          (v.publicKeyJwk as { crv?: string })?.crv === "P-256"),
    );
    if (!vm) return undefined;
    const id = `${this.baseUrl()}/pub/issuers/${slug}/keys/${alg}`;
    // Inji Verify 0.18.2's HTTP key resolver reads `publicKeyPem` whatever the key encoding, so publish
    // the same key as SPKI PEM alongside the original multibase / JWK form.
    return {
      ...vm,
      id,
      controller: `${this.baseUrl()}/pub/issuers/${slug}`,
      publicKeyPem: vm.publicKeyPem ?? toPem(vm),
    };
  }

  async issuerProfileDocument(slug: string) {
    const issuer = await this.store.getIssuer(slug);
    if (!issuer) return undefined;
    const types = await this.store.listTypes(slug);
    return {
      id: `${this.baseUrl()}/pub/issuers/${slug}`,
      name: issuer.name,
      description: issuer.description,
      credentialTypes: types.map((t) => ({
        id: t.configId,
        name: t.displayName,
        format: t.format,
        signingAlg: signingAlgOf(t),
      })),
      issuedBy: "Inji Certify (via the Inji Interoperability Playground)",
    };
  }
}

/** SPKI PEM for a verification method given as publicKeyMultibase (Ed25519) or publicKeyJwk. */
function toPem(vm: {
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}): string | undefined {
  try {
    if (vm.publicKeyJwk)
      return createPublicKey({ key: vm.publicKeyJwk as never, format: "jwk" })
        .export({ type: "spki", format: "pem" })
        .toString();
    if (vm.publicKeyMultibase?.startsWith("z")) {
      const bytes = base58btcDecode(vm.publicKeyMultibase.slice(1));
      if (bytes[0] === 0xed && bytes[1] === 0x01) {
        const x = Buffer.from(bytes.slice(2)).toString("base64url");
        return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" })
          .export({ type: "spki", format: "pem" })
          .toString();
      }
    }
  } catch {
    /* leave PEM out */
  }
  return undefined;
}
