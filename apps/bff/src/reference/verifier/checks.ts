/**
 * Reference Verifier: credential and presentation checks, built on independent libraries.
 *
 * Trust policy (stricter than "whatever key the token carries"):
 *  - W3C ldp_vc: the proof's verificationMethod must resolve to a key whose controller is the credential's
 *    issuer (did:web / did:key / did:jwk, or a URL key document for plain-HTTP local runs).
 *  - SD-JWT VC: the issuer key must come from a trusted issuer registry (the issuer JWKS the playground
 *    trusts). An x5c certificate is only accepted if its public key is in that registry.
 */
import { createHash, X509Certificate } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { calculateJwkThumbprint, compactVerify, decodeProtectedHeader, importJWK, type JWK } from "jose";
import * as vc from "@digitalbazaar/vc";
import { Ed25519Signature2020 } from "@digitalbazaar/ed25519-signature-2020";
import { b64urlToBytes, decodeSdJwt } from "@playground/core";
import { makeDocumentLoader } from "../ld.js";
import { resolveLocalDid } from "../keys.js";

export interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface CredentialVerdict {
  format: string;
  ok: boolean;
  status: "SUCCESS" | "INVALID" | "EXPIRED" | "REVOKED";
  checks: Check[];
  claims: Record<string, unknown>;
  errorCode?: string;
}

export interface VerifierContext {
  fetchJson: (url: string) => Promise<unknown>;
  /** did:web resolution (allows http for *.localhost during local runs). */
  resolveDidWeb: (did: string) => Promise<Record<string, unknown>>;
  /** JWKS of issuers this verifier trusts for SD-JWT VCs. */
  trustedIssuerJwks: () => Promise<JWK[]>;
}

export async function resolveDid(ctx: VerifierContext, did: string) {
  return resolveLocalDid(did) ?? (await ctx.resolveDidWeb(did));
}

function ldpLoader(ctx: VerifierContext) {
  const base = makeDocumentLoader(ctx.fetchJson, (did) => resolveDid(ctx, did));
  /** URL-hosted keys seen so far, per controller, so the controller document can authorise them. */
  const keysByController = new Map<string, Set<string>>();
  return async (url: string) => {
    if (!url.startsWith("did:") && url.includes("/keys/")) {
      // Plain-URL key documents (local runs): present the key as the verification method that was asked for.
      const [docUrl] = url.split("#");
      const key = (await ctx.fetchJson(docUrl!)) as Record<string, unknown>;
      const controller = String(key.controller ?? "");
      keysByController.set(controller, (keysByController.get(controller) ?? new Set()).add(url));
      return { contextUrl: null, documentUrl: url, document: { "@context": "https://w3id.org/security/suites/ed25519-2020/v1", ...key, id: url } };
    }
    if (keysByController.has(url)) {
      // Controller document for a URL-identified issuer: it authorises exactly the keys it publishes.
      const ids = [...keysByController.get(url)!];
      return { contextUrl: null, documentUrl: url, document: { "@context": "https://www.w3.org/ns/did/v1", id: url, assertionMethod: ids, authentication: ids } };
    }
    return base(url);
  };
}

const W3C_V2 = "https://www.w3.org/ns/credentials/v2";

function expiryCheck(cred: Record<string, unknown>): Check {
  const until = (cred.validUntil ?? cred.expirationDate) as string | undefined;
  if (!until) return { name: "Not expired", ok: true, detail: "No expiry set." };
  const ok = new Date(until).getTime() > Date.now();
  return { name: "Not expired", ok, detail: ok ? `Valid until ${until}.` : `Expired on ${until}.` };
}

/** BitstringStatusList / StatusList2021 revocation check. */
async function statusCheck(ctx: VerifierContext, cred: Record<string, unknown>): Promise<Check | undefined> {
  const status = cred.credentialStatus as Record<string, unknown> | undefined;
  if (!status) return undefined;
  try {
    const list = (await ctx.fetchJson(String(status.statusListCredential))) as Record<string, unknown>;
    const encoded = String((list.credentialSubject as Record<string, unknown>).encodedList);
    const bytes = gunzipSync(Buffer.from(b64urlToBytes(encoded.startsWith("u") ? encoded.slice(1) : encoded)));
    const index = Number(status.statusListIndex);
    const bit = (bytes[Math.floor(index / 8)]! >> (7 - (index % 8))) & 1;
    return { name: "Not revoked", ok: bit === 0, detail: bit ? `Status list index ${index} is set (${String(status.statusPurpose)}).` : `Status list index ${index} is clear.` };
  } catch (e) {
    return { name: "Not revoked", ok: false, detail: `Status list could not be checked: ${(e as Error).message}` };
  }
}

export async function verifyLdpPresentation(ctx: VerifierContext, vp: Record<string, unknown>, expected: { challenge: string; domain: string; requireHolderBinding: boolean }): Promise<{ checks: Check[]; credentials: CredentialVerdict[] }> {
  const documentLoader = ldpLoader(ctx);
  const suite = new Ed25519Signature2020();
  const checks: Check[] = [];
  const creds = ([] as Record<string, unknown>[]).concat((vp.verifiableCredential as Record<string, unknown>[]) ?? []);
  const proof = vp.proof as Record<string, unknown> | undefined;

  if (!proof) {
    checks.push({ name: "Holder proof present", ok: !expected.requireHolderBinding, detail: "The presentation is not signed by the holder." });
  } else {
    checks.push({ name: "Nonce matches", ok: proof.challenge === expected.challenge, detail: `challenge ${String(proof.challenge)} vs nonce ${expected.challenge}` });
    checks.push({ name: "Audience matches", ok: proof.domain === expected.domain, detail: `domain ${String(proof.domain)} vs client_id ${expected.domain}` });
    try {
      const r = await vc.verify({ presentation: vp, suite, documentLoader, challenge: String(proof.challenge), domain: String(proof.domain), checkStatus: async () => ({ verified: true }) });
      const err = r.presentationResult?.results?.[0]?.error;
      checks.push({ name: "Holder signature valid", ok: Boolean(r.presentationResult?.verified), detail: err ? String(err.message ?? err) : "Ed25519Signature2020 over the presentation verifies." });
    } catch (e) {
      checks.push({ name: "Holder signature valid", ok: false, detail: (e as Error).message });
    }
    const holder = String(vp.holder ?? "");
    const vmController = String(proof.verificationMethod ?? "").split("#")[0];
    checks.push({ name: "Signed by the holder", ok: holder === vmController, detail: `holder ${holder}` });
  }

  const credentials: CredentialVerdict[] = [];
  for (const cred of creds) {
    const c: Check[] = [];
    try {
      // Evaluate the signature as of issuance; expiry is reported by its own check below.
      const from = Date.parse(String(cred.validFrom ?? cred.issuanceDate ?? "")) || Date.now();
      const until = Date.parse(String(cred.validUntil ?? cred.expirationDate ?? "")) || Infinity;
      const now = new Date(Math.min(from, until - 1000));
      const r = await vc.verifyCredential({ credential: cred, suite, documentLoader, now, checkStatus: async () => ({ verified: true }) });
      const err = r.results?.[0]?.error ?? r.error;
      c.push({ name: "Issuer signature valid", ok: Boolean(r.verified), detail: r.verified ? `${String((cred.proof as Record<string, unknown>)?.type)} by ${String((cred.proof as Record<string, unknown>)?.verificationMethod)}` : String(err?.message ?? err?.errors?.[0]?.message ?? "signature check failed") });
    } catch (e) {
      c.push({ name: "Issuer signature valid", ok: false, detail: (e as Error).message });
    }
    const subjectId = String((cred.credentialSubject as Record<string, unknown>)?.id ?? "").split("#")[0];
    if (subjectId && proof) c.push({ name: "Bound to the presenter", ok: subjectId === String(vp.holder), detail: `credentialSubject.id ${subjectId}` });
    c.push({ name: "Data model", ok: true, detail: ((cred["@context"] as string[])?.[0] === W3C_V2 ? "W3C VCDM 2.0" : "W3C VCDM 1.1") });
    const exp = expiryCheck(cred);
    c.push(exp);
    const st = await statusCheck(ctx, cred);
    if (st) c.push(st);
    const ok = c.every((x) => x.ok) && checks.every((x) => x.ok);
    credentials.push({ format: "ldp_vc", ok, status: ok ? "SUCCESS" : !exp.ok && c.filter((x) => !x.ok).length === 1 ? "EXPIRED" : st && !st.ok ? "REVOKED" : "INVALID", checks: c, claims: (cred.credentialSubject as Record<string, unknown>) ?? {} });
  }
  return { checks, credentials };
}

async function jwkFromDid(ctx: VerifierContext, kid: string): Promise<JWK | undefined> {
  const did = kid.split("#")[0]!;
  const doc = await resolveDid(ctx, did);
  const vm = ((doc.verificationMethod as Record<string, unknown>[]) ?? [])[0];
  return vm?.publicKeyJwk as JWK | undefined;
}

export async function verifySdJwtPresentation(ctx: VerifierContext, token: string, expected: { nonce: string; aud: string; requireHolderBinding: boolean }): Promise<CredentialVerdict> {
  const checks: Check[] = [];
  const d = decodeSdJwt(token);
  if (!d) return { format: "vc+sd-jwt", ok: false, status: "INVALID", checks: [{ name: "Well-formed SD-JWT", ok: false }], claims: {} };
  const header = decodeProtectedHeader(d.issuerJwtRaw);

  // Issuer signature, with the key taken from the trusted issuer registry.
  try {
    const trusted = await ctx.trustedIssuerJwks();
    let key: JWK | undefined;
    let how = "";
    if (header.kid) {
      key = trusted.find((k) => k.kid === header.kid);
      how = "kid in trusted issuer JWKS";
    }
    if (!key && Array.isArray(header.x5c) && header.x5c[0]) {
      const cert = new X509Certificate(Buffer.from(header.x5c[0], "base64"));
      const jwk = cert.publicKey.export({ format: "jwk" }) as JWK;
      const thumb = await calculateJwkThumbprint(jwk);
      for (const k of trusted) if ((await calculateJwkThumbprint(k).catch(() => "")) === thumb) key = k;
      how = key ? `x5c certificate (${cert.subject.replace(/\n/g, ", ")}) matches a trusted issuer key` : `x5c certificate (${cert.subject.replace(/\n/g, ", ")}) is not anchored in the trusted issuer registry`;
      if (!key) checks.push({ name: "Issuer is trusted", ok: false, detail: how });
    }
    if (key) {
      await compactVerify(d.issuerJwtRaw, await importJWK(key, String(header.alg)));
      checks.push({ name: "Issuer is trusted", ok: true, detail: how });
      checks.push({ name: "Issuer signature valid", ok: true, detail: `${String(header.alg)} signature verifies.` });
    } else if (!checks.length) checks.push({ name: "Issuer is trusted", ok: false, detail: "No key identifier or certificate to look up." });
  } catch (e) {
    checks.push({ name: "Issuer signature valid", ok: false, detail: (e as Error).message });
  }

  // Disclosures must hash into the issuer-signed _sd digests.
  const sd = new Set((d.issuerJwt.payload._sd as string[]) ?? []);
  const claims: Record<string, unknown> = {};
  let digestsOk = true;
  for (const disc of d.disclosures) {
    const digest = createHash("sha256").update(disc.raw).digest("base64url");
    if (!sd.has(digest)) digestsOk = false;
    else if (disc.name) claims[disc.name] = disc.value;
  }
  for (const [k, v] of Object.entries(d.issuerJwt.payload)) if (!k.startsWith("_") && !["cnf", "iss", "iat", "exp", "nbf", "vct", "status"].includes(k)) claims[k] = v;
  checks.push({ name: "Disclosures match issuer digests", ok: digestsOk, detail: digestsOk ? `${d.disclosures.length} disclosure(s) revealed, all bound to the issuer signature.` : "A disclosure does not hash to any _sd digest: it was altered." });

  const exp = d.issuerJwt.payload.exp as number | undefined;
  checks.push(exp ? { name: "Not expired", ok: exp * 1000 > Date.now(), detail: `exp ${new Date(exp * 1000).toISOString()}` } : { name: "Not expired", ok: true, detail: "No exp claim (the credential never expires)." });

  // Key binding.
  if (!d.keyBinding) {
    checks.push({ name: "Key-binding JWT present", ok: !expected.requireHolderBinding, detail: "No KB-JWT: possession of the holder key is not proven." });
  } else {
    const cnf = d.issuerJwt.payload.cnf as { jwk?: JWK; kid?: string } | undefined;
    try {
      const holderJwk = cnf?.jwk ?? (cnf?.kid ? await jwkFromDid(ctx, cnf.kid) : undefined);
      if (!holderJwk) throw new Error("credential has no cnf key");
      await compactVerify(d.keyBindingRaw!, await importJWK(holderJwk, String(d.keyBinding.header.alg)));
      checks.push({ name: "Holder signature valid", ok: true, detail: "KB-JWT verifies with the key in cnf." });
    } catch (e) {
      checks.push({ name: "Holder signature valid", ok: false, detail: (e as Error).message });
    }
    const presented = token.slice(0, token.length - d.keyBindingRaw!.length);
    const sdHash = createHash("sha256").update(presented).digest("base64url");
    checks.push({ name: "Nonce matches", ok: d.keyBinding.payload.nonce === expected.nonce, detail: `KB-JWT nonce ${String(d.keyBinding.payload.nonce)}` });
    checks.push({ name: "Audience matches", ok: d.keyBinding.payload.aud === expected.aud, detail: `KB-JWT aud ${String(d.keyBinding.payload.aud)}` });
    checks.push({ name: "sd_hash matches", ok: d.keyBinding.payload.sd_hash === sdHash, detail: "The KB-JWT covers exactly the disclosures presented." });
  }
  const ok = checks.every((c) => c.ok);
  const expired = checks.find((c) => c.name === "Not expired" && !c.ok);
  return { format: "vc+sd-jwt", ok, status: ok ? "SUCCESS" : expired && checks.filter((c) => !c.ok).length === 1 ? "EXPIRED" : "INVALID", checks, claims };
}
