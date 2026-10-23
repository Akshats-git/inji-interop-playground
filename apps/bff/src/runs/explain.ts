/**
 * Turns verifier output into a run verdict with a plain-English explanation. A run passes when the
 * verifier behaves as expected: accept an honest presentation, reject a tampered one.
 */
import { TAMPER_PRESETS, type CredentialStatus, type RunResult, type TamperPreset, type Verdict } from "@playground/core";
import type { VerifyResultV2 } from "../inji/verify.js";
import type { VerifierResult } from "../reference/verifier/service.js";

/** `who` names the Inji Verify deployment (the bundled 0.18.2 by default, or a hosted one such as MOSIP Collab's). */
type Input =
  | { kind: "inji-vp"; vp: VerifyResultV2; expected: Verdict; tamper: TamperPreset; walletStatus?: number; walletBody?: unknown; who?: string }
  | { kind: "inji-direct"; direct: VerifyResultV2["credentialResults"][number]; expected: Verdict; tamper: TamperPreset; who?: string }
  | { kind: "inji-error"; errorCode: string; errorDetail: string; expected: Verdict; tamper: TamperPreset; walletStatus?: number; walletBody?: unknown; who?: string }
  | { kind: "ref"; ref: VerifierResult; expected: Verdict; tamper: TamperPreset }
  /** An external verifier from the parties file: only its verdict (and whatever detail it returned) is known. */
  | { kind: "external"; who: string; accepted: boolean; detail?: unknown; expected: Verdict; tamper: TamperPreset };

/**
 * Named checks inside an external verifier's answer: any object with a policy (or check) name and a success
 * flag, e.g. walt.id's {"policy": "signature_sd-jwt-vc", "is_success": true, "error": …}.
 */
export function externalChecks(detail: unknown): { name: string; ok: boolean; detail?: string }[] {
  const out: { name: string; ok: boolean; detail?: string }[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    const o = v as Record<string, unknown>;
    const name = o.policy ?? o.check ?? o.name;
    const ok = o.is_success ?? o.success ?? o.valid;
    if (typeof name === "string" && typeof ok === "boolean") {
      const err = o.error ?? o.errorMessage;
      out.push({ name, ok, detail: err ? (typeof err === "string" ? err : JSON.stringify(err)).split("\n")[0]!.slice(0, 300) : undefined });
      return;
    }
    for (const x of Object.values(o)) walk(x, depth + 1);
  };
  walk(detail, 0);
  return out;
}

/** A short, readable rendering of whatever an external verifier said about the presentation. */
export function externalDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

/** What common Inji error codes mean, in words a newcomer understands. */
export const ERROR_MEANING: Record<string, string> = {
  ERR_SIGNATURE_VERIFICATION_FAILED: "the issuer's signature does not match the credential's contents",
  ERR_INVALID_ISSUER: "the verifier could not read the issuer identifier",
  ERR_VC_EXPIRED: "the credential is past its expiry date",
  NONCE_VALIDATION_FAILED: "the presentation was signed over a different nonce than the verifier issued (a replay or stale answer)",
  CLIENT_ID_VALIDATION_FAILED: "the presentation was made for a different verifier (domain/aud mismatch)",
  CLIENT_ID_NONCE_VALIDATION_FAILED: "the presentation carries no holder proof with a challenge and domain",
  VP_WITHOUT_PROOF: "the presentation is not signed by the holder",
  INVALID_VP_TOKEN: "the vp_token could not be parsed",
  VP_VERIFICATION_FAILED: "the presentation failed verification",
  TOKEN_MATCHING_FAILED: "the submitted credentials do not match what was requested",
  HOLDER_VERIFICATION_FAILED: "the presentation was not signed by the key the credential is bound to",
};

const meaning = (code?: string, detail?: string) => (code && ERROR_MEANING[code]) ?? detail ?? code ?? "unknown reason";

function verdictFor(accepted: boolean, expected: Verdict): Verdict {
  return (accepted && expected === "PASS") || (!accepted && expected === "FAIL") ? "PASS" : "FAIL";
}

function summarise(accepted: boolean, expected: Verdict, tamper: TamperPreset, reason: string, who: string): string {
  const t = TAMPER_PRESETS[tamper];
  const what = tamper === "none" ? "an expired credential" : `a tampered presentation (${t.label.toLowerCase()})`;
  const why = tamper === "none" ? "Its validity period has ended." : t.explain;
  if (accepted && expected === "PASS") return `${who} accepted the presentation: every check passed.`;
  if (!accepted && expected === "FAIL") return `${who} rejected ${what} because ${reason}. That is the correct behaviour.`;
  if (accepted && expected === "FAIL") return `${who} ACCEPTED ${what}. ${why} A verifier should reject this, so this is an interoperability/security finding.`;
  return `${who} rejected the presentation because ${reason}.`;
}

export function explainResult(i: Input): RunResult {
  if (i.kind === "inji-vp") {
    const checks = i.vp.credentialResults.flatMap((c, n) => {
      const label = i.vp.credentialResults.length > 1 ? ` (#${n + 1})` : "";
      const out = [{ name: `Issuer signature & schema${label}`, ok: Boolean(c.schemaAndSignatureCheck?.valid), detail: c.schemaAndSignatureCheck?.error ? `${c.schemaAndSignatureCheck.error.errorCode}: ${c.schemaAndSignatureCheck.error.errorMessage}` : undefined }];
      if (c.expiryCheck) out.push({ name: `Not expired${label}`, ok: Boolean(c.expiryCheck.valid), detail: undefined });
      for (const st of c.statusCheck ?? []) out.push({ name: `Status: ${st.purpose ?? "revocation"}${label}`, ok: Boolean(st.valid), detail: st.error?.errorMessage });
      if (c.holderProofCheck) out.push({ name: `Holder proof${label}`, ok: Boolean(c.holderProofCheck.valid), detail: c.holderProofCheck.error?.errorMessage });
      return out;
    });
    const accepted = i.vp.allChecksSuccessful && i.vp.credentialResults.length > 0;
    const firstErr = i.vp.credentialResults.map((c) => c.schemaAndSignatureCheck?.error ?? c.holderProofCheck?.error ?? c.statusCheck?.find((s) => !s.valid)?.error).find(Boolean);
    // "Valid but expired": the signature holds and only the validity period has ended.
    const expired = i.vp.credentialResults.some((c) => c.expiryCheck && !c.expiryCheck.valid && c.schemaAndSignatureCheck?.valid !== false);
    const revoked = i.vp.credentialResults.some((c) => c.statusCheck?.some((s) => !s.valid));
    const status: CredentialStatus = accepted ? "SUCCESS" : expired ? "EXPIRED" : revoked ? "REVOKED" : "INVALID";
    const reason = expired ? "the credential has expired" : revoked ? "the credential has been revoked" : meaning(firstErr?.errorCode, firstErr?.errorMessage);
    return {
      verdict: verdictFor(accepted, i.expected),
      expected: i.expected,
      verifierOutcome: accepted ? "ACCEPTED" : "REJECTED",
      credentialStatus: status,
      errorCode: accepted ? undefined : firstErr?.errorCode ?? status,
      errorDetail: accepted ? undefined : firstErr?.errorMessage,
      explanation: summarise(accepted, i.expected, i.tamper, reason, i.who ?? "Inji Verify"),
      checks,
    };
  }
  if (i.kind === "inji-direct") {
    const c = i.direct;
    const accepted = Boolean(c.allChecksSuccessful);
    const err = c.schemaAndSignatureCheck?.error;
    const expired = c.expiryCheck && !c.expiryCheck.valid && c.schemaAndSignatureCheck?.valid !== false;
    return {
      verdict: verdictFor(accepted, i.expected),
      expected: i.expected,
      verifierOutcome: accepted ? "ACCEPTED" : "REJECTED",
      credentialStatus: accepted ? "SUCCESS" : expired ? "EXPIRED" : "INVALID",
      errorCode: accepted ? undefined : err?.errorCode ?? (expired ? "ERR_VC_EXPIRED" : "INVALID"),
      errorDetail: err?.errorMessage,
      explanation: summarise(accepted, i.expected, i.tamper, expired ? "the credential has expired" : meaning(err?.errorCode, err?.errorMessage), i.who ?? "Inji Verify"),
      checks: [
        { name: "Issuer signature & schema", ok: Boolean(c.schemaAndSignatureCheck?.valid), detail: err ? `${err.errorCode}: ${err.errorMessage}` : undefined },
        ...(c.expiryCheck ? [{ name: "Not expired", ok: Boolean(c.expiryCheck.valid) }] : []),
      ],
    };
  }
  if (i.kind === "inji-error") {
    const body = i.walletBody as Record<string, unknown> | string | undefined;
    const walletCode = typeof body === "object" && body ? String(body.errorCode ?? body.error ?? "") : undefined;
    const code = walletCode || i.errorCode;
    const detail = (typeof body === "object" && body ? String(body.errorMessage ?? body.error_description ?? "") : typeof body === "string" ? body : "") || i.errorDetail;
    return {
      verdict: verdictFor(false, i.expected),
      expected: i.expected,
      verifierOutcome: "REJECTED",
      credentialStatus: "INVALID",
      errorCode: code,
      errorDetail: detail,
      explanation: summarise(false, i.expected, i.tamper, meaning(code, detail), i.who ?? "Inji Verify"),
      checks: [{ name: "Presentation accepted for verification", ok: false, detail: `${code}${detail ? `: ${detail}` : ""}` }],
    };
  }
  if (i.kind === "external") {
    const named = externalChecks(i.detail);
    const failed = named.filter((c) => !c.ok);
    const detail = named.length ? (failed.length ? failed.map((c) => `${c.name}${c.detail ? `: ${c.detail}` : ""}`).join("; ") : undefined) : externalDetail(i.detail);
    return {
      verdict: verdictFor(i.accepted, i.expected),
      expected: i.expected,
      verifierOutcome: i.accepted ? "ACCEPTED" : "REJECTED",
      credentialStatus: i.accepted ? "SUCCESS" : "INVALID",
      errorCode: i.accepted ? undefined : "REJECTED_BY_VERIFIER",
      errorDetail: i.accepted ? undefined : detail,
      explanation: summarise(i.accepted, i.expected, i.tamper, detail ? `of its own policy checks (${detail.slice(0, 240)})` : "of its own policy checks", i.who),
      checks: [{ name: `${i.who} accepted the presentation`, ok: i.accepted, detail: named.length ? `${named.length} polic${named.length === 1 ? "y" : "ies"} run, ${failed.length} failed` : detail }, ...named],
    };
  }
  const r = i.ref;
  const status = r.credentials[0]?.status ?? (r.accepted ? "SUCCESS" : "INVALID");
  return {
    verdict: verdictFor(r.accepted, i.expected),
    expected: i.expected,
    verifierOutcome: r.accepted ? "ACCEPTED" : "REJECTED",
    credentialStatus: status,
    errorCode: r.errorCode,
    errorDetail: r.errorDetail,
    explanation: summarise(r.accepted, i.expected, i.tamper, r.errorDetail ? `${r.errorCode?.toLowerCase()} failed (${r.errorDetail})` : (r.errorCode ?? "a check failed"), "The Reference Verifier"),
    checks: [...r.checks, ...r.credentials.flatMap((c) => c.checks)],
  };
}
