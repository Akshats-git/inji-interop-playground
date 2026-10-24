import { connect } from "node:net";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory.js";
import { Recorder } from "../src/gateway/recorder.js";
import { attachWebSocket } from "../src/ws.js";
import { EventEmitter } from "node:events";
import type { Orchestrator } from "../src/runs/orchestrator.js";

/** The HTTP server as main.ts wires it: an Express app plus the WebSocket upgrade listener. */
let server: Server;
let port = 0;
beforeAll(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.all("/echo", (req, res) => void res.json({ method: req.method, body: req.body }));
  server = createServer(app);
  attachWebSocket(server, new Recorder(new MemoryStore()), new EventEmitter() as unknown as Orchestrator);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

/** Send raw bytes (as Java's HttpClient and ktor do, with an h2c upgrade offer) and read the whole reply. */
function raw(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const s = connect(port, "127.0.0.1", () => s.end(text));
    let out = "";
    s.on("data", (d) => (out += d.toString()));
    s.on("end", () => resolve(out));
    s.on("error", reject);
    setTimeout(() => (s.destroy(), resolve(out)), 3000);
  });
}

describe("requests that offer an h2c upgrade", () => {
  it("keeps the body of a POST (ktor sends vp_token this way)", async () => {
    const body = "vp_token=abc&state=xyz";
    const reply = await raw(
      `POST /echo HTTP/1.1\r\nHost: x\r\nConnection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAEAAEAAAAIAAAAAAAMAAAAAAAQBAAAAAAUAAEAAAAYABgAA\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}`,
    );
    expect(reply).toMatch(/^HTTP\/1.1 200/);
    expect(reply).toContain('"body":{"vp_token":"abc","state":"xyz"}');
  });

  it("still answers a plain GET", async () => {
    const reply = await raw(
      "GET /echo HTTP/1.1\r\nHost: x\r\nConnection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAEAAEAA\r\n\r\n",
    );
    expect(reply).toMatch(/^HTTP\/1.1 200/);
    expect(reply).toContain('"method":"GET"');
  });
});
