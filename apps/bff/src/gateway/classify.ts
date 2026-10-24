/**
 * Turns a raw HTTP exchange into a protocol step: a title, a phase, who talked to whom, and mechanism
 * labels (pre-authorized_code, by_reference, presentation_exchange, dcql, cross-device…). This is what
 * makes the inspector read like the spec instead of like an access log.
 */
import {
  decodeJwt,
  decodeSdJwt,
  looksLikeJwt,
  looksLikeSdJwt,
  type Party,
  type ProtocolEvent,
} from "@playground/core";

export type Upstream = "certify" | "verify" | "reference-verifier" | "studio" | "external";

export interface Exchange {
  upstream: Upstream;
  method: string;
  /** Path on the upstream service, e.g. /v1/certify/oauth/token */
  path: string;
  requestBody?: unknown;
  responseBody?: unknown;
  status: number;
  actorHeader?: string;
  /** External exchanges (parties file steps, or the Reference Wallet calling an external party) say who and what themselves. */
  external?: { title?: string; phase?: ProtocolEvent["phase"]; from: Party; to: Party; labels?: string[] };
}

type Classified = Pick<ProtocolEvent, "title" | "phase" | "labels" | "from" | "to">;

const PRE_AUTH = "urn:ietf:params:oauth:grant-type:pre-authorized_code";

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function formatLabels(vpToken: unknown): string[] {
  const labels: string[] = [];
  // A DCQL response (OpenID4VP 1.0) is an object keyed by credential query id, each holding an array.
  const o = obj(vpToken);
  if (
    !Array.isArray(vpToken) &&
    Object.keys(o).length &&
    !o.type &&
    !o.proof &&
    Object.values(o).every(Array.isArray)
  )
    return ["DCQL response", ...formatLabels(Object.values(o).flat())];
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

const HOSTED: Party[] = ["hosted-certify", "esignet", "hosted-verify"];

/** The Reference Wallet (or the BFF) talking to a party outside the playground: name the step from the path and bodies. */
function classifyExternal(x: Exchange): Classified {
  const e = x.external!;
  const hosted = HOSTED.includes(e.to) || HOSTED.includes(e.from);
  const base = {
    from: e.from,
    to: e.to,
    labels: [hosted ? "hosted Inji" : "external party", ...(e.labels ?? [])],
  };
  if (e.title) return { ...base, title: e.title, phase: e.phase ?? "issuance" };
  const p = x.path;
  const req = obj(x.requestBody);
  const res = obj(x.responseBody);
  if (p.includes("/.well-known/openid-credential-issuer"))
    return {
      ...base,
      title: "Issuer metadata",
      phase: "issuance",
      labels: [
        ...base.labels,
        "discovery",
        `${Object.keys(obj(res.credential_configurations_supported)).length} credential configurations`,
        ...(res.nonce_endpoint ? ["nonce_endpoint (OpenID4VCI 1.0)"] : []),
      ],
    };
  if (
    p.includes("/.well-known/oauth-authorization-server") ||
    p.includes("/.well-known/openid-configuration")
  )
    return {
      ...base,
      title: "Authorization server metadata",
      phase: "issuance",
      labels: [...base.labels, "discovery"],
    };
  if (/credential[_-]?offer/i.test(p) && x.method === "GET")
    return {
      ...base,
      title: "Fetch credential offer",
      phase: "issuance",
      labels: [...base.labels, "by reference"],
    };
  if (req.grant_type) {
    const labels = [
      ...base.labels,
      req.grant_type === PRE_AUTH ? "pre-authorized_code" : String(req.grant_type),
    ];
    if (req.code_verifier) labels.push("PKCE");
    if (req.client_assertion) labels.push("private_key_jwt");
    if (res.c_nonce) labels.push("c_nonce issued");
    return { ...base, title: "Token request", phase: "issuance", labels };
  }
  if (/\/nonce$/.test(p) && x.method === "POST")
    return {
      ...base,
      title: "Nonce request",
      phase: "issuance",
      labels: [...base.labels, "OpenID4VCI 1.0", "c_nonce"],
    };
  if (obj(req.proof).proof_type || req.proofs || /\/credential$/.test(p)) {
    const labels = [...base.labels, String(req.format ?? req.credential_configuration_id ?? "credential")];
    labels.push(
      req.proofs || req.credential_configuration_id
        ? "OpenID4VCI 1.0 request"
        : "OpenID4VCI draft 13 request",
    );
    return { ...base, title: "Credential request", phase: "issuance", labels };
  }
  if (/\/vp-request\/[^/]+\/status$/.test(p))
    return {
      ...base,
      title: `Status: ${String(res.status ?? "?")}`,
      phase: "presentation",
      labels: base.labels,
    };
  if (/\/v2\/vp-results\//.test(p)) {
    const status = Array.isArray(res.credentialResults)
      ? (res.credentialResults as unknown[]).length &&
        (res.credentialResults as unknown[]).every((c) => obj(c).allChecksSuccessful)
        ? "SUCCESS"
        : "INVALID"
      : `HTTP ${x.status}`;
    return {
      ...base,
      title: `Verification result: ${status}`,
      phase: "verification",
      labels: [...base.labels, status],
    };
  }
  if (/vc-verification$/.test(p))
    return {
      ...base,
      title: `Verify credential: ${obj(res).allChecksSuccessful === true ? "SUCCESS" : obj(res).allChecksSuccessful === false ? "INVALID" : String(res.verificationStatus ?? `HTTP ${x.status}`)}`,
      phase: "verification",
      labels: base.labels,
    };
  if (req.vp_token !== undefined || req.error !== undefined)
    return {
      ...base,
      title: "Submit presentation",
      phase: "presentation",
      labels: [...base.labels, "direct_post", ...formatLabels(req.vp_token)],
    };
  if (/\/pd\/|presentation[_-]definition/i.test(p))
    return {
      ...base,
      title: "Fetch presentation definition",
      phase: "presentation",
      labels: [...base.labels, "presentation_definition_uri"],
    };
  if (/\/request/.test(p) && x.method === "GET")
    return {
      ...base,
      title: "Fetch request object",
      phase: "presentation",
      labels: [...base.labels, "request_uri"],
    };
  return { ...base, title: `${x.method} ${p}`, phase: e.phase ?? "issuance" };
}

export function classify(x: Exchange): Classified {
  if (x.upstream === "external") return classifyExternal(x);
  const p = x.path.replace(/^\/v1\/certify/, "").replace(/^\/v1\/verify/, "");
  const req = obj(x.requestBody);
  const res = obj(x.responseBody);

  if (x.upstream === "certify" || x.upstream === "studio") {
    // Who the wallet was (Reference Wallet, a phone, walt.id…) goes into the event's actor, not its lane.
    const from: Party = x.upstream === "studio" ? "studio" : "wallet";
    if (p.startsWith("/credential-configurations"))
      return {
        title:
          x.method === "POST"
            ? "Register credential type"
            : x.method === "PUT"
              ? "Update credential type"
              : x.method === "DELETE"
                ? "Delete credential type"
                : "Read credential type",
        phase: "setup",
        labels: ["admin API", "internal network only"],
        from: "studio",
        to: "certify",
      };
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
      return {
        title: "Issuer metadata",
        phase: "issuance",
        labels: ["discovery", `${n} credential configurations`],
        from,
        to: "certify",
      };
    }
    if (p.includes("/.well-known/oauth-authorization-server"))
      return {
        title: "Authorization server metadata",
        phase: "issuance",
        labels: ["discovery", "RFC 8414"],
        from,
        to: "certify",
      };
    if (p.includes("/.well-known/did.json"))
      return {
        title: "Issuer DID document",
        phase: "verification",
        labels: ["did:web", "key resolution"],
        from,
        to: "certify",
      };
    if (p.includes("/.well-known/jwks.json"))
      return { title: "Issuer JWKS", phase: "verification", labels: ["key resolution"], from, to: "certify" };
    if (p.startsWith("/oauth/token")) {
      const grant = String(req.grant_type ?? "");
      const labels = [grant === PRE_AUTH ? "pre-authorized_code" : grant || "token"];
      if (req.tx_code) labels.push("tx_code sent");
      if (res.c_nonce) labels.push("c_nonce issued");
      return { title: "Token request", phase: "issuance", labels, from, to: "certify" };
    }
    if (/\/issuance\/(vd1[12]\/)?credential/.test(p)) {
      const draft = p.includes("vd11") ? "draft 11" : p.includes("vd12") ? "draft 12" : "draft 13";
      const labels = [
        String(req.format ?? req.credential_configuration_id ?? "credential"),
        `OpenID4VCI ${draft}`,
      ];
      const proof = obj(req.proof);
      if (proof.proof_type) labels.push(`proof: ${String(proof.proof_type)}`);
      const jwt = typeof proof.jwt === "string" ? decodeJwt(proof.jwt) : null;
      if (jwt?.header.alg) labels.push(String(jwt.header.alg));
      if (jwt?.header.kid && String(jwt.header.kid).startsWith("did:"))
        labels.push(String(jwt.header.kid).split(":").slice(0, 2).join(":"));
      else if (jwt?.header.jwk) labels.push("jwk in header");
      return { title: "Credential request", phase: "issuance", labels, from, to: "certify" };
    }
    if (p.startsWith("/credentials/status-list"))
      return {
        title: "Status list",
        phase: "verification",
        labels: ["BitstringStatusList", "revocation check"],
        from: "inji-verify",
        to: "certify",
      };
    if (p.startsWith("/credentials/status"))
      return {
        title: "Update credential status",
        phase: "setup",
        labels: ["revocation", "admin API"],
        from: "studio",
        to: "certify",
      };
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
      return {
        title: "Create authorization request",
        phase: "presentation",
        labels,
        from: verifierSide,
        to: "inji-verify",
      };
    }
    if (/^\/vp-request\/[^/]+\/status$/.test(p))
      return {
        title: `Status: ${String(res.status ?? "?")}`,
        phase: "presentation",
        labels: ["long polling"],
        from: verifierSide,
        to: "inji-verify",
      };
    if (/^\/vp-request\/[^/]+$/.test(p))
      return {
        title: "Fetch request object",
        phase: "presentation",
        labels: ["request_uri", "by reference"],
        from: "wallet",
        to: "inji-verify",
      };
    if (p.startsWith("/vp-submission")) {
      const labels = ["direct_post", ...formatLabels(req.vp_token)];
      if (req.presentation_submission) labels.push("presentation_submission");
      if (req.error) labels.push(`wallet error: ${String(req.error)}`);
      return {
        title: "Submit presentation",
        phase: "presentation",
        labels,
        from: "wallet",
        to: "inji-verify",
      };
    }
    if (p.startsWith("/vp-result") || p.startsWith("/vp-session-results") || p.startsWith("/v2/vp-results")) {
      const status = String(
        res.vpResultStatus ??
          (Array.isArray(res.credentialResults)
            ? (res.credentialResults as unknown[]).every((c) => obj(c).allChecksSuccessful)
              ? "SUCCESS"
              : "INVALID"
            : "?"),
      );
      return {
        title: `Verification result: ${status}`,
        phase: "verification",
        labels: [status],
        from: verifierSide,
        to: "inji-verify",
      };
    }
    if (p.includes("vc-verification"))
      return {
        title: `Verify credential: ${String(res.verificationStatus ?? res.status ?? "?")}`,
        phase: "verification",
        labels: ["direct share", "no OpenID4VP"],
        from: verifierSide,
        to: "inji-verify",
      };
    if (p.includes("vc-submission"))
      return {
        title: "Submit scanned credential",
        phase: "verification",
        labels: ["direct share"],
        from: verifierSide,
        to: "inji-verify",
      };
    if (p.includes("did.json"))
      return {
        title: "Verifier DID document",
        phase: "presentation",
        labels: ["did:web", "client_id"],
        from: "wallet",
        to: "inji-verify",
      };
    return {
      title: `${x.method} ${p}`,
      phase: "presentation",
      labels: [],
      from: verifierSide,
      to: "inji-verify",
    };
  }

  // reference-verifier
  if (x.method === "GET" && p.includes("/requests/")) {
    const labels = ["request_uri", "by reference"];
    const jwt = typeof x.responseBody === "string" ? decodeJwt(x.responseBody) : null;
    const payload = jwt?.payload ?? res;
    if (payload.dcql_query) labels.push("dcql");
    if (payload.presentation_definition) labels.push("presentation_exchange");
    if (jwt) labels.push(`signed request (${String(jwt.header.alg)})`);
    return {
      title: "Fetch request object",
      phase: "presentation",
      labels,
      from: "wallet",
      to: "reference-verifier",
    };
  }
  if (x.method === "POST" && p.includes("/response/"))
    return {
      title: "Submit presentation",
      phase: "presentation",
      labels: ["direct_post", ...formatLabels(req.vp_token)],
      from: "wallet",
      to: "reference-verifier",
    };
  return {
    title: `${x.method} ${p}`,
    phase: "presentation",
    labels: [],
    from: "wallet",
    to: "reference-verifier",
  };
}

/** Human-readable wallet identity from request headers. */
export function actorFrom(headers: Record<string, string | string[] | undefined>): string | undefined {
  const explicit = headers["x-playground-actor"];
  if (typeof explicit === "string")
    return explicit === "reference-wallet"
      ? "Reference Wallet"
      : explicit === "verifier-backend"
        ? "Playground BFF"
        : explicit;
  const ua = String(headers["user-agent"] ?? "");
  if (/okhttp|Dalvik|Android/i.test(ua)) return "Android app (e.g. Inji Wallet)";
  if (/CFNetwork|Darwin/i.test(ua)) return "iOS app (e.g. Inji Wallet)";
  if (/ktor-client/i.test(ua)) return "Kotlin client (e.g. walt.id wallet)";
  if (/Mozilla/i.test(ua)) return "Browser";
  if (ua) return ua.slice(0, 40);
  return undefined;
}
