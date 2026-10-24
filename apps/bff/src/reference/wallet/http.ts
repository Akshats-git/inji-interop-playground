/**
 * How the Reference Wallet talks to the world. It calls issuers and verifiers by their public URLs, but
 * URLs on the playground's own public origin are sent to the gateway on loopback (no round trip through
 * a tunnel). Every call carries x-playground-actor/run headers, so the gateway records and attributes it
 * exactly like traffic from a phone.
 */
import type { Party } from "@playground/core";
import type { Recorder } from "../../gateway/recorder.js";
import { HttpError } from "../../util/http.js";

export interface WalletHttp {
  getJson(url: string): Promise<unknown>;
  /** GET that may return a JWT (request objects). */
  getText(url: string): Promise<{ contentType: string; text: string }>;
  postForm(url: string, form: Record<string, string>): Promise<unknown>;
  postJson(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown>;
}

/**
 * Calls to the playground's own origin are recorded by the gateway. Calls to anyone else (an external issuer or
 * verifier from the parties file) never pass it, so they are recorded here when a recorder is given.
 */
export function walletHttp(opts: {
  publicBaseUrl: string;
  selfUrl: string;
  runId?: string | null;
  actor?: string;
  recorder?: Recorder;
  /** Names known outside parties (a hosted Inji's Certify, eSignet or Verify) for the inspector's lanes. */
  partyOf?: (url: string) => Party | undefined;
}): WalletHttp {
  const isOwn = (url: string) => url.startsWith(opts.publicBaseUrl) || url.startsWith(opts.selfUrl);
  const route = (url: string) =>
    url.startsWith(opts.publicBaseUrl) ? opts.selfUrl + url.slice(opts.publicBaseUrl.length) : url;
  /** fetch, plus a recorded event when the other side is outside the playground. */
  const send = async (
    url: string,
    init: RequestInit & { headers: Record<string, string> },
    requestBody?: unknown,
  ) => {
    const started = Date.now();
    const at = new Date().toISOString();
    const res = await fetch(route(url), init);
    if (!opts.recorder || isOwn(url)) return { res, text: await res.text() };
    const text = await res.text();
    let responseBody: unknown;
    try {
      responseBody = text ? JSON.parse(text) : undefined;
    } catch {
      /* not JSON */
    }
    const toVerifier =
      /\/(pd|request)\b|presentation/i.test(url) ||
      (requestBody &&
        typeof requestBody === "object" &&
        ("vp_token" in requestBody || "error" in requestBody));
    void opts.recorder.recordInternal({
      upstream: "external",
      method: init.method ?? "GET",
      path: url,
      requestBody,
      responseBody,
      responseText: responseBody === undefined ? text : undefined,
      status: res.status,
      durationMs: Date.now() - started,
      at,
      runId: opts.runId ?? null,
      requestHeaders: init.headers,
      responseHeaders: Object.fromEntries(res.headers),
      external: {
        from: opts.actor === "reference-verifier" ? "reference-verifier" : "wallet",
        to: opts.partyOf?.(url) ?? (toVerifier ? "external-verifier" : "external-issuer"),
      },
    });
    return { res, text };
  };
  const headers = (extra: Record<string, string> = {}) => ({
    "user-agent": "inji-interop-playground-reference-wallet/0.1",
    "x-playground-actor": opts.actor ?? "reference-wallet",
    ...(opts.runId ? { "x-playground-run": opts.runId } : {}),
    ...extra,
  });
  const read = async ({ res, text }: { res: Response; text: string }, url: string) => {
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      // Say what the other side said: OAuth-style {error, error_description} or Inji's {errorCode, errorMessage}.
      const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      const code = b.error ?? b.errorCode;
      const why = b.error_description ?? b.errorMessage;
      throw new HttpError(
        res.status,
        body,
        `${new URL(url).host} answered HTTP ${res.status}${code ? `: ${String(code)}${why ? ` (${String(why)})` : ""}` : ""}`,
      );
    }
    return body;
  };
  return {
    async getJson(url) {
      return read(
        await send(url, {
          headers: headers({ accept: "application/json" }),
          signal: AbortSignal.timeout(30_000),
        }),
        url,
      );
    },
    async getText(url) {
      const { res, text } = await send(url, {
        headers: headers({ accept: "application/oauth-authz-req+jwt, application/json" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new HttpError(res.status, text, `${url} → ${res.status}`);
      return { contentType: res.headers.get("content-type") ?? "", text };
    },
    async postForm(url, form) {
      return read(
        await send(
          url,
          {
            method: "POST",
            headers: headers({
              "content-type": "application/x-www-form-urlencoded",
              accept: "application/json",
            }),
            body: new URLSearchParams(form),
            signal: AbortSignal.timeout(30_000),
          },
          form,
        ),
        url,
      );
    },
    async postJson(url, body, extra) {
      return read(
        await send(
          url,
          {
            method: "POST",
            headers: headers({ "content-type": "application/json", accept: "application/json", ...extra }),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
          },
          body,
        ),
        url,
      );
    },
  };
}
