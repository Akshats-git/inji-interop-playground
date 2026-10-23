/** Decoders the inspector uses to make raw protocol payloads readable. Pure functions, browser + Node. */

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64urlToString = (s: string) => new TextDecoder().decode(b64urlToBytes(s));

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

const JWT_RE = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*$/;
export const looksLikeJwt = (s: unknown): s is string => typeof s === "string" && JWT_RE.test(s);

export function decodeJwt(token: string): DecodedJwt | null {
  if (!looksLikeJwt(token)) return null;
  const [h, p, sig] = token.split(".");
  try {
    return { header: JSON.parse(b64urlToString(h!)), payload: JSON.parse(b64urlToString(p!)), signature: sig ?? "" };
  } catch {
    return null;
  }
}

export interface Disclosure {
  raw: string;
  salt: string;
  name?: string;
  value: unknown;
}

export interface DecodedSdJwt {
  issuerJwt: DecodedJwt;
  issuerJwtRaw: string;
  disclosures: Disclosure[];
  keyBinding?: DecodedJwt;
  keyBindingRaw?: string;
}

export const looksLikeSdJwt = (s: unknown): s is string => typeof s === "string" && s.includes("~") && looksLikeJwt(s.split("~")[0]);

/** `<issuer-jwt>~<disclosure>~…~<kb-jwt?>` */
export function decodeSdJwt(token: string): DecodedSdJwt | null {
  if (!looksLikeSdJwt(token)) return null;
  const parts = token.split("~");
  const issuerJwtRaw = parts[0]!;
  const issuerJwt = decodeJwt(issuerJwtRaw);
  if (!issuerJwt) return null;
  const last = parts[parts.length - 1]!;
  const kb = last && looksLikeJwt(last) ? decodeJwt(last) : null;
  const disclosureParts = parts.slice(1, kb ? -1 : undefined).filter(Boolean);
  const disclosures: Disclosure[] = [];
  for (const raw of disclosureParts) {
    try {
      const arr = JSON.parse(b64urlToString(raw)) as unknown[];
      disclosures.push(arr.length === 3 ? { raw, salt: String(arr[0]), name: String(arr[1]), value: arr[2] } : { raw, salt: String(arr[0]), value: arr[1] });
    } catch {
      /* not a disclosure */
    }
  }
  return { issuerJwt, issuerJwtRaw, disclosures, keyBinding: kb ?? undefined, keyBindingRaw: kb ? last : undefined };
}

/** Claims an SD-JWT reveals once its disclosures are applied (top-level only; enough for display). */
export function sdJwtClaims(d: DecodedSdJwt): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d.issuerJwt.payload };
  delete out._sd;
  delete out._sd_alg;
  for (const disc of d.disclosures) if (disc.name) out[disc.name] = disc.value;
  return out;
}

export interface ParsedOffer {
  scheme: string;
  byReference: boolean;
  credentialOfferUri?: string;
  credentialOffer?: Record<string, unknown>;
}

/** openid-credential-offer://?credential_offer_uri=… or …?credential_offer={json} */
export function parseCredentialOffer(uri: string): ParsedOffer | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/[^?]*\?(.*)$/i.exec(uri.trim());
  if (!m) return null;
  const params = new URLSearchParams(m[2]);
  const byRef = params.get("credential_offer_uri");
  if (byRef) return { scheme: m[1]!, byReference: true, credentialOfferUri: byRef };
  const inline = params.get("credential_offer");
  if (inline) {
    try {
      return { scheme: m[1]!, byReference: false, credentialOffer: JSON.parse(inline) };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * An issuer-initiated offer for the authorization code flow, by value: the wallet reads the issuer and the
 * credential from the QR code, then signs the holder in at the issuer's authorization server (eSignet) itself.
 * This is how an authorization-code issuer (every MOSIP Collab issuer) becomes a QR code a wallet can scan.
 */
export function authorizationCodeOffer(credentialIssuer: string, configurationIds: string[], authorizationServer?: string): string {
  const offer = {
    credential_issuer: credentialIssuer,
    credential_configuration_ids: configurationIds,
    grants: { authorization_code: authorizationServer ? { authorization_server: authorizationServer } : {} },
  };
  return `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
}

/** openid4vp://?client_id=…&request_uri=… (or inline parameters). */
export function parseAuthorizationRequest(uri: string): Record<string, string> | null {
  const q = uri.indexOf("?");
  if (q < 0) return null;
  return Object.fromEntries(new URLSearchParams(uri.slice(q + 1)));
}

/** Classify anything pasted into the decoder: JWT, SD-JWT, offer URI, OpenID4VP request, JSON, PixelPass text. */
export type Sniffed =
  | { kind: "sd-jwt"; value: DecodedSdJwt }
  | { kind: "jwt"; value: DecodedJwt }
  | { kind: "credential-offer"; value: ParsedOffer }
  | { kind: "authorization-request"; value: Record<string, string> }
  | { kind: "json"; value: unknown }
  | { kind: "text"; value: string };

export function sniff(input: string): Sniffed {
  const s = input.trim();
  const sd = decodeSdJwt(s);
  if (sd) return { kind: "sd-jwt", value: sd };
  const jwt = decodeJwt(s);
  if (jwt) return { kind: "jwt", value: jwt };
  if (/^[a-z0-9+.-]*credential-offer/i.test(s)) {
    const o = parseCredentialOffer(s);
    if (o) return { kind: "credential-offer", value: o };
  }
  if (/^(openid4vp|openid-vc|haip|mdoc-openid4vp|eudi-openid4vp|INJI_OVP):/i.test(s) || /[?&]request_uri=|[?&]presentation_definition=|[?&]dcql_query=/.test(s)) {
    const r = parseAuthorizationRequest(s);
    if (r) return { kind: "authorization-request", value: r };
  }
  try {
    return { kind: "json", value: JSON.parse(s) };
  } catch {
    return { kind: "text", value: s };
  }
}

const SECRET_KEYS = new Set(["access_token", "refresh_token", "pre-authorized_code", "tx_code", "authorization", "cookie", "set-cookie", "code", "response_code", "code_verifier", "client_assertion", "x-xsrf-token", "oauth-details-hash"]);

/** Replace secret-looking values with a fingerprint so the inspector can show structure without leaking. */
export function maskSecrets<T>(value: T, reveal = false): T {
  if (reveal) return value;
  const walk = (v: unknown, key?: string): unknown => {
    if (key && SECRET_KEYS.has(key.toLowerCase()) && (typeof v === "string" || typeof v === "number")) return mask(String(v));
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

export function mask(s: string): string {
  if (s.length <= 8) return "●●●●";
  const bearer = /^Bearer\s+/i.test(s) ? "Bearer " : "";
  const core = s.replace(/^Bearer\s+/i, "");
  return `${bearer}${core.slice(0, 4)}●●●●${core.slice(-4)}`;
}
