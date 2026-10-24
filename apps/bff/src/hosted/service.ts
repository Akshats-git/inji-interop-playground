/**
 * Hosted Inji environments, declared under `environments` in the parties file (MOSIP's Collab sandbox ships
 * there). The playground runs locally and connects to them:
 *
 * - their issuers are found through Mimoto's issuer list and each issuer's own OpenID4VCI metadata, and appear
 *   in the catalog next to the bundled Certify's types;
 * - their Inji Verify (the 1.0 line on Collab) is a verifier runs can use;
 * - the Reference Wallet signs holders in at their eSignet for the authorization code flow, automatically with a
 *   published demo identity, or by sending the person to eSignet's own page;
 * - their test data (demo identities, the static OTP) is shown wherever a person has to sign in.
 */
import { createPrivateKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { JWK } from "jose";
import jsonld from "jsonld";
import {
  hostedTypeId,
  hostedVerifierId,
  isSdJwtFormat,
  type CatalogField,
  type CatalogType,
  type CredentialFormat,
  type EnvironmentInput,
  type Party,
  type TestIdentity,
  type VerifierInfo,
} from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";
import { log } from "../log.js";
import { makeDocumentLoader } from "../reference/ld.js";
import type { SignIn, WalletClient } from "../reference/wallet/issuance.js";
import { authorizeUrl, signInAutomatically } from "./esignet.js";
import { HostedVerifyClient } from "./verify.js";

/** An issuer of a hosted environment, as discovered. */
export interface HostedIssuer {
  id: string;
  name: string;
  credentialIssuer: string;
  authorizationServer?: string;
  protocol: "1.0" | "draft 13";
  types: CatalogType[];
  /** Why it could not be read, when it could not. */
  error?: string;
  /** Something worth knowing about how it is listed (e.g. Mimoto's stale metadata URL). */
  note?: string;
  /** Found through Mimoto, or named in the parties file. */
  listedBy?: string;
}

interface EnvState {
  issuers: HostedIssuer[];
  refreshedAt?: string;
  mimoto?: { ok: boolean; detail: string };
}

export class HostedError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;
const REFRESH_MS = 15 * 60_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;

async function getJson(url: string, timeoutMs = 15_000): Promise<Json> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return (await res.json()) as Json;
}

const W3C_V2 = "https://www.w3.org/ns/credentials/v2";
const contexts = new Map<string, unknown>();
const loader = makeDocumentLoader(async (url) => {
  if (!contexts.has(url)) contexts.set(url, await getJson(url));
  return contexts.get(url);
});

/** The expanded IRI of a JSON-LD type under the given contexts, which DCQL's type_values need. */
export async function expandType(context: unknown, typeName: string): Promise<string | undefined> {
  try {
    const expanded = (await jsonld.expand(
      { "@context": context, "@id": "urn:x", "@type": typeName },
      { documentLoader: loader },
    )) as { "@type"?: string[] }[];
    const iri = expanded[0]?.["@type"]?.[0];
    return iri && iri !== typeName ? iri : undefined;
  } catch {
    return undefined;
  }
}

/** Claim names and labels from an issuer's metadata: 1.0's credential_metadata.claims, or draft 13's credentialSubject / claims. */
export function claimsOf(config: Json): CatalogField[] {
  const out: CatalogField[] = [];
  const add = (name: string, display?: { name?: string }[]) => {
    if (!name || out.some((f) => f.name === name) || out.length >= 30) return;
    out.push({ name, label: display?.[0]?.name ?? name, kind: "text", selectivelyDisclosable: true });
  };
  const meta = config.credential_metadata as
    { claims?: { path?: unknown[]; display?: { name?: string }[] }[] } | undefined;
  for (const c of meta?.claims ?? [])
    add(String((c.path ?? []).filter((x) => typeof x === "string").pop() ?? ""), c.display);
  const subject = ((config.credential_definition as Json | undefined)?.credentialSubject ?? config.claims) as
    Json | unknown[] | undefined;
  if (Array.isArray(subject))
    for (const c of subject as { path?: unknown[]; display?: { name?: string }[] }[])
      add(String((c.path ?? []).filter((x) => typeof x === "string").pop() ?? ""), c.display);
  else if (subject && typeof subject === "object")
    for (const [k, v] of Object.entries(subject)) add(k, (v as { display?: { name?: string }[] })?.display);
  return out;
}

const displayOf = (config: Json) =>
  ((config.display as { name?: string }[] | undefined) ??
    ((config.credential_metadata as Json | undefined)?.display as { name?: string }[] | undefined))?.[0]
    ?.name;

export class HostedService {
  private state = new Map<string, EnvState>();
  private keys = new Map<string, { jwk?: JWK; problem?: string }>();
  private pending = new Map<
    string,
    { resolve: (code: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private verifyClients = new Map<string, HostedVerifyClient>();
  private timer?: NodeJS.Timeout;

  constructor(
    readonly environments: EnvironmentInput[],
    /** Where the parties file is: key files are relative to it. */
    private readonly dir: string,
    private readonly recorder?: Recorder,
  ) {
    for (const e of environments) {
      this.state.set(e.id, { issuers: [] });
      if (e.verify) this.verifyClients.set(e.id, new HostedVerifyClient(e.verify.url, recorder));
    }
  }

  /** Discover now and every 15 minutes, in the background. */
  start() {
    if (!this.environments.length) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  environment(id: string) {
    return this.environments.find((e) => e.id === id);
  }

  async refresh(): Promise<void> {
    await Promise.all(
      this.environments.map((e) =>
        this.refreshOne(e).catch((err) =>
          log.warn({ env: e.id, err: (err as Error).message }, "hosted environment discovery failed"),
        ),
      ),
    );
  }

  private async refreshOne(e: EnvironmentInput) {
    const st = this.state.get(e.id)!;
    // Issuers named in the parties file, in the shape of a Mimoto entry, then Mimoto's own list.
    let list: Json[] = e.issuers.map((i) => ({
      issuer_id: i.id,
      display: [{ name: i.name }],
      credential_issuer_host: i.credentialIssuer,
      listedBy: "parties file",
    }));
    if (e.mimoto) {
      try {
        const body = await getJson(`${e.mimoto.url.replace(/\/+$/, "")}/v1/mimoto/issuers`);
        let listed = (((body.response as Json | undefined)?.issuers as Json[] | undefined) ?? []).filter(
          (i) =>
            String(i.protocol ?? "").toLowerCase() === "openid4vci" &&
            String(i.enabled ?? "true") !== "false",
        );
        if (e.mimoto.issuers) listed = listed.filter((i) => e.mimoto!.issuers!.includes(String(i.issuer_id)));
        listed = listed.filter(
          (i) =>
            !e.mimoto!.exclude.includes(String(i.issuer_id)) &&
            !list.some((x) => x.issuer_id === i.issuer_id),
        );
        st.mimoto = {
          ok: true,
          detail: `${listed.length} OpenID4VCI issuers listed by Mimoto${e.mimoto.exclude.length ? ` (${e.mimoto.exclude.length} left out by the parties file)` : ""}`,
        };
        list = [...list, ...listed.map((i) => ({ ...i, listedBy: "Mimoto" }))];
      } catch (err) {
        st.mimoto = {
          ok: false,
          detail: `Mimoto's issuer list could not be read: ${(err as Error).message}`,
        };
      }
    }
    if (!list.length) return;
    const issuers = await Promise.all(list.map((i) => this.readIssuer(e, i)));
    // Issuers the parties file names come first (Collab's mock issuer, the one the PS2 brief points at), then Mimoto's.
    st.issuers = issuers.sort(
      (a, b) =>
        Number(a.listedBy !== "parties file") - Number(b.listedBy !== "parties file") ||
        a.name.localeCompare(b.name),
    );
    st.refreshedAt = new Date().toISOString();
    log.info(
      { env: e.id, issuers: issuers.length, types: issuers.reduce((n, i) => n + i.types.length, 0) },
      "hosted environment discovered",
    );
  }

  private async readIssuer(e: EnvironmentInput, entry: Json): Promise<HostedIssuer> {
    const id = String(entry.issuer_id);
    const name = String((entry.display as { name?: string }[] | undefined)?.[0]?.name ?? id);
    const specLocation = `${String(entry.credential_issuer_host).replace(/\/+$/, "")}/.well-known/openid-credential-issuer`;
    const listed = typeof entry.wellknown_endpoint === "string" ? entry.wellknown_endpoint : undefined;
    try {
      // Mimoto stores each issuer's metadata URL; when that fails, the OpenID4VCI location is the fallback.
      let metadata: Json;
      let note: string | undefined;
      try {
        metadata = await getJson(listed ?? specLocation);
      } catch (err) {
        if (!listed || listed === specLocation) throw err;
        metadata = await getJson(specLocation);
        note = `Mimoto lists its metadata at ${listed}, which fails (${(err as Error).message.replace(/^.* answered /, "")}); the OpenID4VCI location ${specLocation} works.`;
      }
      const credentialIssuer = String(metadata.credential_issuer ?? entry.credential_issuer_host);
      const authorizationServer = (metadata.authorization_servers as string[] | undefined)?.[0];
      const protocol = typeof metadata.nonce_endpoint === "string" ? "1.0" : "draft 13";
      const autoLogin = Boolean(authorizationServer && this.clientFor(e.id, authorizationServer));
      const configs = Object.entries(
        (metadata.credential_configurations_supported as Record<string, Json> | undefined) ?? {},
      );
      const types = await Promise.all(
        configs.map(async ([configId, c]): Promise<CatalogType> => {
          const format = String(c.format) as CredentialFormat;
          const def = (c.credential_definition ?? {}) as { type?: string[]; "@context"?: string[] };
          const typeName = def.type?.find((t) => t !== "VerifiableCredential");
          const dataModel =
            format === "ldp_vc" ? (def["@context"]?.includes(W3C_V2) ? "2.0" : "1.1") : undefined;
          const algs = ((c.credential_signing_alg_values_supported as string[] | undefined) ?? []).join(", ");
          const base = displayOf(c) ?? configId;
          const suffix =
            format === "ldp_vc"
              ? ` (VCDM ${dataModel})`
              : isSdJwtFormat(format)
                ? " (SD-JWT)"
                : format === "mso_mdoc"
                  ? " (mDoc)"
                  : "";
          return {
            id: hostedTypeId(e.id, id, configId),
            origin: "hosted",
            issuerId: id,
            issuerName: name,
            displayName: base.toLowerCase().includes(suffix.trim().slice(1, -1).toLowerCase())
              ? base
              : `${base}${suffix}`,
            description: `${name}, an Inji Certify issuer on ${e.name} (OpenID4VCI ${protocol}). The holder signs in at ${authorizationServer ? new URL(authorizationServer).host : "the issuer"}; the claims come from that identity.`,
            format,
            dataModel,
            typeName,
            typeIri:
              format === "ldp_vc" && typeName ? await expandType(def["@context"], typeName) : undefined,
            vct: isSdJwtFormat(format) ? String(c.vct ?? "") || undefined : undefined,
            proof:
              format === "ldp_vc"
                ? /signature|20\d\d/i.test(algs)
                  ? algs
                  : `Data integrity (${algs || "issuer's choice"})`
                : isSdJwtFormat(format)
                  ? `SD-JWT ${algs || "issuer's choice"}`
                  : `mDoc ${algs || ""}`.trim(),
            fields: claimsOf(c),
            canIssue: autoLogin,
            configurationId: configId,
            hosted: {
              environmentId: e.id,
              environmentName: e.name,
              credentialIssuer,
              scope: c.scope ? String(c.scope) : undefined,
              authorizationServer,
              protocol,
              autoLogin,
              claimsFromIdentity: true,
            },
          };
        }),
      );
      return {
        id,
        name,
        credentialIssuer,
        authorizationServer,
        protocol,
        types,
        note,
        listedBy: String(entry.listedBy ?? "Mimoto"),
      };
    } catch (err) {
      return {
        id,
        name,
        credentialIssuer: String(entry.credential_issuer_host ?? ""),
        protocol: "draft 13",
        types: [],
        error: (err as Error).message,
      };
    }
  }

  // --- registry --------------------------------------------------------------------------------------------

  issuers(envId: string): HostedIssuer[] {
    return this.state.get(envId)?.issuers ?? [];
  }

  catalog(): CatalogType[] {
    return [...this.state.values()].flatMap((s) => s.issuers.flatMap((i) => i.types));
  }

  findType(id: string): CatalogType | undefined {
    return this.catalog().find((t) => t.id === id);
  }

  verifiers(): VerifierInfo[] {
    return this.environments
      .filter((e) => e.verify)
      .map((e) => ({
        id: hostedVerifierId(e.id),
        label: e.verify!.name ?? `Inji Verify${e.verify!.version ? ` ${e.verify!.version}` : ""} (${e.name})`,
        origin: "hosted" as const,
        environmentId: e.id,
        accepts: e.verify!.queryLanguages,
        ownQuery: false,
        formats: e.verify!.formats,
        note: `Hosted by ${e.name}. Accepts ${e.verify!.queryLanguages.map((q) => (q === "dcql" ? "DCQL" : "Presentation Exchange")).join(" and ")} only.`,
        description: `MOSIP's verifier service${e.verify!.version ? ` ${e.verify!.version}` : ""}, deployed on ${e.name} and reached over the internet at ${new URL(e.verify!.url).host}.`,
        software: `Inji Verify${e.verify!.version ? ` ${e.verify!.version}` : ""} (${e.name})`,
        homepage: e.homepage,
        supportsDirectShare: true,
      }));
  }

  /** The hosted verifier behind a verifier id, with its API client. */
  verifier(
    id: string,
  ): { env: EnvironmentInput; info: VerifierInfo; client: HostedVerifyClient } | undefined {
    const info = this.verifiers().find((v) => v.id === id);
    const env = info && this.environment(info.environmentId!);
    const client = env && this.verifyClients.get(env.id);
    return info && env && client ? { env, info, client } : undefined;
  }

  /** Lanes for the inspector: which hosted party a URL belongs to. */
  partyOf(url: string): Party | undefined {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return undefined;
    }
    for (const e of this.environments) {
      if (e.verify && new URL(e.verify.url).host === host) return "hosted-verify";
      for (const i of this.issuers(e.id)) {
        if (i.authorizationServer && new URL(i.authorizationServer).host === host) return "esignet";
        if (i.credentialIssuer && new URL(i.credentialIssuer).host === host) return "hosted-certify";
      }
      if (e.client?.authorizationServers.some((a) => new URL(a).host === host)) return "esignet";
    }
    return undefined;
  }

  // --- signing in ------------------------------------------------------------------------------------------

  /** The private key of an environment's OAuth client, read once from the file the parties file names. */
  private key(e: EnvironmentInput): { jwk?: JWK; problem?: string } {
    if (!e.client) return { problem: "No OAuth client is configured for this environment." };
    const cached = this.keys.get(e.id);
    if (cached?.jwk) return cached;
    const file = isAbsolute(e.client.privateKeyFile)
      ? e.client.privateKeyFile
      : resolve(this.dir, e.client.privateKeyFile);
    let k: { jwk?: JWK; problem?: string };
    try {
      k = existsSync(file)
        ? { jwk: createPrivateKey(readFileSync(file, "utf8")).export({ format: "jwk" }) as JWK }
        : {
            problem: `The client key ${e.client.privateKeyFile} has not been fetched yet (./playground.sh up does it).`,
          };
    } catch (err) {
      k = { problem: `The client key could not be read: ${(err as Error).message}` };
    }
    this.keys.set(e.id, k);
    return k;
  }

  /** The OAuth client the Reference Wallet can use at this authorization server, if it is registered there. */
  clientFor(envId: string, authorizationServer: string): WalletClient | undefined {
    const e = this.environment(envId);
    if (!e?.client || !e.client.authorizationServers.some((a) => sameOrigin(a, authorizationServer)))
      return undefined;
    const { jwk } = this.key(e);
    return jwk
      ? { clientId: e.client.clientId, redirectUri: e.client.redirectUri, privateJwk: jwk }
      : undefined;
  }

  clientProblem(envId: string): string | undefined {
    const e = this.environment(envId);
    return e ? this.key(e).problem : "Unknown environment.";
  }

  /** Demo identities that can sign in at this authorization server. */
  identities(envId: string, authorizationServer?: string): TestIdentity[] {
    const e = this.environment(envId);
    return (e?.testData.identities ?? []).filter(
      (i) =>
        !i.authorizationServers ||
        !authorizationServer ||
        i.authorizationServers.some((a) => sameOrigin(a, authorizationServer)),
    );
  }

  /** Sign in without a person: a demo identity and the environment's static OTP, through eSignet's own API. */
  async signInAutomatically(
    envId: string,
    p: SignIn,
    opts: { individualId?: string; runId?: string | null },
  ): Promise<string> {
    const e = this.environment(envId);
    const client = this.clientFor(envId, p.authorizationServer);
    if (!e || !client)
      throw new HostedError(
        "no_client",
        `The Reference Wallet has no OAuth client at ${p.authorizationServer}. ${this.clientProblem(envId) ?? "Its client is registered only at the servers listed in the parties file."}`,
      );
    if (!e.testData.otp)
      throw new HostedError(
        "no_test_otp",
        `${e.name} publishes no static test OTP in the parties file, so the wallet cannot sign in by itself. Sign in yourself instead.`,
      );
    const individualId = opts.individualId ?? this.identities(envId, p.authorizationServer)[0]?.id;
    if (!individualId)
      throw new HostedError(
        "no_identity",
        `No demo identity for ${p.authorizationServer} in the parties file.`,
      );
    return signInAutomatically(
      p.authorizationServer,
      {
        clientId: client.clientId,
        redirectUri: client.redirectUri,
        scope: p.scope,
        state: p.state,
        nonce: p.nonce,
        codeChallenge: p.codeChallenge,
        acrValues: e.client!.acrValues,
        individualId,
        otp: e.testData.otp,
      },
      { recorder: this.recorder, runId: opts.runId },
    );
  }

  /**
   * Sign in with a person: returns eSignet's login page for them to open, and a promise of the authorization code
   * that resolves when eSignet sends their browser back to the redirect URI (see completeInteractive).
   */
  startInteractive(envId: string, p: SignIn): { url: string; code: Promise<string> } {
    const e = this.environment(envId);
    const client = this.clientFor(envId, p.authorizationServer);
    if (!e || !client)
      throw new HostedError(
        "no_client",
        `The Reference Wallet has no OAuth client at ${p.authorizationServer}. ${this.clientProblem(envId) ?? ""}`.trim(),
      );
    const url = authorizeUrl({
      authorizationEndpoint: p.authorizationEndpoint,
      clientId: client.clientId,
      redirectUri: client.redirectUri,
      scope: p.scope,
      state: p.state,
      nonce: p.nonce,
      codeChallenge: p.codeChallenge,
      acrValues: e.client!.acrValues,
    });
    const code = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(p.state);
        reject(new HostedError("timeout", "Nobody signed in at eSignet within 10 minutes."));
      }, LOGIN_TIMEOUT_MS);
      timer.unref();
      this.pending.set(p.state, { resolve, reject, timer });
    });
    return { url, code };
  }

  /** eSignet sent the browser back: hand the code (or the error) to the waiting sign-in. */
  completeInteractive(
    state: string,
    answer: { code?: string; error?: string; description?: string },
  ): boolean {
    const p = this.pending.get(state);
    if (!p) return false;
    this.pending.delete(state);
    clearTimeout(p.timer);
    if (answer.code) p.resolve(answer.code);
    else
      p.reject(
        new HostedError(
          answer.error ?? "access_denied",
          `eSignet did not sign the holder in: ${answer.error ?? "no code"}${answer.description ? ` (${answer.description})` : ""}.`,
        ),
      );
    return true;
  }

  cancelInteractive(state: string) {
    this.completeInteractive(state, { error: "cancelled", description: "the run was cancelled" });
  }

  private jwks = new Map<string, { at: number; keys: JWK[] }>();

  /**
   * Keys of the environments' issuers, for the Reference Verifier's SD-JWT trust registry. An environment is in the
   * parties file because its operator trusts it; the keys come from each Inji Certify's published JWKS over HTTPS.
   */
  async trustedJwks(): Promise<JWK[]> {
    const out: JWK[] = [];
    for (const e of this.environments)
      for (const i of this.issuers(e.id)) {
        if (!i.credentialIssuer.startsWith("https://")) continue;
        const url = `${new URL(i.credentialIssuer).origin}/v1/certify/.well-known/jwks.json`;
        const hit = this.jwks.get(url);
        if (hit && Date.now() - hit.at < 10 * 60_000) {
          out.push(...hit.keys);
          continue;
        }
        try {
          const keys = ((await getJson(url, 8000)).keys as JWK[] | undefined) ?? [];
          this.jwks.set(url, { at: Date.now(), keys });
          out.push(...keys);
        } catch {
          /* an issuer without a reachable JWKS is simply not trusted for SD-JWT */
        }
      }
    return out;
  }

  // --- status ----------------------------------------------------------------------------------------------

  private healthCache?: { at: number; value: Record<string, { ok: boolean; detail: string }> };

  /** Reachability of each environment's Mimoto and Inji Verify, cached for a minute (the status bar polls it). */
  async health(): Promise<Record<string, { ok: boolean; detail: string }>> {
    if (this.healthCache && Date.now() - this.healthCache.at < 60_000) return this.healthCache.value;
    const out: Record<string, { ok: boolean; detail: string }> = {};
    for (const e of this.environments) {
      const st = this.state.get(e.id)!;
      if (e.mimoto) out[`hosted:${e.id}:mimoto`] = st.mimoto ?? { ok: false, detail: "Not read yet." };
      const v = this.verifyClients.get(e.id);
      if (v) out[`hosted:${e.id}:verify`] = await v.reachable();
    }
    this.healthCache = { at: Date.now(), value: out };
    return out;
  }

  /** Everything the UI shows about the environments (no keys). */
  summary() {
    return this.environments.map((e) => {
      const st = this.state.get(e.id)!;
      const problem = this.key(e).problem;
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        homepage: e.homepage,
        version: e.version,
        mimoto: e.mimoto && { url: e.mimoto.url, ...st.mimoto },
        refreshedAt: st.refreshedAt,
        issuers: st.issuers.map((i) => ({
          id: i.id,
          name: i.name,
          credentialIssuer: i.credentialIssuer,
          authorizationServer: i.authorizationServer,
          protocol: i.protocol,
          listedBy: i.listedBy,
          note: i.note,
          error: i.error,
          types: i.types,
        })),
        verifier: e.verify ? this.verifiers().find((v) => v.environmentId === e.id) : undefined,
        client: e.client && {
          clientId: e.client.clientId,
          redirectUri: e.client.redirectUri,
          authorizationServers: e.client.authorizationServers,
          ready: !problem,
          problem,
        },
        testData: e.testData,
      };
    });
  }
}

function sameOrigin(a: string, b: string) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
