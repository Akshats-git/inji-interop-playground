/**
 * Turns a raw HTTP exchange into a protocol step: a title, a phase, who talked to whom, and mechanism
 * labels (pre-authorized_code, by_reference, presentation_exchange, dcql, cross-device…). This is what
 * makes the inspector read like the spec instead of like an access log.
 */
import { decodeJwt, decodeSdJwt, looksLikeJwt, looksLikeSdJwt, type Party, type ProtocolEvent } from "@playground/core";

export type Upstream = "certify" | "verify" | "reference-verifier" | "studio";

export interface Exchange {
  upstream: Upstream;
  method: string;
  /** Path on the upstream service, e.g. /v1/certify/oauth/token */
  path: string;
  requestBody?: unknown;
  responseBody?: unknown;
  status: number;
  actorHeader?: string;
}

type Classified = Pick<ProtocolEvent, "title" | "phase" | "labels" | "from" | "to">;

const PRE_AUTH = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function formatLabels(vpToken: unknown): string[] {
  const labels: string[] = [];
  const tokens = Array.isArray(vpToken) ? vpToken : [vpToken];
  for (const t of tokens) {
    if (typeof t === "string" && looksLikeSdJwt(t)) {
      labels.push("vc+sd-jwt");
      const d = decodeSdJwt(t);
      if (d?.keyBinding) labels.push("key-binding-jwt");
      labels.push(`${d?.disclosures.length ?? 0} disclosures`);
    } else if (typeof t === "string" && looksLikeJwt(t)) labels.push("jwt_vp");
    else if (t && typeof t === "object") {
      labels.push("ldp_vp");
      const proof = obj(obj(t).proof);
      if (proof.type) labels.push(String(proof.type));
      else labels.push("no holder proof");
    } else if (typeof t === "string") {
      try {
        return formatLabels(JSON.parse(t));
      } catch {
        /* opaque */
      }
    }
  }
  return labels;
}

function walletIs(actor?: string): Party {
  return "wallet";
}

export function classify(x: Exchange): Classified {
  const p = x.path.replace(/^\/v1\/certify/, "").replace(/^\/v1\/verify/, "");
  const req = obj(x.requestBody);
  const res = obj(x.responseBody);

  if (x.upstream === "certify" || x.upstream === "studio") {
    const from: Party = x.upstream === "studio" ? "studio" : walletIs(x.actorHeader);
    if (p.startsWith("/credential-configurations"))
      return { title: x.method === "POST" ? "Register credential type" : x.method === "PUT" ? "Update credential type" : x.method === "DELETE" ? "Delete credential type" : "Read credential type", phase: "setup", labels: ["admin API", "internal network only"], from: "studio", to: "certify" };
    if (p.startsWith("/pre-authorized-data")) {
      const labels = ["issuer-initiated", "pre-authorized_code", "credential_offer_uri (by reference)"];
      if (req.tx_code) labels.push("tx_code (PIN)");
      return { title: "Create credential offer", phase: "issuance", labels, from: "studio", to: "certify" };
    }
    if (p.startsWith("/credential-offer-data/")) {
      const grants = obj(res.grants);
      const pre = obj(grants[PRE_AUTH]);
      const labels = ["credential offer", "by reference"];
      if (Object.keys(pre).length) labels.push("pre-authorized_code");
      if (pre.tx_code) labels.push("tx_code required");
      if (grants.authorization_code) labels.push("authorization_code");
      return { title: "Fetch credential offer", phase: "issuance", labels, from, to: "certify" };
    }
    if (p.includes("/.well-known/openid-credential-issuer")) {
      const n = Object.keys(obj(res.credential_configurations_supported)).length;
      return { title: "Issuer metadata", phase: "issuance", labels: ["discovery", `${n} credential configurations`], from, to: "certify" };
    }
    if (p.includes("/.well-known/oauth-authorization-server")) return { title: "Authorization server metadata", phase: "issuance", labels: ["discovery", "RFC 8414"], from, to: "certify" };
    if (p.includes("/.well-known/did.json")) return { title: "Issuer DID document", phase: "verification", labels: ["did:web", "key resolution"], from, to: "certify" };
    if (p.includes("/.well-known/jwks.json")) return { title: "Issuer JWKS", phase: "verification", labels: ["key resolution"], from, to: "certify" };
    if (p.startsWith("/oauth/token")) {
      const grant = String(req.grant_type ?? "");
      const labels = [grant === PRE_AUTH ? "pre-authorized_code" : grant || "token"];
      if (req.tx_code) labels.push("tx_code sent");
      if (res.c_nonce) labels.push("c_nonce issued");
      return { title: "Token request", phase: "issuance", labels, from, to: "certify" };
    }
    if (/\/issuance\/(vd1[12]\/)?credential/.test(p)) {
      const draft = p.includes("vd11") ? "draft 11" : p.includes("vd12") ? "draft 12" : "draft 13";
      const labels = [String(req.format ?? req.credential_configuration_id ?? "credential"), `OpenID4VCI ${draft}`];
      const proof = obj(req.proof);
      if (proof.proof_type) labels.push(`proof: ${String(proof.proof_type)}`);
      const jwt = typeof proof.jwt === "string" ? decodeJwt(proof.jwt) : null;
      if (jwt?.header.alg) labels.push(String(jwt.header.alg));
      if (jwt?.header.kid && String(jwt.header.kid).startsWith("did:")) labels.push(String(jwt.header.kid).split(":").slice(0, 2).join(":"));
      else if (jwt?.header.jwk) labels.push("jwk in header");
      return { title: "Credential request", phase: "issuance", labels, from, to: "certify" };
    }
    if (p.startsWith("/credentials/status-list")) return { title: "Status list", phase: "verification", labels: ["BitstringStatusList", "revocation check"], from: "inji-verify", to: "certify" };
    if (p.startsWith("/credentials/status")) return { title: "Update credential status", phase: "setup", labels: ["revocation", "admin API"], from: "studio", to: "certify" };
    return { title: `${x.method} ${p}`, phase: "issuance", labels: [], from, to: "certify" };
  }

  if (x.upstream === "verify") {
    const backend = x.actorHeader === "verifier-backend";
    const verifierSide: Party = backend ? "verifier-backend" : "verifier-ui";
    if (p === "/vp-request" || p === "/vp-session-request") {
      const labels = ["OpenID4VP", "presentation_exchange"];
      if (req.presentationDefinitionId) labels.push("presentation_definition by id");
      if (req.acceptVPWithoutHolderProof) labels.push("holder proof optional");
      if (res.requestUri) labels.push("request_uri (signed request)");
      else labels.push("request by value");
      if (p === "/vp-session-request") labels.push("cookie session");
      return { title: "Create authorization request", phase: "presentation", labels, from: verifierSide, to: "inji-verify" };
    }
    if (/^\/vp-request\/[^/]+\/status$/.test(p)) return { title: `Status: ${String(res.status ?? "?")}`, phase: "presentation", labels: ["long polling"], from: verifierSide, to: "inji-verify" };
    if (/^\/vp-request\/[^/]+$/.test(p)) return { title: "Fetch request object", phase: "presentation", labels: ["request_uri", "by reference"], from: "wallet", to: "inji-verify" };
    if (p.startsWith("/vp-submission")) {
      const labels = ["direct_post", ...formatLabels(req.vp_token)];
      if (req.presentation_submission) labels.push("presentation_submission");
      if (req.error) labels.push(`wallet error: ${String(req.error)}`);
      return { title: "Submit presentation", phase: "presentation", labels, from: "wallet", to: "inji-verify" };
    }
    if (p.startsWith("/vp-result") || p.startsWith("/vp-session-results") || p.startsWith("/v2/vp-results")) {
      const status = String(res.vpResultStatus ?? (Array.isArray(res.credentialResults) ? ((res.credentialResults as unknown[]).every((c) => obj(c).allChecksSuccessful) ? "SUCCESS" : "INVALID") : "?"));
      return { title: `Verification result: ${status}`, phase: "verification", labels: [status], from: verifierSide, to: "inji-verify" };
    }
    if (p.includes("vc-verification")) return { title: `Verify credential: ${String(res.verificationStatus ?? res.status ?? "?")}`, phase: "verification", labels: ["direct share", "no OpenID4VP"], from: verifierSide, to: "inji-verify" };
    if (p.includes("vc-submission")) return { title: "Submit scanned credential", phase: "verification", labels: ["direct share"], from: verifierSide, to: "inji-verify" };
    if (p.includes("did.json")) return { title: "Verifier DID document", phase: "presentation", labels: ["did:web", "client_id"], from: "wallet", to: "inji-verify" };
    return { title: `${x.method} ${p}`, phase: "presentation", labels: [], from: verifierSide, to: "inji-verify" };
  }

  // reference-verifier
  if (x.method === "GET" && p.includes("/requests/")) {
    const labels = ["request_uri", "by reference"];
    const jwt = typeof x.responseBody === "string" ? decodeJwt(x.responseBody) : null;
    const payload = jwt?.payload ?? res;
    if (payload.dcql_query) labels.push("dcql");
    if (payload.presentation_definition) labels.push("presentation_exchange");
    if (jwt) labels.push(`signed request (${String(jwt.header.alg)})`);
    return { title: "Fetch request object", phase: "presentation", labels, from: "wallet", to: "reference-verifier" };
  }
  if (x.method === "POST" && p.includes("/response/")) return { title: "Submit presentation", phase: "presentation", labels: ["direct_post", ...formatLabels(req.vp_token)], from: "wallet", to: "reference-verifier" };
  return { title: `${x.method} ${p}`, phase: "presentation", labels: [], from: "wallet", to: "reference-verifier" };
}

/** Human-readable wallet identity from request headers. */
export function actorFrom(headers: Record<string, string | string[] | undefined>): string | undefined {
  const explicit = headers["x-playground-actor"];
  if (typeof explicit === "string") return explicit === "reference-wallet" ? "Reference Wallet" : explicit === "verifier-backend" ? "Playground BFF" : explicit;
  const ua = String(headers["user-agent"] ?? "");
  if (/okhttp|Dalvik|Android/i.test(ua)) return "Android app (e.g. Inji Wallet)";
  if (/CFNetwork|Darwin/i.test(ua)) return "iOS app (e.g. Inji Wallet)";
  if (/Mozilla/i.test(ua)) return "Browser";
  if (ua) return ua.slice(0, 40);
  return undefined;
}
