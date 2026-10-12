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

describe("external verifier verdicts", () => {
  const detail = { results: [{ credential: "eyJ…", policyResults: [{ policy: "signature_sd-jwt-vc", is_success: false, error: "holder key binding could not be verified\n\tat …" }, { policy: "expired", is_success: true }] }] };
  it("lists the verifier's own policies as checks and keeps the credential out of them", async () => {
    const { explainResult, externalChecks } = await import("../src/runs/explain.js");
    expect(externalChecks(detail)).toEqual([
      { name: "signature_sd-jwt-vc", ok: false, detail: "holder key binding could not be verified" },
      { name: "expired", ok: true, detail: undefined },
    ]);
    const r = explainResult({ kind: "external", who: "walt.id Verifier", accepted: false, detail, expected: "PASS", tamper: "none" });
    expect(r.verifierOutcome).toBe("REJECTED");
    expect(r.errorDetail).toBe("signature_sd-jwt-vc: holder key binding could not be verified");
    expect(r.checks.map((c) => c.name)).toEqual(["walt.id Verifier accepted the presentation", "signature_sd-jwt-vc", "expired"]);
    expect(JSON.stringify(r)).not.toContain("eyJ");
  });
});
