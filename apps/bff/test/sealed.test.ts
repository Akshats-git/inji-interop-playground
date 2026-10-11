import { describe, expect, it } from "vitest";
import { Sealer } from "../src/util/sealed.js";

describe("Sealer (AES-256-GCM at rest)", () => {
  const s = Sealer.ephemeral();
  it("round-trips and does not leave plaintext in the ciphertext", () => {
    const sealed = s.seal({ fullName: "Ramesh Kumar" }, "evt-1");
    expect(sealed.data.toString("utf8")).not.toContain("Ramesh");
    expect(s.open(sealed, "evt-1")).toEqual({ fullName: "Ramesh Kumar" });
  });
  it("rejects tampered ciphertext and a different record id (AAD)", () => {
    const sealed = s.seal({ a: 1 }, "evt-1");
    expect(() => s.open(sealed, "evt-2")).toThrow();
    sealed.data[0] = sealed.data[0]! ^ 1;
    expect(() => s.open(sealed, "evt-1")).toThrow();
  });
  it("refuses keys of the wrong size", () => {
    expect(() => new Sealer(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
