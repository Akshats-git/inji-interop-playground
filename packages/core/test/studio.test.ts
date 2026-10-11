import { describe, expect, it } from "vitest";
import { buildCertifyConfiguration, CERTIFY_VCT_MAX, shortTypeId, vctFor, buildVelocityTemplate, coerceClaims, configIdOf, CredentialTypeInput, publicUrlsFor, type IssuerProfile } from "../src/index.js";

const issuer: IssuerProfile = { id: "1", slug: "agri-dept", name: 'Agri "Dept" $1 #2', description: "", logoUrl: "", backgroundColor: "#1F4D3A", textColor: "#FFFFFF", createdAt: "" };
const base = (over: Partial<CredentialTypeInput> = {}) =>
  CredentialTypeInput.parse({
    issuerSlug: "agri-dept",
    typeName: "FarmerCard",
    displayName: "Farmer Card",
    format: "ldp_vc",
    fields: [
      { name: "fullName", label: "Full name" },
      { name: "acres", label: "Acres", kind: "number", required: false },
    ],
    ...over,
  });

describe("credential type model", () => {
  it("rejects reserved and malformed field names", () => {
    expect(() => base({ fields: [{ name: "id", label: "x" }] as never })).toThrow();
    expect(() => base({ fields: [{ name: "full name", label: "x" }] as never })).toThrow();
    expect(() => base({ fields: [{ name: "a", label: "x" }, { name: "a", label: "y" }] as never })).toThrow();
  });

  it("scopes Certify config ids by issuer and format", () => {
    expect(configIdOf(base())).toBe("agri-dept__FarmerCard");
    expect(configIdOf(base({ format: "vc+sd-jwt" }))).toBe("agri-dept__FarmerCard__sdjwt");
  });

  it("uses did:web on https origins and URL keys on plain http", () => {
    expect(publicUrlsFor("https://abc.trycloudflare.com", base()).issuerId).toBe("did:web:abc.trycloudflare.com:pub:issuers:agri-dept");
    const local = publicUrlsFor("http://playground.localhost:8080", base());
    expect(local.issuerId).toBe("http://playground.localhost:8080/pub/issuers/agri-dept");
    expect(local.keyBase).toBe("http://playground.localhost:8080/pub/issuers/agri-dept/keys/EdDSA");
  });
});

describe("velocity template", () => {
  const urls = publicUrlsFor("http://h", base());

  it("uses validFrom/validUntil for Data Model 2.0 and issuanceDate/expirationDate for 1.1", () => {
    expect(buildVelocityTemplate(urls, base({ dataModel: "2.0" }), issuer)).toContain('"validFrom": "${validFrom}"');
    const v11 = buildVelocityTemplate(urls, base({ dataModel: "1.1" }), issuer);
    expect(v11).toContain('"issuanceDate": "${validFrom}"');
    expect(v11).toContain("https://www.w3.org/2018/credentials/v1");
  });

  it("escapes string claims and neutralises Velocity syntax in literals", () => {
    const tpl = buildVelocityTemplate(urls, base({ issuerForm: "object" }), issuer);
    expect(tpl).toContain('"fullName": "$!{_esc.java($fullName)}"');
    expect(tpl).toContain("${_esc.d}1");
    expect(tpl).toContain("${_esc.h}2");
    expect(tpl).toContain('\\"Dept\\"');
  });

  it("renders optional numbers as null when absent", () => {
    expect(buildVelocityTemplate(urls, base(), issuer)).toContain('#if("$!acres" != "")$acres#{else}null#end');
  });

  it("can hard-code a past expiry to produce expired credentials", () => {
    expect(buildVelocityTemplate(urls, base({ expiresAt: "2024-01-01T00:00:00.000Z" }), issuer)).toContain('"validUntil": "2024-01-01T00:00:00.000Z"');
  });
});

describe("Certify configuration", () => {
  it("maps signature suites to Certify key aliases", () => {
    const c = buildCertifyConfiguration("http://h", base({ ldpSuite: "EcdsaSecp256r1Signature2019" }), issuer);
    expect(c).toMatchObject({ signatureAlgo: "ES256", keyManagerAppId: "CERTIFY_VC_SIGN_EC_R1", keyManagerRefId: "EC_SECP256R1_SIGN", credentialFormat: "ldp_vc" });
  });

  it("builds SD-JWT configs with vct and selectively disclosable claims", () => {
    const c = buildCertifyConfiguration("http://h", base({ format: "vc+sd-jwt", fields: [{ name: "a", label: "A", selectivelyDisclosable: false }, { name: "b", label: "B" }] as never }), issuer);
    expect(c.credentialFormat).toBe("vc+sd-jwt");
    expect(c.sdJwtVct).toBe("http://h/pub/issuers/agri-dept/types/FarmerCard");
    expect(c.sdClaim).toBe("$.b");
    const tpl = atob(c.vcTemplate);
    expect(JSON.parse(tpl.replace(/"\$!\{_esc\.java\(\$\w+\)\}"/g, '"x"'))).toMatchObject({ a: "x", b: "x" });
  });

  it("only requests revocation for Data Model 2.0 (Certify attaches status lists to 2.0 only)", () => {
    expect(buildCertifyConfiguration("http://h", base({ revocable: true, dataModel: "2.0" }), issuer).credentialStatusPurposes).toEqual(["revocation"]);
    expect(buildCertifyConfiguration("http://h", base({ revocable: true, dataModel: "1.1" }), issuer).credentialStatusPurposes).toBeUndefined();
  });
});

describe("claims", () => {
  it("coerces and validates form input", () => {
    const t = base({ fields: [{ name: "n", label: "N", kind: "number" }, { name: "c", label: "C", kind: "choice", options: ["A", "B"] }, { name: "d", label: "D", kind: "date", required: false }] as never });
    expect(coerceClaims(t, { n: "3.5", c: "A" })).toMatchObject({ ok: true, claims: { n: 3.5, c: "A" } });
    expect(coerceClaims(t, { n: "x", c: "Z", d: "1/2/2020" }).errors).toEqual({ n: "must be a number", c: "one of: A, B", d: "use YYYY-MM-DD" });
  });
});

describe("vctFor", () => {
  const t = { issuerSlug: "agri-dept", typeName: "KarnatakaFarmerCard" };

  it("uses the readable type-metadata URL when it fits Certify's 100-character ledger column", () => {
    expect(vctFor("http://playground.localhost:8080", t)).toBe("http://playground.localhost:8080/pub/issuers/agri-dept/types/KarnatakaFarmerCard");
  });

  it("falls back to a short, stable URL on long hosts", () => {
    const base = "https://appearing-calvin-bonus-rows.trycloudflare.com";
    const vct = vctFor(base, t);
    expect(vct.length).toBeLessThanOrEqual(CERTIFY_VCT_MAX);
    expect(vct).toBe(`${base}/pub/vct/${shortTypeId("agri-dept", "KarnatakaFarmerCard")}`);
    expect(shortTypeId("agri-dept", "KarnatakaFarmerCard")).not.toBe(shortTypeId("agri-dept", "KarnatakaFarmerCardX"));
  });
});
