/**
 * Recording reverse proxy. Wallets and the Verify SDK reach Inji services only through here:
 *
 *   /pub/certify/*  →  certify:8090      (wallet-facing OpenID4VCI endpoints)
 *   /pub/verify/*   →  verify-service    (OpenID4VP + direct verification endpoints)
 *
 * Only an allow-list of public endpoints passes. Certify's admin APIs (credential-configurations,
 * pre-authorized-data, ledger, status updates) have no authentication in the reference setup, so they are
 * never reachable through the gateway, and therefore never through a public tunnel.
 */
import express, { type Request, type Response, type Router } from "express";
import { log } from "../log.js";
import type { Upstream } from "./classify.js";
import { parseBody, type Recorder } from "./recorder.js";

interface Route {
  prefix: string;
  upstream: Upstream;
  target: string;
  /** Map a public path (after the prefix) to the upstream path. */
  rewrite: (path: string) => string;
  allow: [method: string, pattern: RegExp][];
}

export function certifyRoute(target: string): Route {
  return {
    prefix: "/pub/certify",
    upstream: "certify",
    target,
    // credential_issuer is <base>/pub/certify, so OpenID4VCI's <issuer>/.well-known/* lands here; map it to
    // Certify's servlet path the way upstream's certify-nginx does.
    rewrite: (p) => (p.startsWith("/.well-known/") ? `/v1/certify${p}` : p),
    allow: [
      ["GET", /^\/v1\/certify\/(issuance\/)?\.well-known\/(openid-credential-issuer|oauth-authorization-server|did\.json|jwks\.json)$/],
      ["GET", /^\/v1\/certify\/credential-offer-data\/[\w-]+$/],
      ["POST", /^\/v1\/certify\/oauth\/token$/],
      ["POST", /^\/v1\/certify\/issuance\/(vd1[12]\/)?credential$/],
      ["GET", /^\/v1\/certify\/credentials\/status-list\/[\w-]+$/],
      ["GET", /^\/v1\/certify\/rendering-template\/[\w-]+$/],
    ],
  };
}

export function verifyRoute(target: string): Route {
  return {
    prefix: "/pub/verify",
    upstream: "verify",
    target,
    rewrite: (p) => p,
    allow: [
      ["POST", /^\/v1\/verify\/(vp-request|vp-session-request)$/],
      ["GET", /^\/v1\/verify\/vp-request\/[\w-]+(\/status)?$/],
      ["POST", /^\/v1\/verify\/vp-submission\/direct-post$/],
      ["GET", /^\/v1\/verify\/vp-result\/[\w-]+$/],
      ["POST", /^\/v1\/verify\/(v2\/vp-results\/[\w-]+|vp-session-results)$/],
      ["POST", /^\/v1\/verify\/(v2\/)?vc-verification$/],
      ["POST", /^\/v1\/verify\/vc-submission$/],
      ["GET", /^\/v1\/verify\/(\.well-known\/)?did\.json$/],
      ["GET", /^\/v1\/verify\/vp-definitions?\/[\w-]+$/],
    ],
  };
}

const HOP_BY_HOP = new Set(["host", "connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-authorization", "te", "trailer", "content-length", "accept-encoding", "x-playground-run", "x-playground-actor"]);

export function recordingProxy(route: Route, recorder: Recorder): Router {
  const router = express.Router();
  router.use(route.prefix, express.raw({ type: () => true, limit: "4mb" }), async (req: Request, res: Response) => {
    const publicPath = req.path;
    const upstreamPath = route.rewrite(publicPath);
    const allowed = route.allow.some(([m, re]) => (m === req.method || (req.method === "HEAD" && m === "GET")) && re.test(upstreamPath));
    if (req.method === "OPTIONS") {
      res.set({ "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization", "access-control-allow-credentials": "true" });
      res.sendStatus(204);
      return;
    }
    if (!allowed) {
      res.status(404).json({ error: "not_exposed", error_description: `${req.method} ${route.prefix}${publicPath} is not a wallet-facing endpoint, so the playground gateway does not expose it.` });
      return;
    }

    const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP_BY_HOP.has(k)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    headers.set("x-forwarded-host", req.headers.host ?? "");
    headers.set("x-forwarded-proto", req.protocol);
    const raw = Buffer.isBuffer(req.body) && req.body.length ? (req.body as Buffer) : undefined;

    const startedAt = new Date().toISOString();
    const started = performance.now();
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${route.target}${upstreamPath}${query}`, { method: req.method, headers, body: raw, redirect: "manual", signal: AbortSignal.timeout(65_000) });
    } catch (e) {
      log.warn({ err: (e as Error).message, path: upstreamPath }, "upstream unreachable");
      res.status(502).json({ error: "upstream_unavailable", error_description: `${route.upstream} is not reachable from the playground (is its container healthy?).` });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    const durationMs = performance.now() - started;

    res.status(upstream.status);
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie"].includes(k)) res.setHeader(k, v);
    });
    const cookies = upstream.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.end(buf);

    const reqParsed = parseBody(req.headers["content-type"], raw);
    const resParsed = parseBody(upstream.headers.get("content-type") ?? undefined, buf);
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((v, k) => (responseHeaders[k] = v));
    void recorder
      .record({
        upstream: route.upstream,
        method: req.method,
        path: upstreamPath + query,
        status: upstream.status,
        durationMs,
        at: startedAt,
        requestHeaders: req.headers,
        responseHeaders,
        requestBody: reqParsed.body,
        requestText: reqParsed.text,
        responseBody: resParsed.body,
        responseText: resParsed.text,
        actorHeader: req.headers["x-playground-actor"] as string | undefined,
        runId: (req.headers["x-playground-run"] as string | undefined) ?? undefined,
      })
      .catch((e) => log.warn({ err: (e as Error).message }, "record failed"));
  });
  return router;
}
