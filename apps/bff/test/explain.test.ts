import { describe, expect, it } from "vitest";
import { explainResult } from "../src/runs/explain.js";
import { expectationFor } from "../src/runs/orchestrator.js";

const ok = { verifiableCredential: "{}", allChecksSuccessful: true, schemaAndSignatureCheck: { valid: true, error: null }, expiryCheck: { valid: true } };
const bad = { ...ok, allChecksSuccessful: false, schemaAndSignatureCheck: { valid: false, error: { errorCode: "ERR_SIGNATURE_VERIFICATION_FAILED", errorMessage: "x" } } };

describe("run verdicts", () => {
  it("passes an honest run the verifier accepts", () => {
    const r = explainResult({ kind: "inji-vp", expected: "PASS", tamper: "none", vp: { transactionId: "t", allChecksSuccessful: true, credentialResults: [ok] } });
    expect(r).toMatchObject({ verdict: "PASS", verifierOutcome: "ACCEPTED", credentialStatus: "SUCCESS" });
  });
  it("counts a correctly rejected tamper as a pass, and an accepted tamper as a finding", () => {
    expect(explainResult({ kind: "inji-vp", expected: "FAIL", tamper: "alter-claim", vp: { transactionId: "t", allChecksSuccessful: false, credentialResults: [bad] } }).verdict).toBe("PASS");
    const accepted = explainResult({ kind: "inji-vp", expected: "FAIL", tamper: "wrong-nonce", vp: { transactionId: "t", allChecksSuccessful: true, credentialResults: [ok] } });
    expect(accepted.verdict).toBe("FAIL");
    expect(accepted.explanation).toMatch(/ACCEPTED a tampered presentation/);
  });
  it("expects expired credentials and tampered presentations to be rejected", () => {
    expect(expectationFor({ tamper: "none" }, { expiresAt: "" })).toBe("PASS");
    expect(expectationFor({ tamper: "none" }, { expiresAt: "2020-01-01T00:00:00.000Z" })).toBe("FAIL");
    expect(expectationFor({ tamper: "foreign-holder" }, { expiresAt: "" })).toBe("FAIL");
  });
});
