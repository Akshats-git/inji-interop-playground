/** Shapes shared by the BFF API and the UI. */
import type { Format } from "./studio.js";

/**
 * Every credential format the playground meets: what the bundled Certify 0.14 issues (ldp_vc, vc+sd-jwt), plus
 * the 1.0 line's SD-JWT id (dc+sd-jwt) and ISO mDoc, which hosted Inji issuers such as MOSIP Collab use.
 */
export type CredentialFormat = Format | "dc+sd-jwt" | "mso_mdoc";

/** Who took part in an exchange. Shown as lanes in the sequence diagram. */
export type Party =
  | "studio"
  | "certify"
  | "wallet"
  | "verifier-ui"
  | "verifier-backend"
  | "inji-verify"
  | "reference-verifier"
  | "external-issuer"
  | "external-verifier"
  | "external-wallet"
  | "hosted-certify"
  | "esignet"
  | "hosted-verify";

export const PARTY_LABEL: Record<Party, string> = {
  studio: "Issuer Studio",
  certify: "Inji Certify",
  wallet: "Wallet",
  "verifier-ui": "Verifier UI",
  "verifier-backend": "Playground BFF",
  "inji-verify": "Inji Verify",
  "reference-verifier": "Reference Verifier",
  "external-issuer": "External issuer",
  "external-verifier": "External verifier",
  "external-wallet": "External wallet",
  "hosted-certify": "Inji Certify (hosted)",
  esignet: "eSignet (hosted)",
  "hosted-verify": "Inji Verify (hosted)",
};

export interface HttpMessage {
  headers: Record<string, string>;
  body?: unknown;
  /** Raw body when it is not JSON (form posts, JWTs). */
  text?: string;
}

/** One recorded request/response through the gateway (or an internal admin call). */
export interface ProtocolEvent {
  id: string;
  runId: string | null;
  seq: number;
  at: string;
  durationMs: number;
  from: Party;
  to: Party;
  /** Who the wallet was, when known: "Reference Wallet", "Inji Wallet (Android)", a browser… */
  actor?: string;
  method: string;
  path: string;
  status: number;
  /** Short human title, e.g. "Token request". */
  title: string;
  /** Protocol step this message belongs to. */
  phase: "setup" | "issuance" | "presentation" | "verification";
  /** Mechanism labels: pre-authorized_code, by_reference, presentation_exchange, dcql, cross-device… */
  labels: string[];
  request?: HttpMessage;
  response?: HttpMessage;
}

export type EventSummary = Omit<ProtocolEvent, "request" | "response">;

/** Built-in wallets and verifiers. Runs also accept the ids of external ones declared in the parties file. */
export type WalletId = "reference-wallet" | "inji-wallet" | "inji-web" | "external-wallet";
export type VerifierId = "inji-verify" | "reference-verifier";
export type PresentMode = "openid4vp-cross-device" | "openid4vp-same-device" | "direct-share";
export type QueryLanguage = "presentation_exchange" | "dcql";
export type VerifyRequestStyle = "signed" | "by-value";

/** Deliberate faults the Reference Wallet can inject, to check verifiers fail correctly. */
export const TAMPER_PRESETS = {
  none: { label: "None", expect: "PASS", explain: "An honest presentation." },
  "alter-claim": { label: "Alter a claim after issuance", expect: "FAIL", explain: "Changes one claim value inside the signed credential. The issuer's signature no longer matches." },
  "wrong-nonce": { label: "Answer with a stale nonce", expect: "FAIL", explain: "Signs the presentation over a different nonce, as a replayed answer would." },
  "no-holder-proof": { label: "Drop the holder proof", expect: "FAIL", explain: "Sends the credential without proving possession of the holder key." },
  "foreign-holder": { label: "Present someone else's credential", expect: "FAIL", explain: "Signs the presentation with a key that is not the one the credential is bound to." },
  "self-signed-sdjwt": { label: "Forge an SD-JWT with a self-signed x5c", expect: "FAIL", explain: "Re-signs the issuer JWT with an attacker key and embeds the attacker's own certificate in x5c." },
} as const;
export type TamperPreset = keyof typeof TAMPER_PRESETS;

export type StepName = "issue" | "request" | "present" | "verify";
export type StepStatus = "pending" | "running" | "waiting" | "passed" | "failed" | "skipped";

export interface RunStep {
  name: StepName;
  status: StepStatus;
  startedAt?: string;
  endedAt?: string;
  /** Plain-English line shown under the step. */
  note?: string;
  /** What the user must do (scan this QR…), while the step is waiting on a human. */
  action?: {
    /**
     * paste-offer: the playground needs an offer the person got from an external issuer; confirm: a person did
     * something the playground cannot observe; login: the person signs in at the issuer's authorization server
     * (eSignet) in another tab, which sends them back to the playground.
     */
    kind: "scan-offer" | "scan-request" | "open-link" | "upload-vc" | "paste-offer" | "confirm" | "login";
    uri?: string;
    hint: string;
    /** The playground cannot see this step finish (an external party), so the person presses Continue. */
    needsConfirm?: boolean;
    /** A hosted Inji environment whose test data (demo UINs, OTP) the UI shows next to the QR or link. */
    environment?: string;
  };
}

/** How the Reference Wallet signs in for authorization-code issuance from a hosted Inji issuer. */
export interface LoginChoice {
  /** auto: with a demo identity and the environment's static OTP; interactive: the person signs in at eSignet. */
  mode: "auto" | "interactive";
  /** The demo identity (a mock UIN) for auto logins. Defaults to the environment's first one. */
  individualId?: string;
}

export interface RunSpec {
  /** A Studio type id, or "ext:<issuer>/<type>" for a type from the parties file. */
  typeId: string;
  /** A built-in WalletId or an external wallet's id. */
  wallet: string;
  /** A built-in VerifierId or an external verifier's id. */
  verifier: string;
  mode: PresentMode;
  query: QueryLanguage;
  /** Claims the verifier asks for (field names); empty = all. */
  requestedClaims: string[];
  claims: Record<string, unknown>;
  txCode?: string;
  tamper: TamperPreset;
  /**
   * How Inji Verify sends its request. "signed": client_id is Verify's own did:web and the wallet fetches a signed
   * request object by request_uri (a small QR). "by-value": a pre-registered client id and the whole request in
   * the QR, as the SDK does for non-DID client ids (gap G25).
   */
  verifyRequest?: VerifyRequestStyle;
  /** Reuse a credential already held by the Reference Wallet instead of issuing a new one. */
  heldCredentialId?: string;
  skipIssuance?: boolean;
  /** Authorization-code issuance from a hosted Inji issuer: how the Reference Wallet signs in. */
  login?: LoginChoice;
  /**
   * DCQL claim paths for W3C credentials: from the credential's root as OpenID4VP 1.0 says ("spec", default), or
   * from credentialSubject as Inji's guide and Inji Verify 1.0 do ("inji", gap G36).
   */
  dcqlPaths?: "spec" | "inji";
}

export type Verdict = "PASS" | "FAIL";
export type CredentialStatus = "SUCCESS" | "INVALID" | "EXPIRED" | "REVOKED" | "UNKNOWN";

export interface RunResult {
  /** Did the journey behave as expected? A tamper run whose verifier rejects it is a PASS. */
  verdict: Verdict;
  expected: Verdict;
  /** What the verifier concluded about the presentation. */
  verifierOutcome: "ACCEPTED" | "REJECTED" | "ERROR" | "NOT_REACHED";
  credentialStatus?: CredentialStatus;
  errorCode?: string;
  errorDetail?: string;
  /** One-paragraph plain-English explanation. */
  explanation: string;
  checks: { name: string; ok: boolean; detail?: string }[];
}

export interface Run {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "waiting" | "completed" | "failed" | "cancelled";
  spec: RunSpec;
  /** Denormalised for the report and matrix. */
  labels: {
    /** Which parties came from the parties file. */
    external?: { issuer?: boolean; wallet?: boolean; verifier?: boolean };
    /** Which parties are hosted Inji services (e.g. MOSIP Collab), named by their environment. */
    hosted?: { issuer?: string; verifier?: string };
    issuer: string;
    issuerName: string;
    typeName: string;
    format: CredentialFormat;
    dataModel?: string;
    proofType: string;
    wallet: string;
    verifier: string;
    versions: Record<string, string>;
  };
  steps: RunStep[];
  result?: RunResult;
  offerUri?: string;
  requestUri?: string;
}

export const WALLETS: Record<WalletId, { label: string; interactive: boolean; note: string }> = {
  "reference-wallet": { label: "Reference Wallet", interactive: false, note: "Headless OpenID4VCI/OpenID4VP wallet built into the playground on independent libraries (jose, jsonld, digitalbazaar). Speaks PE and DCQL." },
  "inji-wallet": { label: "Inji Wallet (mobile)", interactive: true, note: "MOSIP's phone wallet (the 1.0.0-alpha.1 build linked from collab.mosip.net). Scan the offer and request QR codes with it. The bundled issuer and verifier need a public tunnel URL; MOSIP Collab's are already public." },
  "inji-web": { label: "Inji Web", interactive: true, note: "MOSIP's browser wallet, backed by Mimoto, running on MOSIP Collab. Wallet-initiated: pick an issuer, sign in at eSignet, download. It presents only to verifiers Mimoto trusts, so it is listed here but not driven in runs." },
  "external-wallet": { label: "Other OpenID4VCI wallet", interactive: true, note: "Any standards-compliant wallet that can scan an openid-credential-offer:// QR." },
};

export const VERIFIERS: Record<VerifierId, { label: string; accepts: QueryLanguage[]; note: string }> = {
  "inji-verify": { label: "Inji Verify 0.18.2", accepts: ["presentation_exchange"], note: "MOSIP's verifier service. The 0.x line accepts Presentation Exchange only." },
  "reference-verifier": { label: "Reference Verifier", accepts: ["presentation_exchange", "dcql"], note: "Independent OpenID4VP relying party in the playground. Accepts PE (draft 23) and DCQL (1.0)." },
};

/** Upstream problems written up in docs/gaps.md that runs reproduce on purpose. */
export const KNOWN_GAPS = {
  G11: "Inji Verify accepts a forged SD-JWT (reported privately to MOSIP)",
  G15: "Certify signs Ed25519Signature2020 proofs without that suite's @context, so strict JSON-LD processors cannot check them",
  G19: "Inji Verify accepts a replayed SD-JWT presentation (reported privately to MOSIP)",
  G20: "Inji Verify accepts an SD-JWT presentation without holder proof (reported privately to MOSIP)",
  G30: "walt.id's wallet cannot read Inji Certify's issuer metadata",
  G32: "walt.id's verifier cannot read the holder key in Certify's SD-JWTs",
  G33: "walt.id's wallet puts the definition id in descriptor_map",
  G35: "walt.id's wallet fetches request_uri as JSON only; Inji Verify answers 406",
  G36: "Inji Verify 1.0 reads DCQL claim paths from credentialSubject, not from the credential's root as OpenID4VP 1.0 does",
  G41: "Collab's Land registry signs with a key its did:web document does not list, so no verifier can resolve it",
} as const;
export type KnownGapId = keyof typeof KNOWN_GAPS;

/**
 * The documented gap that explains an unexpected run, if there is one, so the Results page can tell
 * "a known upstream problem, reproduced" apart from "something new went wrong". External ids are the ones the
 * shipped infra/parties.yaml uses.
 */
export function knownGapOf(run: Pick<Run, "spec" | "labels" | "result">): KnownGapId | undefined {
  const r = run.result;
  if (!r || r.verdict !== "FAIL") return undefined;
  const { spec, labels } = run;
  const certifyIssued = !labels.external?.issuer && !labels.hosted?.issuer;
  if (spec.verifier === "inji-verify" && isSdJwtFormat(labels.format) && r.verifierOutcome === "ACCEPTED") {
    if (spec.tamper === "wrong-nonce") return "G19";
    if (spec.tamper === "no-holder-proof") return "G20";
    if (spec.tamper === "self-signed-sdjwt") return "G11";
  }
  // Inji Verify 1.0 (MOSIP Collab) still has G11; it fixed G19 and G20.
  if (labels.hosted?.verifier && isSdJwtFormat(labels.format) && spec.tamper === "self-signed-sdjwt" && r.verifierOutcome === "ACCEPTED") return "G11";
  if (spec.verifier === "reference-verifier" && labels.hosted?.issuer && labels.format === "ldp_vc" && r.verifierOutcome === "REJECTED" && /safe mode/i.test(`${r.errorDetail ?? ""} ${r.explanation}`)) return "G15";
  if (spec.wallet === "waltid-wallet" && certifyIssued && r.verifierOutcome === "NOT_REACHED" && run.result?.explanation.includes("issue step")) return "G30";
  if (spec.verifier === "waltid-verifier" && certifyIssued && labels.format === "vc+sd-jwt" && spec.tamper === "none" && r.verifierOutcome === "REJECTED") return "G32";
  if (spec.wallet === "waltid-wallet" && spec.verifier === "reference-verifier" && r.verifierOutcome === "REJECTED") return "G33";
  if (spec.wallet === "waltid-wallet" && spec.verifier === "inji-verify" && spec.verifyRequest !== "by-value" && r.verifierOutcome === "NOT_REACHED" && r.explanation.includes("present step")) return "G35";
  if (labels.hosted?.verifier && labels.format === "ldp_vc" && spec.query === "dcql" && spec.dcqlPaths !== "inji" && r.verifierOutcome === "REJECTED" && /claim path/i.test(`${r.errorDetail ?? ""} ${r.explanation}`)) return "G36";
  if (labels.hosted?.issuer && r.verifierOutcome === "REJECTED" && /public key (extraction|resolution) failed/i.test(`${r.errorDetail ?? ""} ${r.explanation}`)) return "G41";
  return undefined;
}

/** SD-JWT VC under either media type: vc+sd-jwt (drafts, Inji 0.x) or dc+sd-jwt (the current draft, Inji 1.0). */
export const isSdJwtFormat = (f: string) => f === "vc+sd-jwt" || f === "dc+sd-jwt";

/** Inji Verify's words for a credential's state: Valid, Invalid, Valid but expired, Revoked. */
export function credentialStatusLabel(s: CredentialStatus | undefined): string | undefined {
  return s === "SUCCESS" ? "Valid" : s === "INVALID" ? "Invalid" : s === "EXPIRED" ? "Valid but expired" : s === "REVOKED" ? "Revoked" : undefined;
}

/** Did this message fail? An error status the parties file allows (409 "account exists") is labelled and does not count. */
export const isFailedEvent = (e: Pick<EventSummary, "status" | "labels">) => e.status >= 400 && !e.labels.some((l) => l.endsWith("expected here"));
