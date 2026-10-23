/**
 * Reference Wallet, presentation side: an OpenID4VP client (direct_post) that answers both
 * Presentation Exchange (drafts 21–23) and DCQL (1.0) requests, for W3C JSON-LD and SD-JWT VC credentials.
 *
 * Tamper presets inject deliberate faults so the playground can check that verifiers fail correctly.
 */
import { createHash, randomBytes } from "node:crypto";
import { compactVerify, decodeProtectedHeader, importJWK, SignJWT, type JWK } from "jose";
import * as vc from "@digitalbazaar/vc";
import { Ed25519Signature2020 } from "@digitalbazaar/ed25519-signature-2020";
import { Ed25519VerificationKey2020 } from "@digitalbazaar/ed25519-verification-key-2020";
import { decodeJwt, decodeSdJwt, filterMatches, isSdJwtFormat, jsonPath, parseAuthorizationRequest, type DcqlQuery, type PresentationDefinition, type TamperPreset } from "@playground/core";
import { base58btcDecode, ed25519Multibase, fromJwks, newHolderKey, privateKeyOf, type HolderKey } from "../keys.js";
import { makeDocumentLoader } from "../ld.js";
import { credentialClaims } from "./issuance.js";
import type { WalletHttp } from "./http.js";
import { selfSignedCert } from "./x509.js";
export interface WalletCredential {
  id: string;
  format: string;
  credential: unknown;
  holder: { kind: "ed25519" | "p256"; privateJwk: JWK; publicJwk: JWK };
}

export interface AuthorizationRequest {
  clientId: string;
  clientIdScheme: string;
  nonce: string;
  state?: string;
  responseUri: string;
  responseMode: string;
  presentationDefinition?: PresentationDefinition;
  dcqlQuery?: DcqlQuery;
  /** How the request reached us, for the report. */
  transport: "by_value" | "request_uri";
  signed?: { alg: string; kid?: string; verified: boolean | "skipped"; note?: string };
  raw: Record<string, unknown>;
}

export class PresentationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve an openid4vp:// URI (or bare query) to the request parameters, fetching request_uri if present. */
export async function resolveRequest(http: WalletHttp, uri: string, resolveDid: (did: string) => Promise<Record<string, unknown>>): Promise<AuthorizationRequest> {
  const params = parseAuthorizationRequest(uri);
  if (!params) throw new PresentationError("invalid_request", "Not an OpenID4VP authorization request URI.");
  let p: Record<string, unknown> = { ...params };
  let transport: AuthorizationRequest["transport"] = "by_value";
  let signed: AuthorizationRequest["signed"];
  if (params.request_uri) {
    transport = "request_uri";
    const { text } = await http.getText(params.request_uri);
    const jwt = decodeJwt(text.trim());
    if (jwt) {
      p = { ...params, ...jwt.payload };
      signed = { alg: String(jwt.header.alg), kid: jwt.header.kid as string | undefined, verified: "skipped" };
      try {
        signed.verified = await verifyRequestObject(text.trim(), String(p.client_id ?? ""), resolveDid);
      } catch (e) {
        signed.verified = false;
        signed.note = (e as Error).message;
      }
    } else {
      try {
        p = { ...params, ...JSON.parse(text) };
      } catch {
        throw new PresentationError("invalid_request_object", "request_uri returned neither a JWT nor JSON.");
      }
    }
  }
  const parseMaybe = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);
  let presentationDefinition = parseMaybe(p.presentation_definition) as PresentationDefinition | undefined;
  if (!presentationDefinition && typeof p.presentation_definition_uri === "string") presentationDefinition = (await http.getJson(p.presentation_definition_uri)) as PresentationDefinition;
  const dcqlQuery = parseMaybe(p.dcql_query) as DcqlQuery | undefined;
  if (!presentationDefinition && !dcqlQuery) throw new PresentationError("invalid_request", "The request has neither presentation_definition nor dcql_query.");
  const clientId = String(p.client_id ?? "");
  const responseUri = String(p.response_uri ?? p.redirect_uri ?? "");
  if (!responseUri) throw new PresentationError("invalid_request", "The request has no response_uri.");
  return {
    clientId,
    clientIdScheme: String(p.client_id_scheme ?? (clientId.startsWith("did:") ? "did" : clientId.includes(":") ? clientId.split(":")[0] : "pre-registered")),
    nonce: String(p.nonce ?? ""),
    state: p.state as string | undefined,
    responseUri,
    responseMode: String(p.response_mode ?? "direct_post"),
    presentationDefinition,
    dcqlQuery,
    transport,
    signed,
    raw: p,
  };
}

/** The DID inside a client id, with or without OpenID4VP 1.0's "decentralized_identifier:" prefix. */
export const didOfClientId = (clientId: string) => clientId.replace(/^decentralized_identifier:/, "");

/** Check a signed request object against the verifier's DID (did:web / did:key / did:jwk). */
async function verifyRequestObject(jwt: string, clientId: string, resolveDid: (did: string) => Promise<Record<string, unknown>>): Promise<boolean> {
  const header = decodeProtectedHeader(jwt);
  const kid = didOfClientId(String(header.kid ?? ""));
  const did = (kid || didOfClientId(clientId)).split("#")[0]!;
  if (!did.startsWith("did:")) return false;
  const doc = await resolveDid(did);
  const vms = (doc.verificationMethod as Record<string, unknown>[]) ?? [];
  const vm = vms.find((v) => v.id === kid || String(v.id).endsWith(`#${kid.split("#")[1]}`)) ?? vms[0];
  if (!vm) return false;
  let jwk = vm.publicKeyJwk as JWK | undefined;
  if (!jwk && typeof vm.publicKeyMultibase === "string") jwk = multibaseToJwk(vm.publicKeyMultibase);
  if (!jwk) return false;
  await compactVerify(jwt, await importJWK(jwk, String(header.alg)));
  return true;
}

function multibaseToJwk(mb: string): JWK | undefined {
  const bytes = base58btcDecode(mb.slice(1));
  if (bytes[0] === 0xed && bytes[1] === 0x01) return { kty: "OKP", crv: "Ed25519", x: Buffer.from(bytes.slice(2)).toString("base64url") };
  return undefined;
}

export interface Match {
  credential: WalletCredential;
  /** PE input descriptor id or DCQL credential query id. */
  queryId: string;
  /** Claim names the verifier asked for (SD-JWT disclosures to reveal). Empty = everything. */
  requested: string[];
  explanation: string;
}

function sdJwtView(cred: string): Record<string, unknown> {
  const d = decodeSdJwt(cred);
  return d ? { ...credentialClaims("vc+sd-jwt", cred), vct: d.issuerJwt.payload.vct } : {};
}

/** Pick credentials that satisfy the request. */
export function match(req: AuthorizationRequest, held: WalletCredential[]): Match[] {
  if (req.dcqlQuery) {
    const out: Match[] = [];
    for (const q of req.dcqlQuery.credentials) {
      const candidates = held.filter((h) => (isSdJwtFormat(q.format) ? isSdJwtFormat(h.format) : h.format === q.format));
      const found = candidates.find((h) => {
        if (q.meta?.vct_values) return q.meta.vct_values.includes(String(sdJwtView(h.credential as string).vct));
        if (q.meta?.type_values) {
          const types = ((h.credential as Record<string, unknown>).type as string[]) ?? [];
          // type_values hold expanded IRIs; compare by IRI or by the term's local name.
          return q.meta.type_values.some((set) => set.every((iri) => types.some((t) => iri === t || iri.endsWith(`#${t}`) || iri.endsWith(`/${t}`))));
        }
        return true;
      });
      if (found)
        out.push({
          credential: found,
          queryId: q.id,
          requested: (q.claims ?? []).map((c) => String(c.path[c.path.length - 1])),
          explanation: `DCQL credential query "${q.id}" (${q.format}) matched by ${q.meta?.vct_values ? "vct" : q.meta?.type_values ? "type" : "format"}.`,
        });
    }
    return out;
  }
  const pd = req.presentationDefinition!;
  const out: Match[] = [];
  for (const d of pd.input_descriptors) {
    const formats = Object.keys(d.format ?? pd.format ?? {});
    const found = held.find((h) => {
      // vc+sd-jwt and dc+sd-jwt are the same credential under two media types (drafts vs. Inji 1.0), so either matches.
      if (formats.length && !formats.includes(h.format) && !(isSdJwtFormat(h.format) && formats.some(isSdJwtFormat))) return false;
      const view = h.format === "ldp_vc" ? h.credential : sdJwtView(h.credential as string);
      return d.constraints.fields.every((f) => f.optional || f.path.some((p) => filterMatches(f.filter, jsonPath(view, p))));
    });
    if (found)
      out.push({
        credential: found,
        queryId: d.id,
        requested: d.constraints.fields.filter((f) => !f.filter).map((f) => f.path[0]!.split(".").pop()!),
        explanation: `Input descriptor "${d.id}" matched: every constraint field resolved and passed its filter.`,
      });
  }
  return out;
}

/**
 * Sign a W3C VP with Ed25519Signature2020 over the verifier's nonce (challenge) and client_id (domain).
 *
 * JSON-LD is canonicalised strictly ("safe mode": every term must be defined). Some issuers' credentials are not
 * valid that way, e.g. an Ed25519Signature2020 proof without its suite context (gap G15, seen on the bundled
 * Certify's defaults and on MOSIP Collab's issuers). Rather than stop, the wallet then signs leniently, as Inji's
 * own processors do, and says so, so the run shows what the verifier makes of it.
 */
async function signLdpPresentation(http: WalletHttp, credential: Record<string, unknown>, holder: HolderKey, challenge: string, domain: string): Promise<{ vp: unknown; lenient: boolean }> {
  try {
    return { vp: await signLdpPresentationWith(http, credential, holder, challenge, domain, false), lenient: false };
  } catch (e) {
    if (!/safe mode/i.test((e as Error).message)) throw e;
    return { vp: await signLdpPresentationWith(http, credential, holder, challenge, domain, true), lenient: true };
  }
}

async function signLdpPresentationWith(http: WalletHttp, credential: Record<string, unknown>, holder: HolderKey, challenge: string, domain: string, lenient: boolean) {
  const { publicKeyMultibase, privateKeyMultibase } = ed25519Multibase(holder);
  const key = await Ed25519VerificationKey2020.from({ id: holder.kid, controller: holder.did, type: "Ed25519VerificationKey2020", publicKeyMultibase, privateKeyMultibase });
  const suite = new Ed25519Signature2020({ key });
  // jsonld-signatures spreads canonizeOptions after its own safe: true, so this is its supported override.
  if (lenient) suite.canonizeOptions = { safe: false };
  const v2 = ((credential["@context"] as string[]) ?? [])[0] === "https://www.w3.org/ns/credentials/v2";
  const presentation = {
    "@context": [v2 ? "https://www.w3.org/ns/credentials/v2" : "https://www.w3.org/2018/credentials/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
    type: ["VerifiablePresentation"],
    holder: holder.did,
    verifiableCredential: [credential],
  };
  const documentLoader = makeDocumentLoader((url) => http.getJson(url));
  return vc.signPresentation({ presentation, suite, challenge, domain, documentLoader });
}

/** Holder-selected SD-JWT presentation: chosen disclosures plus a key-binding JWT over nonce and aud. */
async function sdJwtPresentation(cred: string, holder: HolderKey, requested: string[], aud: string, nonce: string) {
  const d = decodeSdJwt(cred);
  if (!d) throw new PresentationError("invalid_credential", "Held SD-JWT could not be parsed.");
  const keep = d.disclosures.filter((x) => !requested.length || (x.name && requested.includes(x.name)));
  const presented = [d.issuerJwtRaw, ...keep.map((x) => x.raw)].join("~") + "~";
  const sdHash = createHash("sha256").update(presented).digest("base64url");
  // The holder key is the one in cnf, so the spec needs no kid here. walt.id's verifier 1.0 refuses a KB-JWT
  // without one (gap G31), and naming the key costs nothing, so say which key it is.
  const cnf = d.issuerJwt.payload.cnf as { jwk?: { kid?: string }; kid?: string } | undefined;
  const kid = cnf?.jwk?.kid ?? cnf?.kid ?? holder.kid;
  const kb = await new SignJWT({ nonce, aud, sd_hash: sdHash })
    .setProtectedHeader({ alg: holder.alg, typ: "kb+jwt", kid })
    .setIssuedAt()
    .sign(await privateKeyOf(holder));
  return { token: presented + kb, disclosed: keep.map((x) => x.name ?? "?"), withheld: d.disclosures.filter((x) => !keep.includes(x)).map((x) => x.name ?? "?") };
}

export interface PresentationOutcome {
  request: AuthorizationRequest;
  matches: Match[];
  /** Things the wallet had to accommodate, for the run's notes (e.g. signing leniently). */
  notes: string[];
  disclosed?: string[];
  withheld?: string[];
  verifierResponse: unknown;
  status: number;
  tamper: TamperPreset;
}

export async function present(http: WalletHttp, req: AuthorizationRequest, held: WalletCredential[], tamper: TamperPreset = "none"): Promise<PresentationOutcome> {
  const matches = match(req, held);
  if (!matches.length) {
    // Tell the verifier, as OpenID4VP §7.5 suggests, instead of leaving it waiting.
    const response = await http.postForm(req.responseUri, { error: "access_denied", error_description: "No credential in the Reference Wallet matches the request.", ...(req.state ? { state: req.state } : {}) }).catch((e) => e);
    throw Object.assign(new PresentationError("no_matching_credential", "No held credential matches the verifier's request."), { response });
  }
  const nonce = tamper === "wrong-nonce" ? randomBytes(12).toString("base64url") : req.nonce;
  const tokens: { id: string; token: unknown; format: string }[] = [];
  const notes: string[] = [];
  let disclosed: string[] | undefined;
  let withheld: string[] | undefined;

  for (const m of matches) {
    let holder = fromJwks(m.credential.holder.kind, m.credential.holder.privateJwk, m.credential.holder.publicJwk);
    if (tamper === "foreign-holder") holder = await newHolderKey(holder.kind);
    if (m.credential.format === "ldp_vc") {
      const credential = structuredClone(m.credential.credential) as Record<string, unknown>;
      if (tamper === "alter-claim") alterFirstClaim(credential.credentialSubject as Record<string, unknown>);
      const vp = tamper === "no-holder-proof"
        ? { "@context": ["https://www.w3.org/2018/credentials/v1"], type: ["VerifiablePresentation"], holder: holder.did, verifiableCredential: [credential] }
        : await signLdpPresentation(http, credential, holder, nonce, req.clientId).then((r) => {
            if (r.lenient) notes.push("The credential is not valid JSON-LD in strict (safe) mode: its proof uses terms its @context does not define (gap G15). The wallet signed the presentation in lenient mode, as Inji's processors do.");
            return r.vp;
          });
      tokens.push({ id: m.queryId, token: vp, format: "ldp_vp" });
    } else {
      let cred = String(m.credential.credential);
      if (tamper === "alter-claim") cred = alterSdJwtDisclosure(cred, m.requested);
      if (tamper === "self-signed-sdjwt") cred = await forgeSdJwt(cred);
      if (tamper === "no-holder-proof") {
        const d = decodeSdJwt(cred)!;
        const keep = d.disclosures.filter((x) => !m.requested.length || (x.name && m.requested.includes(x.name)));
        tokens.push({ id: m.queryId, token: [d.issuerJwtRaw, ...keep.map((x) => x.raw)].join("~") + "~", format: "vc+sd-jwt" });
        continue;
      }
      const p = await sdJwtPresentation(cred, holder, m.requested, req.clientId, nonce);
      disclosed = p.disclosed;
      withheld = p.withheld;
      tokens.push({ id: m.queryId, token: p.token, format: m.credential.format });
    }
  }

  const form: Record<string, string> = {};
  if (req.dcqlQuery) {
    form.vp_token = JSON.stringify(Object.fromEntries(tokens.map((t) => [t.id, [t.token]])));
  } else {
    const single = tokens.length === 1;
    const vpToken = single ? tokens[0]!.token : tokens.map((t) => t.token);
    form.vp_token = typeof vpToken === "string" ? vpToken : JSON.stringify(vpToken);
    form.presentation_submission = JSON.stringify({
      id: `submission-${randomBytes(6).toString("hex")}`,
      definition_id: req.presentationDefinition!.id,
      descriptor_map: tokens.map((t, i) => ({
        id: t.id,
        format: t.format,
        path: single ? "$" : `$[${i}]`,
        ...(t.format === "ldp_vp" ? { path_nested: { id: t.id, format: "ldp_vc", path: `${single ? "$" : `$[${i}]`}.verifiableCredential[0]` } } : {}),
      })),
    });
  }
  if (req.state) form.state = req.state;

  let status = 200;
  let verifierResponse: unknown;
  try {
    verifierResponse = await http.postForm(req.responseUri, form);
  } catch (e) {
    const err = e as { status?: number; body?: unknown };
    status = err.status ?? 0;
    verifierResponse = err.body ?? String(e);
  }
  return { request: req, matches, notes, disclosed, withheld, verifierResponse, status, tamper };
}

function alterFirstClaim(subject: Record<string, unknown>) {
  const key = Object.keys(subject).find((k) => k !== "id");
  if (!key) return;
  const v = subject[key];
  subject[key] = typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : `${String(v)} (altered)`;
}

/**
 * Replace the value of a disclosure the wallet is about to reveal (a requested claim when there is one);
 * its digest no longer appears in the issuer-signed `_sd` array.
 */
function alterSdJwtDisclosure(cred: string, requested: string[]) {
  const parts = cred.split("~");
  for (let i = 1; i < parts.length; i++) {
    try {
      const arr = JSON.parse(Buffer.from(parts[i]!, "base64url").toString("utf8"));
      if (Array.isArray(arr) && arr.length === 3 && (!requested.length || requested.includes(String(arr[1])))) {
        arr[2] = typeof arr[2] === "string" ? `${arr[2]} (altered)` : 0;
        parts[i] = Buffer.from(JSON.stringify(arr)).toString("base64url");
        return parts.join("~");
      }
    } catch {
      /* skip */
    }
  }
  return cred;
}

/**
 * Re-sign the issuer JWT with an attacker key and put the attacker's own self-signed certificate in x5c.
 * A verifier that trusts whatever certificate the token carries, without a trust anchor, will accept it.
 */
async function forgeSdJwt(cred: string) {
  const d = decodeSdJwt(cred)!;
  const { privateKey, certB64 } = await selfSignedCert("CN=www.example.com (ROOT)");
  const payload = { ...d.issuerJwt.payload, issuer_name: "Forged Issuer" };
  const jwt = await new SignJWT(payload).setProtectedHeader({ alg: "ES256", typ: String(d.issuerJwt.header.typ ?? "vc+sd-jwt"), x5c: [certB64] }).sign(privateKey);
  return [jwt, ...d.disclosures.map((x) => x.raw)].join("~") + "~";
}

