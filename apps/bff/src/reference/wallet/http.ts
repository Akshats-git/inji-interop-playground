/**
 * How the Reference Wallet talks to the world. It calls issuers and verifiers by their public URLs, but
 * URLs on the playground's own public origin are sent to the gateway on loopback (no round trip through
 * a tunnel). Every call carries x-playground-actor/run headers, so the gateway records and attributes it
 * exactly like traffic from a phone.
 */
import { HttpError } from "../../util/http.js";

export interface WalletHttp {
  getJson(url: string): Promise<unknown>;
  /** GET that may return a JWT (request objects). */
  getText(url: string): Promise<{ contentType: string; text: string }>;
  postForm(url: string, form: Record<string, string>): Promise<unknown>;
  postJson(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown>;
}

export function walletHttp(opts: { publicBaseUrl: string; selfUrl: string; runId?: string | null; actor?: string }): WalletHttp {
  const route = (url: string) => (url.startsWith(opts.publicBaseUrl) ? opts.selfUrl + url.slice(opts.publicBaseUrl.length) : url);
  const headers = (extra: Record<string, string> = {}) => ({
    "user-agent": "inji-interop-playground-reference-wallet/0.1",
    "x-playground-actor": opts.actor ?? "reference-wallet",
    ...(opts.runId ? { "x-playground-run": opts.runId } : {}),
    ...extra,
  });
  const read = async (res: Response, url: string) => {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      /* not JSON */
    }
    if (!res.ok) throw new HttpError(res.status, body, `${url} → ${res.status}`);
    return body;
  };
  return {
    async getJson(url) {
      return read(await fetch(route(url), { headers: headers({ accept: "application/json" }), signal: AbortSignal.timeout(30_000) }), url);
    },
    async getText(url) {
      const res = await fetch(route(url), { headers: headers({ accept: "application/oauth-authz-req+jwt, application/json" }), signal: AbortSignal.timeout(30_000) });
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, text, `${url} → ${res.status}`);
      return { contentType: res.headers.get("content-type") ?? "", text };
    },
    async postForm(url, form) {
      return read(await fetch(route(url), { method: "POST", headers: headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" }), body: new URLSearchParams(form), signal: AbortSignal.timeout(30_000) }), url);
    },
    async postJson(url, body, extra) {
      return read(await fetch(route(url), { method: "POST", headers: headers({ "content-type": "application/json", accept: "application/json", ...extra }), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }), url);
    },
  };
}
