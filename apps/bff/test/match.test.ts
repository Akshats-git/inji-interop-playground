import { describe, expect, it } from "vitest";
import { toDcql, toPresentationDefinition, bytesToB64url } from "@playground/core";
import { match, type AuthorizationRequest, type WalletCredential } from "../src/reference/wallet/presentation.js";

const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
const holder = { kind: "ed25519" as const, privateJwk: {}, publicJwk: {} };
const ldp: WalletCredential = { id: "a", format: "ldp_vc", holder, credential: { type: ["VerifiableCredential", "FarmerCard"], credentialSubject: { crop: "Ragi" } } };
const sd: WalletCredential = { id: "b", format: "vc+sd-jwt", holder, credential: `${enc({ alg: "ES256" })}.${enc({ vct: "https://x/Farmer", _sd: [] })}.sig~${enc(["s", "crop", "Ragi"])}~` };
const spec = { id: "q", purpose: "p", claims: ["crop"], requireHolderBinding: true };
const req = (q: Partial<AuthorizationRequest>): AuthorizationRequest => ({ clientId: "c", clientIdScheme: "x", nonce: "n", responseUri: "r", responseMode: "direct_post", transport: "by_value", raw: {}, ...q });

describe("Reference Wallet matching", () => {
  it("answers PE in both filter dialects", () => {
    for (const dialect of ["inji", "spec"] as const) {
      const m = match(req({ presentationDefinition: toPresentationDefinition({ ...spec, format: "ldp_vc", typeName: "FarmerCard" }, dialect) }), [sd, ldp]);
      expect(m.map((x) => x.credential.id)).toEqual(["a"]);
    }
  });
  it("answers DCQL by vct for SD-JWT and requests only the asked-for claims", () => {
    const m = match(req({ dcqlQuery: toDcql({ ...spec, format: "vc+sd-jwt", vct: "https://x/Farmer" }) }), [ldp, sd]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ queryId: "q-credential", requested: ["crop"] });
  });
  it("finds nothing when no credential fits", () => {
    expect(match(req({ dcqlQuery: toDcql({ ...spec, format: "vc+sd-jwt", vct: "https://other" }) }), [ldp, sd])).toEqual([]);
  });
});
