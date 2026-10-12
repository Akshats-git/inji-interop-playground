import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, select } from "@playground/core";
import { loadPartiesFile, PartiesService, PartyError } from "../src/parties/service.js";
import { Recorder } from "../src/gateway/recorder.js";
import { MemoryStore } from "../src/store/memory.js";

const INFRA = resolve(import.meta.dirname, "../../../infra");

/** A copy of infra/ with freshly generated lab keys, as ./playground.sh up --external makes them. */
function infraWithKeys() {
  const dir = mkdtempSync(join(tmpdir(), "parties-"));
  cpSync(join(INFRA, "parties.yaml"), join(dir, "parties.yaml"));
  mkdirSync(join(dir, "external/keys"), { recursive: true });
  const key = join(dir, "external/keys/waltid-demo.key.pem");
  execFileSync("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key]);
  execFileSync("openssl", ["req", "-new", "-x509", "-key", key, "-out", join(dir, "external/keys/waltid-demo.cert.pem"), "-days", "2", "-subj", "/CN=test"]);
  return dir;
}

describe("the shipped parties file", () => {
  it("loads without problems once the lab keys exist", () => {
    const loaded = loadPartiesFile(join(infraWithKeys(), "parties.yaml"));
    expect(loaded.errors).toEqual([]);
    expect(loaded.data.issuers.map((i) => i.id)).toEqual(["waltid-demo"]);
    expect(loaded.data.verifiers.map((v) => v.id)).toEqual(["waltid-verifier"]);
    expect(loaded.data.wallets.map((w) => w.id)).toEqual(["waltid-wallet"]);
    // ${jwk:…} turned the PEM key into a JWK the issuer API can use.
    const body = loaded.data.issuers[0]!.types[0]!.offer![0]!.body as { issuerKey: { jwk: Record<string, string> } };
    expect(body.issuerKey.jwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(typeof body.issuerKey.jwk.d).toBe("string");
  });

  it("skips only the entries it cannot read, and says why", () => {
    const loaded = loadPartiesFile(join(INFRA, "parties.yaml"), {});
    // Without generated keys the issuer cannot load, but the verifier and wallet still do.
    if (loaded.data.issuers.length === 0) expect(loaded.errors.some((e) => e.startsWith("issuers[0] (waltid-demo)"))).toBe(true);
    expect(loaded.data.verifiers).toHaveLength(1);
    expect(loaded.data.wallets).toHaveLength(1);
  });

  it("lists external types and parties next to the built-in ones", async () => {
    const parties = PartiesService.fromFile(join(infraWithKeys(), "parties.yaml"));
    expect(parties.catalog().map((t) => t.id)).toEqual(["ext:waltid-demo/library-card", "ext:waltid-demo/university-degree"]);
    expect(parties.catalog()[0]).toMatchObject({ origin: "external", format: "vc+sd-jwt", canIssue: true, vct: "http://waltid-issuer:7002/LibraryCard" });
    expect(parties.wallets().map((w) => w.id)).toEqual(["reference-wallet", "inji-wallet", "inji-web", "external-wallet", "waltid-wallet"]);
    expect(parties.wallet("waltid-wallet")).toMatchObject({ interactive: false, supportsDirectShare: false, supportsTamper: false });
    expect(parties.verifier("waltid-verifier")).toMatchObject({ ownQuery: true, formats: ["vc+sd-jwt"] });
    expect(await parties.trustedJwks()).toHaveLength(1);
  });
});

describe("loading problems", () => {
  const write = (yaml: string) => {
    const dir = mkdtempSync(join(tmpdir(), "parties-"));
    writeFileSync(join(dir, "p.yaml"), yaml);
    return join(dir, "p.yaml");
  };
  it("reports a missing file without failing", () => {
    expect(loadPartiesFile("/nowhere/parties.yaml").errors[0]).toMatch(/does not exist/);
  });
  it("names the field that is wrong", () => {
    const loaded = loadPartiesFile(write("verifiers:\n  - id: Bad Id\n    name: x\n    formats: [ldp_vc]\n    request: [{ url: http://x, save: { requestUri: $ } }]\n    result: [{ url: http://x, save: { verified: $ } }]\n"));
    expect(loaded.errors.join(" ")).toMatch(/verifiers\[0\] \(Bad Id\)\.id/);
  });
  it("catches steps that never save what the run needs", () => {
    const loaded = loadPartiesFile(write("verifiers:\n  - id: v1\n    name: Verifier\n    formats: [ldp_vc]\n    request: [{ url: http://x }]\n    result: [{ url: http://x, save: { verified: $ } }]\n"));
    expect(loaded.errors).toContain('verifier v1: the request steps never save "requestUri".');
  });
});

describe("templates", () => {
  it("keeps a whole placeholder's type and inserts partial ones as text", () => {
    const ctx = { claims: { a: 1, b: "x" }, token: "t0k", n: 3 };
    expect(render({ data: "${claims}", auth: "Bearer ${token}", list: ["${n}"] }, ctx)).toEqual({ data: { a: 1, b: "x" }, auth: "Bearer t0k", list: [3] });
    expect(render("${claims.b}-${n}", ctx)).toBe("x-3");
  });
  it("refuses unknown placeholders instead of sending 'undefined'", () => {
    expect(() => render("${nope}", {})).toThrow(/Unknown placeholder/);
  });
  it("selects from JSON, text, headers and URI query parameters", () => {
    const res = { body: { wallets: [{ id: "w1" }] }, text: "", headers: { location: "/x" } };
    expect(select("$.wallets[0].id", res)).toBe("w1");
    expect(select("header:location", res)).toBe("/x");
    const uri = "openid4vp://authorize?state=abc&client_id=v";
    expect(select("query:state", { body: uri, text: uri, headers: {} })).toBe("abc");
    expect(select("$", { body: uri, text: uri, headers: {} })).toBe(uri);
  });
});

describe("running steps", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(express.text());
    app.post("/login", (req, res) => void res.json({ token: req.body.password === "pw" ? "tok-1" : null }));
    app.get("/wallets", (req, res) => void res.json({ wallets: [{ id: req.headers.authorization === "Bearer tok-1" ? "w-9" : "nope" }] }));
    app.post("/use/:w", (req, res) => void res.type("text").send(`openid-credential-offer://?got=${req.params.w}:${req.body}`));
    app.post("/fail", (_req, res) => void res.status(400).json({ error: "bad" }));
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("chains saved values through the steps and records each exchange", async () => {
    const store = new MemoryStore();
    const recorder = new Recorder(store);
    const parties = PartiesService.fromFile(undefined);
    const saved = await parties.runSteps(
      [
        { method: "POST", url: `${base}/login`, headers: {}, body: { password: "${pw}" }, save: { token: "$.token" }, okStatus: [200] },
        { method: "GET", url: `${base}/wallets`, headers: { authorization: "Bearer ${token}" }, save: { walletId: "$.wallets[0].id" }, okStatus: [200] },
        { title: "Use it", method: "POST", url: `${base}/use/\${walletId}`, headers: {}, body: "${offer}", save: { offerUri: "$" }, okStatus: [200] },
      ],
      { pw: "pw", offer: "hello" },
      { recorder, runId: "run-1", from: "verifier-backend", to: "external-wallet", phase: "issuance" },
    );
    expect(saved).toEqual({ token: "tok-1", walletId: "w-9", offerUri: "openid-credential-offer://?got=w-9:hello" });
    const events = await store.listEvents({ runId: "run-1" });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.to)).toEqual(["external-wallet", "external-wallet", "external-wallet"]);
    expect(events.some((e) => e.title === "Use it")).toBe(true);
  });

  it("stops with the other side's answer when a step fails", async () => {
    const parties = PartiesService.fromFile(undefined);
    const err = await parties.runSteps([{ method: "POST", url: `${base}/fail`, headers: {}, body: {}, save: {}, okStatus: [200] }], {}, { from: "verifier-backend", to: "external-issuer", phase: "issuance" }).catch((e) => e);
    expect(err).toBeInstanceOf(PartyError);
    expect(err.message).toMatch(/HTTP 400/);
    expect(err.detail).toEqual({ error: "bad" });
  });

  it("says plainly when a party is not running", async () => {
    const parties = PartiesService.fromFile(undefined);
    const err = await parties.runSteps([{ method: "GET", url: "http://127.0.0.1:1/x", headers: {}, save: {}, okStatus: [200] }], {}, { from: "verifier-backend", to: "external-issuer", phase: "issuance" }).catch((e) => e);
    expect(err.code).toBe("unreachable");
    expect(err.message).toMatch(/not reachable/);
  });
});
