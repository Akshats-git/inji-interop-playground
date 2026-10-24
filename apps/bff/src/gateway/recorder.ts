/**
 * The "glass pipe": every protocol message the playground sees is classified, attributed to a run,
 * sealed into the store and pushed live to subscribed browsers.
 *
 * Attribution works in two layers:
 *  1. Identifiers. A run registers values it created or learned (offer id, pre-authorized code, access
 *     token, Verify request/transaction ids, nonces). Any message containing one belongs to that run, and
 *     identifiers found in its response are learned too (e.g. the access token from a token response).
 *  2. Waiting runs. While a run shows a QR to a human, unmatched wallet traffic on that channel goes to it.
 */
import { EventEmitter } from "node:events";
import { maskSecrets, type EventSummary, type HttpMessage, type ProtocolEvent } from "@playground/core";
import { log } from "../log.js";
import type { Store } from "../store/types.js";
import { now, uuid } from "../util/ids.js";
import { actorFrom, classify, type Exchange, type Upstream } from "./classify.js";

const MAX_BODY = 256 * 1024;
const LEARNABLE = [
  "access_token",
  "c_nonce",
  "requestId",
  "transactionId",
  "request_id",
  "transaction_id",
  "state",
  "nonce",
  "pre-authorized_code",
];

export interface RecordInput extends Exchange {
  durationMs: number;
  requestHeaders: Record<string, string | string[] | undefined>;
  responseHeaders: Record<string, string>;
  requestText?: string;
  responseText?: string;
  /** Explicit run attribution (internal calls, or the x-playground-run header). */
  runId?: string | null;
  /** When the request started (defaults to now). */
  at?: string;
}

export class Recorder extends EventEmitter {
  private keys = new Map<string, { runId: string; at: number }>();
  private waiting = new Map<Upstream, string[]>();

  constructor(private readonly store: Store) {
    super();
    this.setMaxListeners(200);
  }

  bind(runId: string, ...values: (string | undefined | null)[]) {
    for (const v of values) if (v && v.length >= 6) this.keys.set(v, { runId, at: Date.now() });
  }

  /** Mark a run as waiting for a human wallet on these upstreams (e.g. phone scanning an offer). */
  await(runId: string, upstreams: Upstream[]) {
    for (const u of upstreams)
      this.waiting.set(u, [...(this.waiting.get(u) ?? []).filter((r) => r !== runId), runId]);
  }
  release(runId: string) {
    for (const [u, list] of this.waiting)
      this.waiting.set(
        u,
        list.filter((r) => r !== runId),
      );
    for (const [k, v] of this.keys) if (v.runId === runId) this.keys.delete(k);
  }

  private correlate(x: RecordInput, texts: string[]): string | null {
    if (x.runId) return x.runId;
    for (const [k, v] of this.keys) if (texts.some((t) => t.includes(k))) return v.runId;
    const w = this.waiting.get(x.upstream);
    return w?.length ? w[w.length - 1]! : null;
  }

  private learn(runId: string, body: unknown) {
    const walk = (v: unknown, depth: number) => {
      if (depth > 4 || !v || typeof v !== "object") return;
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === "string" && LEARNABLE.includes(k)) this.bind(runId, val);
        else if (typeof val === "object") walk(val, depth + 1);
      }
    };
    walk(body, 0);
    // Verify's request_uri ends in the request id; credential offer URIs end in the offer id.
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      for (const k of ["requestUri", "credential_offer_uri"])
        if (typeof b[k] === "string")
          this.bind(
            runId,
            decodeURIComponent(b[k] as string)
              .split("/")
              .pop(),
          );
    }
  }

  async record(x: RecordInput): Promise<ProtocolEvent> {
    const c = classify(x);
    const reqMsg = toMessage(x.requestHeaders, x.requestBody, x.requestText);
    const resMsg = toMessage(x.responseHeaders, x.responseBody, x.responseText);
    const texts = [x.path, x.requestText ?? safeJson(x.requestBody), headerText(x.requestHeaders)];
    const runId = this.correlate(x, texts);
    if (runId) {
      this.learn(runId, x.requestBody);
      this.learn(runId, x.responseBody);
    }
    const event = await this.store.addEvent({
      id: uuid(),
      runId,
      at: x.at ?? now(),
      durationMs: x.durationMs,
      ...c,
      actor: c.from === "wallet" ? actorFrom(x.requestHeaders) : undefined,
      method: x.method,
      path: x.path,
      status: x.status,
      request: reqMsg,
      response: resMsg,
    });
    const { request: _q, response: _r, ...summary } = event;
    this.emit("event", summary satisfies EventSummary, event);
    log.debug({ run: runId, title: event.title, status: event.status }, "recorded");
    return event;
  }

  /** Record a call the BFF made itself (admin APIs over the internal network, reference verifier traffic). */
  async recordInternal(
    input: Omit<RecordInput, "requestHeaders" | "responseHeaders"> & {
      requestHeaders?: RecordInput["requestHeaders"];
      responseHeaders?: Record<string, string>;
    },
  ) {
    try {
      return await this.record({ requestHeaders: {}, responseHeaders: {}, ...input });
    } catch (e) {
      log.warn({ err: e }, "failed to record internal exchange");
      return undefined;
    }
  }
}

const HIDDEN_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "priority",
  "x-playground-run",
  "x-playground-actor",
  "transfer-encoding",
  "keep-alive",
  "date",
  "vary",
  "x-content-type-options",
  "x-xss-protection",
  "pragma",
  "expires",
  "cache-control",
  "x-frame-options",
  "accept-language",
]);

function toMessage(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  text?: string,
): HttpMessage {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers))
    if (v !== undefined && !HIDDEN_HEADERS.has(k.toLowerCase()))
      h[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  const msg: HttpMessage = { headers: h };
  if (body !== undefined) msg.body = body;
  else if (text)
    msg.text =
      text.length > MAX_BODY
        ? `${text.slice(0, MAX_BODY)}… [truncated ${text.length - MAX_BODY} bytes]`
        : text;
  return msg;
}

const safeJson = (v: unknown) => {
  try {
    return v === undefined ? "" : JSON.stringify(v);
  } catch {
    return "";
  }
};
const headerText = (h: Record<string, string | string[] | undefined>) =>
  String(h.authorization ?? "") + String(h.cookie ?? "");

/** Parse a body for display and correlation: JSON, form-encoded (with JSON-valued fields expanded), or text. */
export function parseBody(
  contentType: string | undefined,
  raw: Buffer | string | undefined,
): { body?: unknown; text?: string } {
  if (raw === undefined || raw.length === 0) return {};
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) {
    try {
      return { body: JSON.parse(text) };
    } catch {
      return { text };
    }
  }
  if (ct.includes("x-www-form-urlencoded")) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(text)) {
      if (/^[[{]/.test(v.trim())) {
        try {
          out[k] = JSON.parse(v);
          continue;
        } catch {
          /* keep string */
        }
      }
      out[k] = v;
    }
    return { body: out };
  }
  if (/^[[{]/.test(text.trim())) {
    try {
      return { body: JSON.parse(text) };
    } catch {
      /* fallthrough */
    }
  }
  return { text };
}

/** What the inspector API returns: secrets masked unless the caller asked to reveal (loopback only). */
export function presentEvent(e: ProtocolEvent, reveal: boolean): ProtocolEvent {
  return {
    ...e,
    request: e.request && maskSecrets(e.request, reveal),
    response: e.response && maskSecrets(e.response, reveal),
  };
}
