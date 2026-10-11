/**
 * What the public URL exposes. A tunnel makes the playground reachable from the internet so a phone wallet
 * can connect, but a wallet only ever needs the wallet-facing gateway (/pub/*). The UI, the API (which can
 * reveal recorded tokens) and the live feed stay on this machine unless PUBLIC_UI=true opts in.
 */
import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import type { Config } from "../config.js";

export function isPublicHostRequest(config: Pick<Config, "publicBaseUrl">, req: Pick<IncomingMessage, "headers">) {
  const pub = new URL(config.publicBaseUrl);
  if (pub.protocol !== "https:") return false;
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0]!.trim().toLowerCase();
  return host === pub.host.toLowerCase();
}

export const isWalletFacing = (path: string) => path === "/pub" || path.startsWith("/pub/");

export function publicExposureGuard(config: Pick<Config, "publicBaseUrl" | "publicUi">): RequestHandler {
  return (req, res, next) => {
    if (config.publicUi || isWalletFacing(req.path) || !isPublicHostRequest(config, req)) return next();
    res.status(404).type("text/plain").send("Only the wallet-facing gateway (/pub/*) is reachable through the public URL. Open the playground on the computer running it.");
  };
}
