/**
 * Hosted Inji environments (MOSIP Collab) for the UI: what was discovered, collecting a credential from one of
 * their issuers outside a run, and the OAuth redirect eSignet sends the browser back to after a person signs in.
 */
import express from "express";
import { randomBytes } from "node:crypto";
import type { HostedService } from "../hosted/service.js";
import type { ReferenceWallet } from "../reference/wallet/service.js";
import type { HeldSummary } from "../store/types.js";
import { ApiError, h } from "./errors.js";

interface CollectJob {
  id: string;
  status: "signing-in" | "waiting-login" | "collecting" | "done" | "failed";
  loginUrl?: string;
  held?: HeldSummary;
  error?: string;
  at: number;
}

export function hostedApi(hosted: HostedService, wallet: ReferenceWallet) {
  const r = express.Router();
  const jobs = new Map<string, CollectJob>();
  const gc = () => {
    for (const [id, j] of jobs) if (Date.now() - j.at > 30 * 60_000) jobs.delete(id);
  };

  r.get("/hosted", h(async (_req, res) => void res.json({ environments: hosted.summary(), health: await hosted.health() })));

  r.post("/hosted/refresh", h(async (_req, res) => {
    await hosted.refresh();
    res.json({ environments: hosted.summary(), health: await hosted.health() });
  }));

  /**
   * The Reference Wallet collects a credential from a hosted issuer. Automatic sign-ins finish on their own;
   * interactive ones answer with eSignet's login page as soon as it is known, and the UI polls the job.
   */
  r.post("/hosted/collect", h(async (req, res) => {
    const { typeId, login } = (req.body ?? {}) as { typeId?: string; login?: { mode?: string; individualId?: string } };
    const type = typeId ? hosted.findType(typeId) : undefined;
    if (!type?.hosted) throw new ApiError(404, "not_found", "No such hosted credential type. The environment may still be loading; see the Parties page.");
    const h0 = type.hosted;
    const client = h0.authorizationServer ? hosted.clientFor(h0.environmentId, h0.authorizationServer) : undefined;
    if (!client) throw new ApiError(400, "no_client", `The Reference Wallet cannot sign in at ${h0.authorizationServer ?? "this issuer"}. ${hosted.clientProblem(h0.environmentId) ?? "Use Inji Wallet on a phone for this issuer."}`);
    const mode = login?.mode === "interactive" ? "interactive" : "auto";
    gc();
    const job: CollectJob = { id: randomBytes(8).toString("base64url"), status: "signing-in", at: Date.now() };
    jobs.set(job.id, job);
    let ready!: () => void;
    const shown = new Promise<void>((resolve) => (ready = resolve));
    void wallet
      .receiveAuthorized({
        credentialIssuer: h0.credentialIssuer,
        configId: type.configurationId,
        client,
        typeId: type.id,
        signIn: async (p) => {
          if (mode === "auto") return hosted.signInAutomatically(h0.environmentId, p, { individualId: login?.individualId });
          const { url, code } = hosted.startInteractive(h0.environmentId, p);
          Object.assign(job, { status: "waiting-login", loginUrl: url });
          ready();
          const c = await code;
          job.status = "collecting";
          return c;
        },
      })
      .then(({ held }) => {
        const { raw: _raw, ...summary } = held;
        Object.assign(job, { status: "done", held: summary });
      })
      .catch((e) => Object.assign(job, { status: "failed", error: (e as Error).message }))
      .finally(ready);
    // Automatic sign-ins take a few seconds; wait for them, or for eSignet's page to be known.
    await Promise.race([shown, new Promise((r) => setTimeout(r, mode === "auto" ? 45_000 : 20_000))]);
    res.status(202).json(job);
  }));

  r.get("/hosted/collect/:id", h(async (req, res) => {
    const job = jobs.get(req.params.id!);
    if (!job) throw new ApiError(404, "not_found", "No such collection (it may have expired).");
    res.json(job);
  }));

  return r;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f2f4f7;color:#16233f;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{background:#fff;border:1px solid #d5dbe5;border-radius:10px;padding:24px 28px;max-width:34rem}h1{font-size:1.4rem;margin:0 0 8px}p{line-height:1.5;margin:8px 0 0}
@media (prefers-color-scheme: dark){body{background:#0d1628;color:#e6eaf2}main{background:#14213a;border-color:#26344f}}</style></head><body><main>${body}</main></body></html>`;

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The OAuth redirect URI (http://localhost:3004/redirect for MOSIP's test client): eSignet sends the person's
 * browser here with the authorization code, which goes to the run or collection waiting for it.
 */
export function redirectApp(hosted: HostedService) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/redirect", (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const state = q.state ?? "";
    const known = hosted.completeInteractive(state, { code: q.code, error: q.error, description: q.error_description });
    res.set("cache-control", "no-store").type("html");
    if (!known) return void res.status(400).send(page("Sign-in not expected", "<h1>This sign-in is not expected</h1><p>No run or collection in the playground is waiting for it (it may have timed out, or the playground restarted). Start again from the playground.</p>"));
    if (q.error) return void res.send(page("Sign-in failed", `<h1>eSignet did not sign you in</h1><p>${esc(q.error)}${q.error_description ? `: ${esc(q.error_description)}` : ""}. Return to the playground tab; the run says what happened.</p>`));
    res.send(page("Signed in", "<h1>Signed in at eSignet</h1><p>The playground has the authorization code and is collecting the credential. You can close this tab and return to the playground.</p>"));
  });
  app.use((_req, res) => void res.status(404).type("text/plain").send("Only /redirect is served here."));
  return app;
}
