import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { defaultGatewayFromRoutes, isThisComputer, publicExposureGuard } from "../src/gateway/exposure.js";

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

  it("cannot be talked out of it with a forwarded-host header or a different Host", async () => {
    await request(tunnel).get("/api/runs").set("host", "abc.trycloudflare.com").set("x-forwarded-host", "localhost:8080").expect(404);
    await request(tunnel).get("/api/runs").set("host", "localhost:8080").set("x-forwarded-host", "localhost:8080, abc.trycloudflare.com").expect(404);
    await request(tunnel).get("/api/runs").set("host", "playground:8080").set("cf-connecting-ip", "203.0.113.9").expect(404);
  });

  it("serves everything on this machine", async () => {
    await request(tunnel).get("/api/runs").set("host", "localhost:8080").expect(200);
  });

  it("does nothing for a plain-HTTP local setup, or when PUBLIC_UI opts in", async () => {
    await request(app("http://playground.localhost:8080")).get("/api/runs").set("host", "playground.localhost:8080").expect(200);
    await request(app("https://abc.trycloudflare.com", true)).get("/api/runs").set("host", "abc.trycloudflare.com").expect(200);
  });
});

describe("this computer", () => {
  const routes = "Iface\tDestination\tGateway \tFlags\neth0\t00000000\t010014AC\t0003\neth0\t000014AC\t00000000\t0001\n";

  it("reads the default gateway from /proc/net/route", () => {
    expect(defaultGatewayFromRoutes(routes)).toBe("172.20.0.1");
    expect(defaultGatewayFromRoutes("Iface\tDestination\tGateway\n")).toBeUndefined();
  });

  it("trusts loopback and, in a container, the bridge gateway, but not other addresses", () => {
    expect(isThisComputer("127.0.0.1", undefined)).toBe(true);
    expect(isThisComputer("::ffff:172.20.0.1", "172.20.0.1")).toBe(true);
    expect(isThisComputer("172.20.0.1", undefined)).toBe(false);
    expect(isThisComputer("192.168.1.23", "172.20.0.1")).toBe(false);
    expect(isThisComputer("172.20.0.5", "172.20.0.1")).toBe(false);
  });
});
