/** Live feed: protocol events and run updates over one WebSocket (/ws?run=<id> or /ws for everything). */
import { type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { EventSummary, Run } from "@playground/core";
import type { Recorder } from "./gateway/recorder.js";
import type { Orchestrator } from "./runs/orchestrator.js";

/** The request line and headers again, minus the h2c upgrade (Upgrade, HTTP2-Settings and Connection). */
export function withoutUpgrade(req: IncomingMessage): Buffer {
  const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]!;
    if (["upgrade", "http2-settings", "connection"].includes(name.toLowerCase())) continue;
    lines.push(`${name}: ${req.rawHeaders[i + 1]}`);
  }
  return Buffer.from(`${lines.join("\r\n")}\r\n\r\n`, "latin1");
}

export function attachWebSocket(
  server: Server,
  recorder: Recorder,
  orchestrator: Orchestrator,
  allowFeed: (req: IncomingMessage) => boolean = () => true,
) {
  const wss = new WebSocketServer({ noServer: true });
  // Java's HttpClient (Certify's and Verify's JSON-LD loaders) and ktor (walt.id) send "Upgrade: h2c" on
  // ordinary requests, POSTs with bodies included. Node hands every upgrade to this listener and detaches the
  // body from the request, so anything that is not our WebSocket is rewritten without the upgrade headers and
  // fed back to the HTTP server, which parses it (body and all) as a normal request.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const isWs =
      String(req.headers.upgrade ?? "").toLowerCase() === "websocket" &&
      (req.url ?? "").split("?")[0] === "/ws";
    if (isWs && !allowFeed(req))
      return void socket.end("HTTP/1.1 404 Not Found\r\nconnection: close\r\n\r\n");
    if (isWs) return void wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    socket.unshift(Buffer.concat([withoutUpgrade(req), head]));
    server.emit("connection", socket);
  });
  const subs = new Map<WebSocket, string | null>();
  wss.on("connection", (ws, req) => {
    const run = new URL(req.url ?? "/ws", "http://x").searchParams.get("run");
    subs.set(ws, run);
    ws.on("close", () => subs.delete(ws));
    ws.send(JSON.stringify({ type: "hello" }));
  });
  const send = (runId: string | null, payload: unknown) => {
    const msg = JSON.stringify(payload);
    for (const [ws, want] of subs)
      if (ws.readyState === WebSocket.OPEN && (want === null || want === runId)) ws.send(msg);
  };
  recorder.on("event", (e: EventSummary) => send(e.runId, { type: "event", event: e }));
  orchestrator.on("run", (r: Run) => send(r.id, { type: "run", run: r }));
  const ping = setInterval(
    () => wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.ping()),
    25_000,
  );
  wss.on("close", () => clearInterval(ping));
  return wss;
}
