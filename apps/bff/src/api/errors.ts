import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { log } from "../log.js";
import { EsignetError } from "../hosted/esignet.js";
import { HostedError } from "../hosted/service.js";
import { HostedVerifyError } from "../hosted/verify.js";
import { PartyError } from "../parties/service.js";
import { IssuanceError } from "../reference/wallet/issuance.js";
import { PresentationError } from "../reference/wallet/presentation.js";
import { RunError } from "../runs/orchestrator.js";
import { StudioError } from "../studio/service.js";
import { HttpError } from "../util/http.js";

/** Wrap async route handlers so rejections reach the error handler. */
export const h =
  (fn: (...a: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res, next).catch(next);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_failed", message: "Some fields are invalid.", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    return;
  }
  if (err instanceof StudioError || err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message, detail: err.detail });
    return;
  }
  if (err instanceof RunError) {
    res.status(err.code.startsWith("unknown_") ? 404 : 400).json({ error: err.code, message: err.message, detail: err.detail });
    return;
  }
  if (err instanceof PartyError) {
    res.status(err.code === "config_error" ? 400 : 502).json({ error: err.code, message: err.message, detail: err.detail });
    return;
  }
  // The Reference Wallet could not do what it was asked: say why instead of "something went wrong".
  if (err instanceof PresentationError || err instanceof IssuanceError) {
    res.status(422).json({ error: err.code, message: err.message, detail: err instanceof IssuanceError ? err.detail : undefined });
    return;
  }
  if (err instanceof EsignetError || err instanceof HostedError || err instanceof HostedVerifyError) {
    res.status(err instanceof HostedError && err.code === "no_client" ? 400 : 502).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof HttpError) {
    res.status(502).json({ error: err.code ?? "upstream_error", message: err.detail ?? err.message, detail: err.body });
    return;
  }
  if ((err as { code?: string })?.code === "unreachable") {
    res.status(502).json({ error: "unreachable", message: (err as Error).message });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "invalid_json", message: "The request body is not valid JSON." });
    return;
  }
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error", message: "Something went wrong in the playground." });
};
