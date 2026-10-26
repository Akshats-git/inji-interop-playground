import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Recorder } from "../src/gateway/recorder.js";
import { certifyRoute, recordingProxy } from "../src/gateway/proxy.js";
import { MemoryStore } from "../src/store/memory.js";

/** A fake Certify that echoes what it receives, so we can see what the gateway lets through. */
let upstream: Server;
let target = "";
beforeAll(async () => {
  const fake = express();
  fake.use(express.json());
  fake.all("*", (req, res) => void res.json({ path: req.path, body: req.body, c_nonce: "nonce-123456" }));
  upstream = createServer(fake);
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});
afterAll(() => upstream.close());

function app() {
  const store = new MemoryStore();
  const recorder = new Recorder(store);
  const a = express();
  a.use(recordingProxy(certifyRoute(target), recorder));
  return { a, store, recorder };
}

describe("recording gateway", () => {
  it("never exposes Certify's admin APIs", async () => {
    const { a } = app();
    for (const [m, p] of [
      ["post", "/pub/certify/v1/certify/credential-configurations"],
      ["post", "/pub/certify/v1/certify/pre-authorized-data"],
      ["post", "/pub/certify/v1/certify/ledger-search"],
      ["post", "/pub/certify/v1/certify/credentials/status"],
    ] as const) {
      const r = await request(a)[m](p).send({});
      expect(r.status, p).toBe(404);
      expect(r.body.error).toBe("not_exposed");
    }
  });

  it("maps <issuer>/.well-known/* onto Certify's servlet path and forwards wallet calls", async () => {
    const { a } = app();
    const r = await request(a).get("/pub/certify/.well-known/openid-credential-issuer");
    expect(r.status).toBe(200);
    expect(r.body.path).toBe("/v1/certify/.well-known/openid-credential-issuer");
  });

  it("records each exchange, classified and attributed to the run that owns its identifiers", async () => {
    const { a, store, recorder } = app();
    recorder.bind("run-1", "preauth-code-abc");
    await request(a).post("/pub/certify/v1/certify/oauth/token").type("form").send({
      grant_type: "urn:ietf:params:oauth:grant-type:pre-authorized_code",
      "pre-authorized_code": "preauth-code-abc",
    });
    await new Promise((r) => setTimeout(r, 20));
    const events = await store.listEvents({ runId: "run-1" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      title: "Token request",
      from: "wallet",
      to: "certify",
      phase: "issuance",
    });
    expect(events[0]!.labels).toContain("pre-authorized_code");
    expect(events[0]!.labels).toContain("c_nonce issued");
  });
});
