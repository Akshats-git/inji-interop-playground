import type { Upstream } from "../gateway/classify.js";
import { parseBody, type Recorder } from "../gateway/recorder.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
  /** Inji services answer errors as {errors:[{errorCode, errorMessage}]}, {error, error_description} or {errorCode, errorMessage}. */
  get code(): string | undefined {
    const b = this.body as Record<string, unknown> | undefined;
    const first = Array.isArray(b?.errors) ? (b!.errors as Record<string, unknown>[])[0] : undefined;
    return (first?.errorCode ?? b?.errorCode ?? b?.error) as string | undefined;
  }
  get detail(): string | undefined {
    const b = this.body as Record<string, unknown> | undefined;
    const first = Array.isArray(b?.errors) ? (b!.errors as Record<string, unknown>[])[0] : undefined;
    return (first?.errorMessage ?? b?.errorMessage ?? b?.error_description ?? b?.message) as string | undefined;
  }
}

export interface CallOptions {
  method?: string;
  json?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
  /** Record this exchange in the inspector, attributed to the run. */
  record?: { recorder: Recorder; upstream: Upstream; runId?: string | null };
  timeoutMs?: number;
}

/** fetch + JSON + optional recording. Throws HttpError on non-2xx. */
export async function call<T = unknown>(url: string, o: CallOptions = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = { accept: "application/json", ...o.headers };
  let body: string | undefined;
  if (o.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(o.json);
  } else if (o.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(o.form).toString();
  }
  const at = new Date().toISOString();
  const started = performance.now();
  const res = await fetch(url, { method: o.method ?? (body ? "POST" : "GET"), headers, body, signal: AbortSignal.timeout(o.timeoutMs ?? 30_000) });
  const text = await res.text();
  const parsed = parseBody(res.headers.get("content-type") ?? undefined, text);
  if (o.record) {
    const u = new URL(url);
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => (responseHeaders[k] = v));
    await o.record.recorder.recordInternal({
      upstream: o.record.upstream,
      method: o.method ?? (body ? "POST" : "GET"),
      path: u.pathname + u.search,
      status: res.status,
      durationMs: performance.now() - started,
      at,
      requestHeaders: headers,
      responseHeaders,
      requestBody: o.json ?? o.form,
      responseBody: parsed.body,
      responseText: parsed.text,
      runId: o.record.runId ?? null,
    });
  }
  const value = (parsed.body ?? parsed.text) as T;
  if (!res.ok) throw new HttpError(res.status, value, `${o.method ?? "GET"} ${url} → ${res.status}`);
  // MOSIP services wrap results as {responseTime, response, errors[]} and report failures with HTTP 200.
  const env = value as { response?: unknown; errors?: unknown[]; responseTime?: string } | undefined;
  if (env && typeof env === "object" && "responseTime" in env && "response" in env) {
    if (Array.isArray(env.errors) && env.errors.length) throw new HttpError(res.status, value, `${o.method ?? "GET"} ${url} → error envelope`);
    return { status: res.status, body: env.response as T, headers: res.headers };
  }
  return { status: res.status, body: value, headers: res.headers };
}
