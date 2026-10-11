import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { publicExposureGuard } from "../src/gateway/exposure.js";

function app(publicBaseUrl: string, publicUi = false) {
  const a = express();
  a.use(publicExposureGuard({ publicBaseUrl, publicUi }));
  a.get(/.*/, (_req, res) => void res.send("ok"));
  return a;
}

describe("public exposure guard", () => {
  const tunnel = app("https://abc.trycloudflare.com");

  it("lets wallets reach /pub/* through the public URL", async () => {
    await request(tunnel).get("/pub/certify/v1/certify/.well-known/openid-credential-issuer").set("host", "abc.trycloudflare.com").expect(200);
  });

  it("keeps the API and UI off the public URL", async () => {
    await request(tunnel).get("/api/events/x?reveal=1").set("host", "abc.trycloudflare.com").expect(404);
    await request(tunnel).get("/studio").set("x-forwarded-host", "ABC.trycloudflare.com").expect(404);
    await request(tunnel).get("/publicity").set("host", "abc.trycloudflare.com").expect(404);
  });

  it("serves everything on this machine", async () => {
    await request(tunnel).get("/api/runs").set("host", "localhost:8080").expect(200);
  });

  it("does nothing for a plain-HTTP local setup, or when PUBLIC_UI opts in", async () => {
    await request(app("http://playground.localhost:8080")).get("/api/runs").set("host", "playground.localhost:8080").expect(200);
    await request(app("https://abc.trycloudflare.com", true)).get("/api/runs").set("host", "abc.trycloudflare.com").expect(200);
  });
});
