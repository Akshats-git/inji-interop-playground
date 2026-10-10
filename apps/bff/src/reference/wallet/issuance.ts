/**
 * Reference Wallet, issuance side: an OpenID4VCI (draft 13) client for the pre-authorized code flow.
 * Written against the spec with jose only, so it is an independent implementation of the protocol.
 */
import { SignJWT } from "jose";
import { decodeSdJwt, parseCredentialOffer, type Format } from "@playground/core";
import { newHolderKey, privateKeyOf, type HolderKey } from "../keys.js";
import type { WalletHttp } from "./http.js";

export const PRE_AUTH_GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

export interface ReceivedCredential {
  configId: string;
  format: Format | string;
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

export async function receiveOffer(http: WalletHttp, offerUri: string, opts: { txCode?: string } = {}): Promise<ReceivedCredential> {
  const parsed = parseCredentialOffer(offerUri);
  if (!parsed) throw new IssuanceError("invalid_offer", "Not an openid-credential-offer URI.");

  // 1. Resolve the offer (by reference or by value).
  const offer = (parsed.credentialOffer ?? (await http.getJson(parsed.credentialOfferUri!))) as {
    credential_issuer: string;
    credential_configuration_ids: string[];
    grants?: Record<string, Record<string, unknown>>;
  };
  const grant = offer.grants?.[PRE_AUTH_GRANT];
  if (!grant) throw new IssuanceError("unsupported_grant", "The offer has no pre-authorized_code grant; the Reference Wallet only implements the pre-authorized code flow.", offer.grants);
  const configId = offer.credential_configuration_ids?.[0];
  if (!configId) throw new IssuanceError("invalid_offer", "The offer lists no credential_configuration_ids.");

  // 2. Discover issuer metadata.
  let metadata: Record<string, unknown> | undefined;
  for (const url of wellKnownCandidates(offer.credential_issuer, "openid-credential-issuer")) {
    try {
      metadata = (await http.getJson(url)) as Record<string, unknown>;
      break;
    } catch {
      /* try the next well-known form */
    }
  }
  if (!metadata) throw new IssuanceError("metadata_unavailable", `No issuer metadata at ${offer.credential_issuer}/.well-known/openid-credential-issuer.`);
  if (metadata.credential_issuer !== offer.credential_issuer)
    throw new IssuanceError("issuer_mismatch", `Metadata credential_issuer (${String(metadata.credential_issuer)}) differs from the offer's (${offer.credential_issuer}).`);
  const config = (metadata.credential_configurations_supported as Record<string, Record<string, unknown>>)?.[configId];
  if (!config) throw new IssuanceError("unknown_configuration", `Issuer metadata does not list ${configId}.`);

  // 3. Discover the authorization server and its token endpoint.
  const as = (metadata.authorization_servers as string[] | undefined)?.[0] ?? offer.credential_issuer;
  let tokenEndpoint: string | undefined;
  for (const url of wellKnownCandidates(as, "oauth-authorization-server")) {
    try {
      tokenEndpoint = ((await http.getJson(url)) as Record<string, string>).token_endpoint;
      if (tokenEndpoint) break;
    } catch {
      /* next */
    }
  }
  if (!tokenEndpoint) throw new IssuanceError("token_endpoint_unavailable", `No token_endpoint in ${as}'s authorization server metadata.`);

  // 4. Exchange the pre-authorized code.
  const txCodeRequired = Boolean(grant.tx_code);
  if (txCodeRequired && !opts.txCode) throw new IssuanceError("tx_code_required", "The offer requires a PIN (tx_code), but none was given.");
  const token = (await http.postForm(tokenEndpoint, {
    grant_type: PRE_AUTH_GRANT,
    "pre-authorized_code": String(grant["pre-authorized_code"]),
    ...(opts.txCode ? { tx_code: opts.txCode } : {}),
  })) as { access_token: string; c_nonce?: string; token_type?: string };
  if (!token.access_token) throw new IssuanceError("no_access_token", "The token response has no access_token.", token);

  // 5. Prove possession of a fresh holder key over the c_nonce, and request the credential.
  const format = String(config.format);
  const holder = await newHolderKey(format === "ldp_vc" ? "ed25519" : "p256");
  const proofJwt = await new SignJWT({ nonce: token.c_nonce, aud: offer.credential_issuer })
    .setProtectedHeader({ alg: holder.alg, typ: "openid4vci-proof+jwt", kid: holder.kid })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(await privateKeyOf(holder));

  const request: Record<string, unknown> = { format, proof: { proof_type: "jwt", jwt: proofJwt } };
  if (format === "ldp_vc") {
    const def = (config.credential_definition ?? {}) as Record<string, unknown>;
    request.credential_definition = { "@context": def["@context"], type: def.type };
  } else if (format === "vc+sd-jwt" || format === "dc+sd-jwt") request.vct = config.vct;
  else if (format === "mso_mdoc") request.doctype = config.doctype;

  const res = (await http.postJson(String(metadata.credential_endpoint), request, { authorization: `${token.token_type ?? "Bearer"} ${token.access_token}` })) as { credential?: unknown; credentials?: { credential: unknown }[] };
  const credential = res.credential ?? res.credentials?.[0]?.credential;
  if (!credential) throw new IssuanceError("no_credential", "The credential response holds no credential.", res);

  const display = (config.display as { name?: string }[] | undefined)?.[0]?.name ?? configId;
  return { configId, format, credential, holder, issuer: offer.credential_issuer, title: display };
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
