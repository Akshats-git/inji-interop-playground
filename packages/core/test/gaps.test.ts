import { describe, expect, it } from "vitest";
import { credentialStatusLabel, knownGapOf, type Run } from "../src/index.js";

const run = (o: { verifier?: string; wallet?: string; format?: "ldp_vc" | "vc+sd-jwt"; tamper?: Run["spec"]["tamper"]; verdict?: "PASS" | "FAIL"; outcome?: NonNullable<Run["result"]>["verifierOutcome"]; externalIssuer?: boolean; explanation?: string }) =>
  ({
    spec: { verifier: o.verifier ?? "inji-verify", wallet: o.wallet ?? "reference-wallet", tamper: o.tamper ?? "none" },
    labels: { format: o.format ?? "vc+sd-jwt", ...(o.externalIssuer ? { external: { issuer: true } } : {}) },
    result: { verdict: o.verdict ?? "FAIL", verifierOutcome: o.outcome ?? "ACCEPTED", explanation: o.explanation ?? "" },
  }) as unknown as Run;

describe("known gaps", () => {
  it("names the Inji Verify SD-JWT weaknesses only when Verify accepted the tampered presentation", () => {
    expect(knownGapOf(run({ tamper: "wrong-nonce" }))).toBe("G19");
    expect(knownGapOf(run({ tamper: "no-holder-proof" }))).toBe("G20");
    expect(knownGapOf(run({ tamper: "self-signed-sdjwt", externalIssuer: true }))).toBe("G11");
    expect(knownGapOf(run({ tamper: "wrong-nonce", format: "ldp_vc" }))).toBeUndefined();
    expect(knownGapOf(run({ tamper: "wrong-nonce", verifier: "reference-verifier" }))).toBeUndefined();
  });

  it("names the walt.id gaps by the parties they involve", () => {
    expect(knownGapOf(run({ wallet: "waltid-wallet", outcome: "NOT_REACHED", explanation: "The run stopped at the issue step: …" }))).toBe("G30");
    expect(knownGapOf(run({ verifier: "waltid-verifier", outcome: "REJECTED" }))).toBe("G32");
    expect(knownGapOf(run({ verifier: "waltid-verifier", outcome: "REJECTED", externalIssuer: true }))).toBeUndefined();
    expect(knownGapOf(run({ wallet: "waltid-wallet", verifier: "reference-verifier", outcome: "REJECTED", externalIssuer: true }))).toBe("G33");
    expect(knownGapOf(run({ wallet: "waltid-wallet", outcome: "NOT_REACHED", externalIssuer: true, explanation: "The run stopped at the present step: …" }))).toBe("G35");
  });

  it("names the gaps found on MOSIP Collab (Inji 1.0) by the hosted parties involved", () => {
    const hosted = (o: Parameters<typeof run>[0] & { query?: "dcql" | "presentation_exchange"; dcqlPaths?: "spec" | "inji"; hostedIssuer?: boolean; detail?: string }) => {
      const r = run(o) as unknown as { spec: Record<string, unknown>; labels: Record<string, unknown>; result: Record<string, unknown> };
      r.spec.query = o.query ?? "dcql";
      r.spec.dcqlPaths = o.dcqlPaths;
      r.labels.hosted = { ...(o.verifier === "collab-verify" ? { verifier: "MOSIP Collab" } : {}), ...(o.hostedIssuer ? { issuer: "MOSIP Collab" } : {}) };
      r.result.errorDetail = o.detail;
      return r as unknown as Run;
    };
    const pathRefusal = "[credential_id: q] vp_token ldp_vc credential does not contain a required claim path declared in the DCQL query.";
    expect(knownGapOf(hosted({ verifier: "collab-verify", format: "ldp_vc", outcome: "REJECTED", detail: pathRefusal }))).toBe("G36");
    expect(knownGapOf(hosted({ verifier: "collab-verify", format: "ldp_vc", outcome: "REJECTED", detail: pathRefusal, dcqlPaths: "inji" }))).toBeUndefined();
    expect(knownGapOf(hosted({ verifier: "collab-verify", tamper: "self-signed-sdjwt", format: "dc+sd-jwt" as never, hostedIssuer: true }))).toBe("G11");
    expect(knownGapOf(hosted({ verifier: "collab-verify", tamper: "wrong-nonce", format: "dc+sd-jwt" as never, hostedIssuer: true }))).toBeUndefined();
    expect(knownGapOf(hosted({ verifier: "reference-verifier", format: "ldp_vc", outcome: "REJECTED", hostedIssuer: true, detail: "Safe mode validation error." }))).toBe("G15");
    expect(knownGapOf(hosted({ verifier: "collab-verify", format: "ldp_vc", outcome: "REJECTED", hostedIssuer: true, detail: "PublicKeyResolutionFailedException: Public key extraction failed for kid: did:web:x#k" }))).toBe("G41");
  });

  it("never explains away a run that behaved as expected, or a new failure", () => {
    expect(knownGapOf(run({ tamper: "wrong-nonce", verdict: "PASS" }))).toBeUndefined();
    expect(knownGapOf(run({ outcome: "REJECTED" }))).toBeUndefined();
  });

  it("speaks Inji Verify's words for credential status", () => {
    expect(credentialStatusLabel("SUCCESS")).toBe("Valid");
    expect(credentialStatusLabel("EXPIRED")).toBe("Valid but expired");
    expect(credentialStatusLabel("INVALID")).toBe("Invalid");
    expect(credentialStatusLabel("UNKNOWN")).toBeUndefined();
  });
});
