/**
 * Reference Wallet, issuance side: an OpenID4VCI client for the pre-authorized code flow (issuer-initiated, the
 * bundled Certify) and the authorization code flow (the holder signs in at the issuer's authorization server, as
 * every MOSIP Collab issuer requires). It speaks draft 13 (c_nonce in the token response, format-based requests)
 * and 1.0 (a nonce endpoint, credential_configuration_id and proofs), picking by what the issuer advertises.
 * Written against the specs with jose only, so it is an independent implementation of the protocol.
 */
import { createHash, randomBytes } from "node:crypto";
import { importJWK, SignJWT, type JWK } from "jose";
import { decodeSdJwt, parseCredentialOffer, type CredentialFormat } from "@playground/core";
import { newHolderKey, privateKeyOf, type HolderKey } from "../keys.js";
import type { WalletHttp } from "./http.js";

export const PRE_AUTH_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

export interface ReceivedCredential {
  configId: string;
  format: CredentialFormat | string;
  credential: unknown;
  holder: HolderKey;
  issuer: string;
  title: string;
}

export class IssuanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/** OpenID4VCI §11.2: metadata lives at <issuer>/.well-known/openid-credential-issuer. Also try the RFC 8615 insertion form. */
export function wellKnownCandidates(issuer: string, suffix: string) {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/$/, "");
  const appended = `${u.origin}${path}/.well-known/${suffix}`;
  const inserted = `${u.origin}/.well-known/${suffix}${path}`;
  return path ? [appended, inserted] : [appended];
}

type Json = Record<string, unknown>;

/** The issuer's metadata, checked to belong to the issuer it was fetched for. */
async function issuerMetadata(http: WalletHttp, credentialIssuer: string): Promise<Json> {
  for (const url of wellKnownCandidates(credentialIssuer, "openid-credential-issuer")) {
    let metadata: Json | undefined;
    try {
      metadata = (await http.getJson(url)) as Json;
    } catch {
      continue; // try the next well-known form
    }
    if (metadata.credential_issuer !== credentialIssuer)
      throw new IssuanceError("issuer_mismatch", `Metadata credential_issuer (${String(metadata.credential_issuer)}) differs from the expected one (${credentialIssuer}).`);
    return metadata;
  }
  throw new IssuanceError("metadata_unavailable", `No issuer metadata at ${credentialIssuer}/.well-known/openid-credential-issuer.`);
}

function configurationOf(metadata: Json, configId: string): Json {
  const config = (metadata.credential_configurations_supported as Record<string, Json> | undefined)?.[configId];
  if (!config) throw new IssuanceError("unknown_configuration", `Issuer metadata does not list ${configId}.`);
  return config;
}

/** RFC 8414 metadata of the authorization server (or its OpenID Connect discovery document). */
async function authorizationServerMetadata(http: WalletHttp, as: string): Promise<{ token_endpoint: string; authorization_endpoint?: string }> {
  for (const suffix of ["oauth-authorization-server", "openid-configuration"])
    for (const url of wellKnownCandidates(as, suffix)) {
      try {
        const m = (await http.getJson(url)) as { token_endpoint?: string; authorization_endpoint?: string };
        if (m.token_endpoint) return { token_endpoint: m.token_endpoint, authorization_endpoint: m.authorization_endpoint };
      } catch {
        /* next */
      }
    }
  throw new IssuanceError("token_endpoint_unavailable", `No token_endpoint in ${as}'s authorization server metadata.`);
}

const titleOf = (config: Json, configId: string) =>
  ((config.display as { name?: string }[] | undefined) ?? ((config.credential_metadata as Json | undefined)?.display as { name?: string }[] | undefined))?.[0]?.name ?? configId;

/**
 * Prove possession of a fresh holder key over a nonce and ask for the credential. An issuer with a nonce endpoint
 * speaks OpenID4VCI 1.0 (fresh c_nonce from that endpoint, credential_configuration_id and proofs); otherwise the
 * draft 13 request (format and credential_definition or vct, one proof, c_nonce from the token response).
 */
async function requestCredential(
  http: WalletHttp,
  o: { metadata: Json; configId: string; config: Json; credentialIssuer: string; token: { access_token: string; token_type?: string; c_nonce?: string } },
): Promise<{ credential: unknown; holder: HolderKey }> {
  const format = String(o.config.format);
  const holder = await newHolderKey(format === "ldp_vc" ? "ed25519" : "p256");
  // Sign the proof with an algorithm the issuer lists. Ed25519 has two JOSE names: "EdDSA" (RFC 8037, what most
  // issuers list) and "Ed25519" (RFC 9864), which some Certify 0.x deployments list instead.
  const listed = ((o.config.proof_types_supported as { jwt?: { proof_signing_alg_values_supported?: string[] } } | undefined)?.jwt?.proof_signing_alg_values_supported ?? []);
  const alg = holder.alg === "EdDSA" && listed.length && !listed.includes("EdDSA") && listed.includes("Ed25519") ? "Ed25519" : holder.alg;
  // Name the holder key the way the issuer binds credentials: a DID URL (did:key / did:jwk), or the bare public JWK
  // when it binds only to "jwk" (an mDoc's device key, for example).
  const binding = (o.config.cryptographic_binding_methods_supported as string[] | undefined) ?? [];
  const byJwk = binding.length > 0 && !binding.some((b) => b.startsWith("did:")) && binding.includes("jwk");
  const proofJwt = async (nonce?: string) =>
    new SignJWT({ nonce, aud: o.credentialIssuer })
      .setProtectedHeader({ alg, typ: "openid4vci-proof+jwt", ...(byJwk ? { jwk: holder.publicJwk } : { kid: holder.kid }) })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(await privateKeyOf(holder));

  const v1 = typeof o.metadata.nonce_endpoint === "string";
  const freshNonce = async () => (v1 ? ((await http.postJson(String(o.metadata.nonce_endpoint), {})) as { c_nonce?: string }).c_nonce : undefined);
  const draft13: Json = { format };
  if (format === "ldp_vc") {
    const def = (o.config.credential_definition ?? {}) as Json;
    draft13.credential_definition = { "@context": def["@context"], type: def.type };
  } else if (format === "vc+sd-jwt" || format === "dc+sd-jwt") draft13.vct = o.config.vct;
  else if (format === "mso_mdoc") draft13.doctype = o.config.doctype;
  const body = async (nonce?: string) => (v1 ? { credential_configuration_id: o.configId, proofs: { jwt: [await proofJwt(nonce)] } } : { ...draft13, proof: { proof_type: "jwt", jwt: await proofJwt(nonce) } });

  // Certify 0.14 fetches W3C contexts from the internet while signing (gap G16); a transient fetch failure
  // surfaces as ERROR_SIGNING_QR_DATA. Retry that case twice with a fresh proof; every attempt is recorded.
  let nonce = (await freshNonce()) ?? o.token.c_nonce;
  let res: { credential?: unknown; credentials?: ({ credential: unknown } | string)[] } | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = (await http.postJson(String(o.metadata.credential_endpoint), await body(nonce), { authorization: `${o.token.token_type ?? "Bearer"} ${o.token.access_token}` })) as typeof res;
      break;
    } catch (e) {
      const err = (e as { body?: Json }).body;
      const transient = err?.error === "ERROR_SIGNING_QR_DATA" && /canonicali/i.test(String(err?.error_description ?? ""));
      if (!transient || attempt >= 2) throw e;
      nonce = typeof err?.c_nonce === "string" ? err.c_nonce : ((await freshNonce()) ?? nonce);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const first = res?.credentials?.[0];
  const credential = res?.credential ?? (typeof first === "object" && first ? first.credential : first);
  if (!credential) throw new IssuanceError("no_credential", "The credential response holds no credential.", res);
  return { credential, holder };
}

/** Issuer-initiated issuance from an openid-credential-offer:// URI (pre-authorized code). */
export async function receiveOffer(http: WalletHttp, offerUri: string, opts: { txCode?: string } = {}): Promise<ReceivedCredential> {
  const parsed = parseCredentialOffer(offerUri);
  if (!parsed) throw new IssuanceError("invalid_offer", "Not an openid-credential-offer URI.");

  // 1. Resolve the offer (by reference or by value).
  const offer = (parsed.credentialOffer ?? (await http.getJson(parsed.credentialOfferUri!))) as {
    credential_issuer: string;
    credential_configuration_ids: string[];
    grants?: Record<string, Json>;
  };
  const grant = offer.grants?.[PRE_AUTH_GRANT];
  if (!grant)
    throw new IssuanceError(
      "unsupported_grant",
      offer.grants?.authorization_code
        ? "The offer is for the authorization code flow: the holder must sign in at the issuer. Collect it from the issuer's list instead (Wallet → Collect from a hosted Inji issuer), where the wallet signs in."
        : "The offer has no pre-authorized_code grant.",
      offer.grants,
    );
  const configId = offer.credential_configuration_ids?.[0];
  if (!configId) throw new IssuanceError("invalid_offer", "The offer lists no credential_configuration_ids.");

  // 2. Discover the issuer and its authorization server.
  const metadata = await issuerMetadata(http, offer.credential_issuer);
  const config = configurationOf(metadata, configId);
  const as = (metadata.authorization_servers as string[] | undefined)?.[0] ?? offer.credential_issuer;
  const { token_endpoint } = await authorizationServerMetadata(http, as);

  // 3. Exchange the pre-authorized code.
  if (grant.tx_code && !opts.txCode) throw new IssuanceError("tx_code_required", "The offer requires a PIN (tx_code), but none was given.");
  const token = (await http.postForm(token_endpoint, {
    grant_type: PRE_AUTH_GRANT,
    "pre-authorized_code": String(grant["pre-authorized_code"]),
    ...(opts.txCode ? { tx_code: opts.txCode } : {}),
  })) as { access_token: string; c_nonce?: string; token_type?: string };
  if (!token.access_token) throw new IssuanceError("no_access_token", "The token response has no access_token.", token);

  // 4. Proof of possession and the credential.
  const { credential, holder } = await requestCredential(http, { metadata, configId, config, credentialIssuer: offer.credential_issuer, token });
  return { configId, format: String(config.format), credential, holder, issuer: offer.credential_issuer, title: titleOf(config, configId) };
}

/** What the wallet hands its sign-in step: eSignet's login page parameters, or the automatic equivalent. */
export interface SignIn {
  authorizationServer: string;
  authorizationEndpoint: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

/** The OAuth client the wallet is registered as at the authorization server (private_key_jwt). */
export interface WalletClient {
  clientId: string;
  redirectUri: string;
  privateJwk: JWK;
}

/** RS256 for an RSA key, ES256 for P-256, EdDSA for Ed25519: what the client assertion is signed with. */
const algOf = (jwk: JWK) => (jwk.kty === "RSA" ? "RS256" : jwk.kty === "OKP" ? "EdDSA" : jwk.crv === "P-384" ? "ES384" : "ES256");

/**
 * Wallet-initiated issuance with the authorization code flow: discover the issuer, sign the holder in at its
 * authorization server (PKCE), swap the code for an access token authenticating as the wallet's OAuth client
 * (private_key_jwt), then ask for the credential. `signIn` returns the authorization code: from a person on
 * eSignet's own page, or from an automatic sign-in with a demo identity.
 */
export async function receiveWithAuthorization(
  http: WalletHttp,
  o: { credentialIssuer: string; configId: string; client: WalletClient; signIn: (p: SignIn) => Promise<string> },
): Promise<ReceivedCredential> {
  const metadata = await issuerMetadata(http, o.credentialIssuer);
  const config = configurationOf(metadata, o.configId);
  const as = (metadata.authorization_servers as string[] | undefined)?.[0] ?? o.credentialIssuer;
  const asMeta = await authorizationServerMetadata(http, as);
  if (!asMeta.authorization_endpoint) throw new IssuanceError("authorization_endpoint_unavailable", `${as} advertises no authorization_endpoint.`);

  const verifier = randomBytes(32).toString("base64url");
  const code = await o.signIn({
    authorizationServer: as,
    authorizationEndpoint: asMeta.authorization_endpoint,
    scope: String(config.scope ?? o.configId),
    state: randomBytes(12).toString("base64url"),
    nonce: randomBytes(12).toString("base64url"),
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
  });

  const alg = algOf(o.client.privateJwk);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg })
    .setIssuer(o.client.clientId)
    .setSubject(o.client.clientId)
    .setAudience(asMeta.token_endpoint)
    .setIssuedAt()
    .setExpirationTime("2m")
    .setJti(randomBytes(12).toString("base64url"))
    .sign(await importJWK(o.client.privateJwk, alg));
  const token = (await http.postForm(asMeta.token_endpoint, {
    grant_type: "authorization_code",
    code,
    redirect_uri: o.client.redirectUri,
    client_id: o.client.clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: assertion,
    code_verifier: verifier,
  })) as { access_token: string; c_nonce?: string; token_type?: string };
  if (!token.access_token) throw new IssuanceError("no_access_token", "The token response has no access_token.", token);

  const { credential, holder } = await requestCredential(http, { metadata, configId: o.configId, config, credentialIssuer: o.credentialIssuer, token });
  return { configId: o.configId, format: String(config.format), credential, holder, issuer: o.credentialIssuer, title: titleOf(config, o.configId) };
}

/** Claims in a held credential, for display and for presentation matching. */
export function credentialClaims(format: string, credential: unknown): Record<string, unknown> {
  if (format === "ldp_vc") return ((credential as Record<string, unknown>)?.credentialSubject as Record<string, unknown>) ?? {};
  if (typeof credential === "string") {
    const d = decodeSdJwt(credential);
    if (d) {
      const out: Record<string, unknown> = {};
      for (const disc of d.disclosures) if (disc.name) out[disc.name] = disc.value;
      for (const [k, v] of Object.entries(d.issuerJwt.payload)) if (!k.startsWith("_")) out[k] = v;
      return out;
    }
  }
  return {};
}
