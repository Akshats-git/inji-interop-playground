/**
 * Signing a holder in at eSignet, the authorization server of MOSIP's hosted issuers, for the OpenID4VCI
 * authorization code flow.
 *
 * - Interactively: the person opens eSignet's own login page (authorizeUrl) in a tab, signs in, and eSignet
 *   redirects the browser to the client's redirect URI, which the playground listens on.
 * - Automatically, for runs without a person: the same calls eSignet's login page makes (oauth-details, send-otp,
 *   authenticate, auth-code), with a demo identity and the environment's static test OTP. MOSIP Collab
 *   publishes both for exactly this purpose.
 */
import { createHash } from "node:crypto";
import type { Recorder } from "../gateway/recorder.js";
import { recordedFetch } from "../util/recorded.js";

export interface AuthorizationParams {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  acrValues: string;
}

/** eSignet's login page, with the OAuth parameters it reads from the query string. */
export function authorizeUrl(p: AuthorizationParams): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: p.scope,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: "S256",
    acr_values: p.acrValues,
    display: "page",
    prompt: "login",
    ui_locales: "en",
    claims_locales: "en",
  });
  return `${p.authorizationEndpoint}?${q.toString()}`;
}

export class EsignetError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const WHAT: Record<string, string> = {
  invalid_redirect_uri: "the client is not registered for this redirect URI",
  invalid_client_id: "the client is not registered at this eSignet",
  invalid_pkce_challenge: "eSignet requires PKCE",
  invalid_transaction: "the login transaction is unknown or expired",
  auth_failed: "the identity or OTP was not accepted",
  invalid_identifier: "the identity is not known here",
  invalid_scope: "the client may not ask for this scope",
};

/** The calls eSignet's login page makes, recorded step by step, ending in an authorization code. */
export async function signInAutomatically(
  base: string,
  p: Omit<AuthorizationParams, "authorizationEndpoint"> & { individualId: string; otp: string },
  rec: { recorder?: Recorder; runId?: string | null },
): Promise<string> {
  const api = `${base.replace(/\/+$/, "")}/v1/esignet`;
  let cookies = "";
  const keep = (h: Headers) => {
    for (const c of h.getSetCookie()) {
      const kv = c.split(";")[0]!;
      const name = kv.split("=")[0]!;
      cookies = [...cookies.split("; ").filter((x) => x && !x.startsWith(`${name}=`)), kv].join("; ");
    }
  };
  const step = (title: string, labels: string[] = []) => ({ title, phase: "issuance" as const, from: "wallet" as const, to: "esignet" as const, labels: ["eSignet", ...labels] });

  const csrf = await recordedFetch(rec.recorder, { url: `${api}/csrf/token`, runId: rec.runId, record: step("eSignet: CSRF token") });
  keep(csrf.headers);
  const xsrf = String((csrf.body as { token?: string })?.token ?? "");
  const now = () => new Date().toISOString().replace(/\.\d+Z$/, ".000Z");
  const call = async (path: string, request: Record<string, unknown>, title: string, labels: string[], extra: Record<string, string> = {}) => {
    const r = await recordedFetch(rec.recorder, { url: `${api}${path}`, json: { requestTime: now(), request }, headers: { "x-xsrf-token": xsrf, cookie: cookies, ...extra }, runId: rec.runId, record: step(title, labels) });
    keep(r.headers);
    const body = r.body as { response?: Record<string, unknown> | null; errors?: { errorCode: string; errorMessage?: string }[] };
    const err = body?.errors?.[0];
    if (r.status >= 400 || err || !body?.response) {
      const code = err?.errorCode ?? `http_${r.status}`;
      throw new EsignetError(code, `eSignet refused "${title.replace(/^eSignet: /, "")}": ${code}${WHAT[code] ? ` (${WHAT[code]})` : ""}.`);
    }
    return body.response;
  };

  const details = await call(
    "/authorization/v2/oauth-details",
    { clientId: p.clientId, scope: p.scope, responseType: "code", redirectUri: p.redirectUri, display: "page", prompt: "login", acrValues: p.acrValues, nonce: p.nonce, state: p.state, claimsLocales: "en", codeChallenge: p.codeChallenge, codeChallengeMethod: "S256" },
    "eSignet: start login (authorization request)",
    ["authorization_code", "PKCE S256", `scope ${p.scope}`],
  );
  const tx = String(details.transactionId);
  // eSignet ties the next calls to this transaction by its id and a hash of the oauth-details answer.
  const bound = { "oauth-details-key": tx, "oauth-details-hash": createHash("sha256").update(JSON.stringify(details)).digest("base64url") };
  await call("/authorization/send-otp", { transactionId: tx, individualId: p.individualId, otpChannels: ["email", "phone"] }, "eSignet: send OTP", ["demo identity"], bound);
  await call("/authorization/v3/authenticate", { transactionId: tx, individualId: p.individualId, challengeList: [{ authFactorType: "OTP", challenge: p.otp, format: "alpha-numeric" }] }, "eSignet: sign in with the OTP", ["demo identity", "static test OTP"], bound);
  const granted = await call("/authorization/auth-code", { transactionId: tx, acceptedClaims: [], permittedAuthorizeScopes: [p.scope] }, "eSignet: authorization code", [`redirect to ${p.redirectUri}`], bound);
  if (granted.state !== p.state) throw new EsignetError("state_mismatch", "eSignet answered with a different state than the wallet sent.");
  return String(granted.code);
}
