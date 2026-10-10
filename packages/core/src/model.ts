/** Shapes shared by the BFF API and the UI. */
import type { Format } from "./studio.js";

/** Who took part in an exchange. Shown as lanes in the sequence diagram. */
export type Party =
  | "studio"
  | "certify"
  | "wallet"
  | "verifier-ui"
  | "verifier-backend"
  | "inji-verify"
  | "reference-verifier";

export const PARTY_LABEL: Record<Party, string> = {
  studio: "Issuer Studio",
  certify: "Inji Certify",
  wallet: "Wallet",
  "verifier-ui": "Verifier UI",
  "verifier-backend": "Playground BFF",
  "inji-verify": "Inji Verify",
  "reference-verifier": "Reference Verifier",
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

export type WalletId = "reference-wallet" | "inji-wallet" | "inji-web" | "external-wallet";
export type VerifierId = "inji-verify" | "reference-verifier";
export type PresentMode = "openid4vp-cross-device" | "openid4vp-same-device" | "direct-share";
export type QueryLanguage = "presentation_exchange" | "dcql";

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
  action?: { kind: "scan-offer" | "scan-request" | "open-link" | "upload-vc"; uri?: string; hint: string };
}

export interface RunSpec {
  typeId: string;
  wallet: WalletId;
  verifier: VerifierId;
  mode: PresentMode;
  query: QueryLanguage;
  /** Claims the verifier asks for (field names); empty = all. */
  requestedClaims: string[];
  claims: Record<string, unknown>;
  txCode?: string;
  tamper: TamperPreset;
  /** Reuse a credential already held by the Reference Wallet instead of issuing a new one. */
  heldCredentialId?: string;
  skipIssuance?: boolean;
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
    issuer: string;
    issuerName: string;
    typeName: string;
    format: Format;
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
  "inji-wallet": { label: "Inji Wallet (mobile)", interactive: true, note: "Scan the offer and request QR codes with the Inji Wallet app. Needs a public tunnel URL." },
  "inji-web": { label: "Inji Web", interactive: true, note: "Browser wallet backed by Mimoto. Wallet-initiated issuance only in 0.17 (no credential offers)." },
  "external-wallet": { label: "Other OpenID4VCI wallet", interactive: true, note: "Any standards-compliant wallet that can scan an openid-credential-offer:// QR." },
};

export const VERIFIERS: Record<VerifierId, { label: string; accepts: QueryLanguage[]; note: string }> = {
  "inji-verify": { label: "Inji Verify 0.18.2", accepts: ["presentation_exchange"], note: "MOSIP's verifier service. The 0.x line accepts Presentation Exchange only." },
  "reference-verifier": { label: "Reference Verifier", accepts: ["presentation_exchange", "dcql"], note: "Independent OpenID4VP relying party in the playground. Accepts PE (draft 23) and DCQL (1.0)." },
};
