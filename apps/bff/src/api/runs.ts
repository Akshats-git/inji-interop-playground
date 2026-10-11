import express from "express";
import { isThisComputer } from "../gateway/exposure.js";
import { presentEvent } from "../gateway/recorder.js";
import type { Orchestrator } from "../runs/orchestrator.js";
import { runReportMarkdown, redactRun } from "../runs/report.js";
import type { Store } from "../store/types.js";
import { ApiError, h } from "./errors.js";

/** Reveal secrets in the inspector only for requests from this machine. */
export const canReveal = (req: express.Request) => req.query.reveal === "1" && isThisComputer(req.socket.remoteAddress);

export function runsApi(store: Store, orchestrator: Orchestrator) {
  const r = express.Router();

  r.post("/runs", h(async (req, res) => void res.status(201).json(await orchestrator.start(req.body))));
  r.get("/runs", h(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    res.json(await store.listRuns({ limit: Number(q.limit ?? 100), status: q.status, verdict: q.verdict, format: q.format, wallet: q.wallet, verifier: q.verifier }));
  }));
  r.get("/runs/:id", h(async (req, res) => {
    const run = await store.getRun(req.params.id!);
    if (!run) throw new ApiError(404, "run_not_found", "No such run.");
    res.json(run);
  }));
  r.post("/runs/:id/cancel", h(async (req, res) => {
    orchestrator.cancel(req.params.id!);
    res.sendStatus(202);
  }));
  r.delete("/runs/:id", h(async (req, res) => {
    await store.deleteRun(req.params.id!);
    res.sendStatus(204);
  }));
  r.get("/runs/:id/events", h(async (req, res) => void res.json(await store.listEvents({ runId: req.params.id! }))));
  r.get("/runs/:id/report", h(async (req, res) => {
    const run = await store.getRun(req.params.id!);
    if (!run) throw new ApiError(404, "run_not_found", "No such run.");
    const events = await store.listEvents({ runId: run.id });
    const redact = req.query.redact !== "false";
    if (req.query.format === "json") {
      res.attachment(`${run.id}.json`).json({ run: redact ? redactRun(run) : run, events });
      return;
    }
    res.attachment(`${run.id}.md`).type("text/markdown").send(runReportMarkdown(redact ? redactRun(run) : run, events));
  }));

  r.get("/events", h(async (req, res) => {
    const runId = req.query.run === "none" ? null : (req.query.run as string | undefined);
    res.json(await store.listEvents({ runId, limit: Number(req.query.limit ?? 200) }));
  }));
  r.get("/events/:id", h(async (req, res) => {
    const e = await store.getEvent(req.params.id!);
    if (!e) throw new ApiError(404, "event_not_found", "No such event (it may have been purged).");
    res.json(presentEvent(e, canReveal(req)));
  }));
  return r;
}
