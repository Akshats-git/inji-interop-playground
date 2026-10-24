/**
 * What the public URL exposes. A tunnel makes the playground reachable from the internet so a phone wallet
 * can connect, but a wallet only ever needs the wallet-facing gateway (/pub/*). The UI, the API (which can
 * reveal recorded tokens) and the live feed stay on this machine unless PUBLIC_UI=true opts in.
 */
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import type { Config } from "../config.js";

/** IPv4 default gateway from a /proc/net/route table (little-endian hex), if there is one. */
export function defaultGatewayFromRoutes(table: string): string | undefined {
  const hex = table
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .find((cols) => cols[1] === "00000000" && /^[0-9A-F]{8}$/i.test(cols[2] ?? ""))?.[2];
  return hex && hex !== "00000000"
    ? hex
        .match(/../g)!
        .reverse()
        .map((b) => parseInt(b, 16))
        .join(".")
    : undefined;
}

// In a container, requests from the host's browser arrive from the Docker bridge gateway, not loopback (the
// port is published on 127.0.0.1 only, so the gateway is this computer). Outside a container the default
// gateway is a router, so it is never trusted there.
const containerGateway = (() => {
  try {
    return existsSync("/.dockerenv")
      ? defaultGatewayFromRoutes(readFileSync("/proc/net/route", "utf8"))
      : undefined;
  } catch {
    return undefined;
  }
})();

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Whether a connection comes from the computer running the playground (not the LAN, not the tunnel). */
export function isThisComputer(remoteAddress: string | undefined, gateway = containerGateway) {
  const addr = remoteAddress ?? "";
  return LOOPBACK.has(addr) || (!!gateway && (addr === gateway || addr === `::ffff:${gateway}`));
}

/**
 * Did this request come in through the public URL? Any sign of it counts: the Host header, any
 * X-Forwarded-Host entry, or Cloudflare's edge headers. The forwarded headers are set by whoever sent the
 * request, so one of them naming a local host must never outweigh another that names the public host
 * (otherwise `X-Forwarded-Host: localhost` through the tunnel would open the API).
 */
export function isPublicHostRequest(
  config: Pick<Config, "publicBaseUrl">,
  req: Pick<IncomingMessage, "headers">,
) {
  const pub = new URL(config.publicBaseUrl);
  if (pub.protocol !== "https:") return false;
  const h = req.headers;
  if (h["cf-connecting-ip"] !== undefined || h["cf-ray"] !== undefined) return true;
  const hosts = [h.host, ...([] as (string | undefined)[]).concat(h["x-forwarded-host"])]
    .flatMap((v) => String(v ?? "").split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return hosts.includes(pub.host.toLowerCase());
}

export const isWalletFacing = (path: string) => path === "/pub" || path.startsWith("/pub/");

export function publicExposureGuard(config: Pick<Config, "publicBaseUrl" | "publicUi">): RequestHandler {
  return (req, res, next) => {
    if (config.publicUi || isWalletFacing(req.path) || !isPublicHostRequest(config, req)) return next();
    res
      .status(404)
      .type("text/plain")
      .send(
        "Only the wallet-facing gateway (/pub/*) is reachable through the public URL. Open the playground on the computer running it.",
      );
  };
}
