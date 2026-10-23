/**
 * fetch for calls the playground makes to parties outside the bundle (hosted Inji services, their eSignet),
 * recorded like gateway traffic so they appear in the inspector and the run's sequence diagram.
 */
import type { Party, ProtocolEvent } from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";

export interface RecordedCall {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  runId?: string | null;
  /** Who talks to whom, and how the inspector names the step. */
  record: { title?: string; phase: ProtocolEvent["phase"]; from: Party; to: Party; labels?: string[] };
  timeoutMs?: number;
}

export interface RecordedResponse {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
}

export async function recordedFetch(recorder: Recorder | undefined, c: RecordedCall): Promise<RecordedResponse> {
  const headers: Record<string, string> = { accept: "application/json", ...c.headers };
  let payload: string | undefined;
  let requestBody: unknown;
  if (c.json !== undefined) {
    headers["content-type"] ??= "application/json";
    payload = JSON.stringify(c.json);
    requestBody = c.json;
  } else if (c.form) {
    headers["content-type"] ??= "application/x-www-form-urlencoded";
    payload = new URLSearchParams(c.form).toString();
    requestBody = c.form;
  }
  const method = c.method ?? (payload === undefined ? "GET" : "POST");
  const at = new Date().toISOString();
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(c.url, { method, headers, body: payload, redirect: "manual", signal: AbortSignal.timeout(c.timeoutMs ?? 30_000) });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code;
    throw Object.assign(new Error(`${new URL(c.url).host} is not reachable (${cause ?? (e as Error).message}).`), { code: "unreachable" });
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  await recorder?.recordInternal({
    upstream: "external",
    method,
    path: c.url,
    requestBody,
    responseBody: body,
    responseText: body === undefined ? text : undefined,
    status: res.status,
    durationMs: performance.now() - started,
    at,
    runId: c.runId ?? null,
    requestHeaders: headers,
    responseHeaders: Object.fromEntries(res.headers),
    external: { title: c.record.title, phase: c.record.phase, from: c.record.from, to: c.record.to, labels: c.record.labels },
  });
  return { status: res.status, body: body ?? text, text, headers: res.headers };
}
