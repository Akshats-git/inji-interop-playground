import { describe, expect, it } from "vitest";
import { bytesToB64url, decodeSdJwt, mask, maskSecrets, parseCredentialOffer, sniff } from "../src/index.js";

const enc = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));

describe("decoders", () => {
  it("decodes SD-JWT disclosures and key binding", () => {
    const jwt = `${enc({ alg: "ES256" })}.${enc({ _sd: ["x"], vct: "v" })}.sig`;
    const disc = enc(["salt", "crop", "Ragi"]);
    const kb = `${enc({ typ: "kb+jwt", alg: "ES256" })}.${enc({ nonce: "n" })}.sig`;
    const d = decodeSdJwt(`${jwt}~${disc}~${kb}`)!;
    expect(d.disclosures).toEqual([{ raw: disc, salt: "salt", name: "crop", value: "Ragi" }]);
    expect(d.keyBinding?.payload.nonce).toBe("n");
  });
  it("parses credential offers by reference", () => {
    const o = parseCredentialOffer("openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fi%2Foffer%2F1")!;
    expect(o).toMatchObject({ byReference: true, credentialOfferUri: "https://i/offer/1" });
    expect(sniff("openid-credential-offer://?credential_offer_uri=x").kind).toBe("credential-offer");
    expect(sniff("openid4vp://?client_id=a&request_uri=b").kind).toBe("authorization-request");
  });
  it("masks secrets but keeps structure", () => {
    expect(maskSecrets({ access_token: "abcdefghijklmnop", nested: { "pre-authorized_code": "1234567890" }, keep: "x" })).toEqual({ access_token: "abcd●●●●mnop", nested: { "pre-authorized_code": "1234●●●●7890" }, keep: "x" });
    expect(mask("Bearer abcdefghijkl")).toBe("Bearer abcd●●●●ijkl");
  });
});
