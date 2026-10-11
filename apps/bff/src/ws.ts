/** Live feed: protocol events and run updates over one WebSocket (/ws?run=<id> or /ws for everything). */
import { ServerResponse, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { EventSummary, Run } from "@playground/core";
import type { Recorder } from "./gateway/recorder.js";
import type { Orchestrator } from "./runs/orchestrator.js";

export function attachWebSocket(server: Server, recorder: Recorder, orchestrator: Orchestrator, app: (req: IncomingMessage, res: ServerResponse) => void) {
  const wss = new WebSocketServer({ noServer: true });
  // Java's HttpClient (Certify's and Verify's JSON-LD loaders) sends "Upgrade: h2c" on plain GETs. Node hands
  // every upgrade to this listener, so anything that is not our WebSocket goes back to the HTTP app.
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const isWs = String(req.headers.upgrade ?? "").toLowerCase() === "websocket" && (req.url ?? "").split("?")[0] === "/ws";
    if (isWs) return void wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    delete req.headers.upgrade;
    const res = new ServerResponse(req);
    res.assignSocket(socket as never);
    res.shouldKeepAlive = false;
    res.on("finish", () => {
      res.detachSocket(socket as never);
      socket.end();
    });
    app(req, res);
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
    for (const [ws, want] of subs) if (ws.readyState === WebSocket.OPEN && (want === null || want === runId)) ws.send(msg);
  };
  recorder.on("event", (e: EventSummary) => send(e.runId, { type: "event", event: e }));
  orchestrator.on("run", (r: Run) => send(r.id, { type: "run", run: r }));
  const ping = setInterval(() => wss.clients.forEach((c) => c.readyState === WebSocket.OPEN && c.ping()), 25_000);
  wss.on("close", () => clearInterval(ping));
  return wss;
}
