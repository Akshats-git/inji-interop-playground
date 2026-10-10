import { describe, expect, it } from "vitest";
import { filterMatches, jsonPath, toDcql, toPresentationDefinition, validateDcql, type QuerySpec } from "../src/index.js";

const ldp: QuerySpec = { id: "farmer", purpose: "Check crop", format: "ldp_vc", typeName: "FarmerCard", claims: ["primaryCropType"], requireHolderBinding: true };
const sd: QuerySpec = { id: "farmer", purpose: "Check crop", format: "vc+sd-jwt", vct: "https://x/types/Farmer", claims: ["crop"], requireHolderBinding: true };

describe("presentation exchange", () => {
  it("writes the type filter in Inji's dialect by default", () => {
    const pd = toPresentationDefinition(ldp);
    expect(pd.input_descriptors[0]!.constraints.fields[0]).toEqual({ path: ["$.type"], filter: { type: "object", pattern: "FarmerCard" } });
    expect(pd.input_descriptors[0]!.constraints.fields[1]).toEqual({ path: ["$.credentialSubject.primaryCropType"] });
  });
  it("can write spec-style JSON Schema filters", () => {
    expect(toPresentationDefinition(ldp, "spec").input_descriptors[0]!.constraints.fields[0]!.filter).toEqual({ type: "array", contains: { const: "FarmerCard" } });
  });
  it("asks SD-JWT wallets to limit disclosure", () => {
    expect(toPresentationDefinition(sd).input_descriptors[0]!.constraints.limit_disclosure).toBe("required");
  });
  it("matches both dialects", () => {
    const types = ["VerifiableCredential", "FarmerCard"];
    expect(filterMatches({ type: "object", pattern: "FarmerCard" }, types)).toBe(true);
    expect(filterMatches({ type: "array", contains: { const: "FarmerCard" } }, types)).toBe(true);
    expect(filterMatches({ type: "array", contains: { const: "Other" } }, types)).toBe(false);
    expect(jsonPath({ credentialSubject: { a: { b: 1 } } }, "$.credentialSubject.a.b")).toBe(1);
  });
});

describe("DCQL", () => {
  it("maps PE fields onto DCQL claims and meta", () => {
    expect(toDcql(ldp, { typeIri: "https://x/vocab#FarmerCard" }).credentials[0]).toMatchObject({ format: "ldp_vc", meta: { type_values: [["https://www.w3.org/2018/credentials#VerifiableCredential", "https://x/vocab#FarmerCard"]] }, claims: [{ path: ["credentialSubject", "primaryCropType"] }] });
    expect(toDcql(sd).credentials[0]).toMatchObject({ format: "dc+sd-jwt", meta: { vct_values: ["https://x/types/Farmer"] }, claims: [{ path: ["crop"] }] });
  });
  it("rejects the combinations Inji Verify 1.0 rejects", () => {
    expect(validateDcql({ credentials: [{ id: "a", format: "ldp_vc", meta: { vct_values: ["x"] } }] }).map((e) => e.code)).toEqual(["DCQL_META_NOT_MATCHING_FORMAT"]);
    expect(validateDcql(toDcql(sd))).toEqual([]);
  });
});
