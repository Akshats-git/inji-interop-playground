/**
 * Run orchestrator. A run is one journey — issuer type × wallet × verifier × format × mode — executed as
 * four steps (issue → request → present → verify). Automated wallets run straight through; for a human
 * wallet (a phone) a step waits, shows a QR, and advances when the gateway sees the wallet's traffic.
 */
import { EventEmitter } from "node:events";
import {
  signingAlgOf,
  vctFor,
  TAMPER_PRESETS,
  VERIFIERS,
  WALLETS,
  type CredentialType,
  type EventSummary,
  type QuerySpec,
  type Run,
  type RunResult,
  type RunSpec,
  type RunStep,
  type StepName,
} from "@playground/core";
import { z } from "zod";
import type { Recorder } from "../gateway/recorder.js";
import type { InjiVerifyClient, VerifyResultV2 } from "../inji/verify.js";
import { log } from "../log.js";
import type { ReferenceVerifier } from "../reference/verifier/service.js";
import type { ReferenceWallet } from "../reference/wallet/service.js";
import type { Store } from "../store/types.js";
import type { StudioService } from "../studio/service.js";
import { now, shortId } from "../util/ids.js";
import { explainResult } from "./explain.js";

export const RunSpecInput = z.object({
  typeId: z.string().min(1),
  wallet: z.enum(["reference-wallet", "inji-wallet", "inji-web", "external-wallet"]).default("reference-wallet"),
  verifier: z.enum(["inji-verify", "reference-verifier"]).default("inji-verify"),
  mode: z.enum(["openid4vp-cross-device", "openid4vp-same-device", "direct-share"]).default("openid4vp-cross-device"),
  query: z.enum(["presentation_exchange", "dcql"]).default("presentation_exchange"),
  requestedClaims: z.array(z.string()).default([]),
  claims: z.record(z.unknown()).default({}),
  txCode: z.string().optional(),
  tamper: z.enum(Object.keys(TAMPER_PRESETS) as [keyof typeof TAMPER_PRESETS, ...(keyof typeof TAMPER_PRESETS)[]]).default("none"),
  heldCredentialId: z.string().optional(),
  skipIssuance: z.boolean().default(false),
});

export const VERSIONS = { "Inji Certify": "0.14.0", "Inji Verify": "0.18.2", "OpenID4VCI": "draft 13", "OpenID4VP": "draft 23 (PE) / 1.0 (DCQL)" };

const HUMAN_TIMEOUT_MS = 10 * 60_000;
const VERIFIER_CLIENT_ID = "inji-playground";

/** A verifier should reject tampered presentations and credentials past their expiry date. */
export function expectationFor(spec: Pick<RunSpec, "tamper">, type: Pick<CredentialType, "expiresAt">): "PASS" | "FAIL" {
  if (TAMPER_PRESETS[spec.tamper].expect === "FAIL") return "FAIL";
  if (type.expiresAt && new Date(type.expiresAt).getTime() < Date.now()) return "FAIL";
  return "PASS";
}

export class RunError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class Orchestrator extends EventEmitter {
  private cancelled = new Set<string>();

  constructor(
    private readonly deps: {
      store: Store;
      recorder: Recorder;
      studio: StudioService;
      wallet: ReferenceWallet;
      refVerifier: ReferenceVerifier;
      injiVerify: InjiVerifyClient;
    },
  ) {
    super();
    this.setMaxListeners(200);
  }

  async start(input: unknown): Promise<Run> {
    const spec = RunSpecInput.parse(input) as RunSpec;
    const type = await this.deps.studio.requireType(spec.typeId);
    const issuer = await this.deps.store.getIssuer(type.issuerSlug);
    if (spec.query === "dcql" && !VERIFIERS[spec.verifier].accepts.includes("dcql") && spec.mode !== "direct-share") {
      // Allowed on purpose: the verifier will refuse, and that refusal is the finding. We note it up front.
      log.info({ verifier: spec.verifier }, "DCQL requested from a PE-only verifier");
    }
    if (spec.wallet === "inji-web") throw new RunError("unsupported", "Inji Web 0.17 has no credential-offer support, so it cannot take part in issuer-initiated runs. Use it from the Wallet page (wallet-initiated).");
    const run: Run = {
      id: shortId("run"),
      createdAt: now(),
      updatedAt: now(),
      status: "running",
      spec,
      labels: {
        issuer: type.issuerSlug,
        issuerName: issuer?.name ?? type.issuerSlug,
        typeName: type.displayName,
        format: type.format,
        dataModel: type.format === "ldp_vc" ? type.dataModel : undefined,
        proofType: type.format === "ldp_vc" ? type.ldpSuite : `SD-JWT ${signingAlgOf(type)}`,
        wallet: WALLETS[spec.wallet].label,
        verifier: VERIFIERS[spec.verifier].label,
        versions: VERSIONS,
      },
      steps: (["issue", "request", "present", "verify"] as StepName[]).map((name) => ({ name, status: "pending" })),
    };
    if (spec.mode === "direct-share") run.steps[1] = { name: "request", status: "skipped", note: "Direct share has no request: the holder shows the credential itself as a QR code." };
    await this.save(run);
    void this.execute(run, type).catch((e) => log.error({ err: e, run: run.id }, "run crashed"));
    return run;
  }

  cancel(id: string) {
    this.cancelled.add(id);
    this.deps.recorder.release(id);
  }

  private async save(run: Run) {
    run.updatedAt = now();
    await this.deps.store.putRun(run);
    this.emit("run", run);
  }

  private async step<T>(run: Run, name: StepName, fn: (s: RunStep) => Promise<T>): Promise<T> {
    if (this.cancelled.has(run.id)) throw new RunError("cancelled", "The run was cancelled.");
    const s = run.steps.find((x) => x.name === name)!;
    s.status = "running";
    s.startedAt = now();
    await this.save(run);
    try {
      const out = await fn(s);
      if (s.status === "running" || s.status === "waiting") s.status = "passed";
      s.action = undefined;
      s.endedAt = now();
      await this.save(run);
      return out;
    } catch (e) {
      s.status = "failed";
      s.action = undefined;
      s.endedAt = now();
      s.note = (e as Error).message;
      await this.save(run);
      throw e;
    }
  }

  /** Wait until the gateway records a matching event for this run (e.g. the phone fetched its credential). */
  private waitForEvent(run: Run, predicate: (e: EventSummary) => boolean, timeoutMs = HUMAN_TIMEOUT_MS): Promise<EventSummary> {
    return new Promise((resolve, reject) => {
      const onEvent = (e: EventSummary) => {
        if (e.runId === run.id && predicate(e)) {
          cleanup();
          resolve(e);
        }
      };
      const poll = setInterval(() => {
        if (this.cancelled.has(run.id)) {
          cleanup();
          reject(new RunError("cancelled", "The run was cancelled."));
        }
      }, 1000);
      const timer = setTimeout(() => {
        cleanup();
        reject(new RunError("timeout", "Nobody completed this step within 10 minutes."));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        clearInterval(poll);
        this.deps.recorder.off("event", onEvent);
      };
      this.deps.recorder.on("event", onEvent);
    });
  }

  private querySpec(run: Run, type: CredentialType): QuerySpec {
    const urls = { vct: vctFor(type.syncedBaseUrl, type) };
    const claims = run.spec.requestedClaims.filter((c) => type.fields.some((f) => f.name === c));
    return {
      id: `${type.issuerSlug}-${type.typeName}`.toLowerCase(),
      purpose: `Show your ${type.displayName}`,
      format: type.format,
      typeName: type.typeName,
      vct: urls.vct,
      claims,
      requireHolderBinding: true,
    };
  }

  private async execute(run: Run, type: CredentialType) {
    const { spec } = run;
    const { wallet, recorder, studio, refVerifier, injiVerify } = this.deps;
    const human = WALLETS[spec.wallet].interactive;
    let heldId = spec.heldCredentialId;
    let credential: unknown;

    try {
      // 1. Issue ------------------------------------------------------------------------------------------
      await this.step(run, "issue", async (s) => {
        if (spec.skipIssuance && heldId) {
          s.status = "skipped";
          s.note = "Reusing a credential the Reference Wallet already holds.";
          credential = (await wallet.walletCredentials(heldId))[0]?.credential;
          return;
        }
        const { offerUri } = await studio.createOffer(type.id, spec.claims, { txCode: spec.txCode, runId: run.id });
        run.offerUri = offerUri;
        recorder.bind(run.id, decodeURIComponent(offerUri).split("/").pop());
        if (!human) {
          const r = await wallet.receive(offerUri, { txCode: spec.txCode, runId: run.id, typeId: type.id });
          heldId = r.held.id;
          credential = r.credential;
          s.note = `Credential received and bound to ${r.held.holder.slice(0, 32)}…`;
          return;
        }
        s.status = "waiting";
        s.action = { kind: "scan-offer", uri: offerUri, hint: spec.txCode ? `Scan with ${WALLETS[spec.wallet].label}, then enter PIN ${spec.txCode}.` : `Scan with ${WALLETS[spec.wallet].label} and accept the credential.` };
        await this.save(run);
        recorder.await(run.id, ["certify"]);
        await this.waitForEvent(run, (e) => e.title === "Credential request" && e.status < 300);
        s.note = "The wallet fetched its credential through the gateway.";
      });

      // 2. Request ----------------------------------------------------------------------------------------
      const q = this.querySpec(run, type);
      let requestRef: { kind: "inji"; transactionId: string; requestId: string } | { kind: "ref"; id: string } | undefined;
      if (spec.mode !== "direct-share") {
        await this.step(run, "request", async (s) => {
          if (spec.verifier === "inji-verify") {
            if (spec.query === "dcql") {
              // Send it anyway: what the 0.x service does with a DCQL request is the finding.
              const { toDcql } = await import("@playground/core");
              try {
                const r = await injiVerify.createDcqlRequest({ clientId: VERIFIER_CLIENT_ID, dcqlQuery: toDcql(q), runId: run.id });
                const pd = r.authorizationDetails?.presentationDefinition;
                throw new RunError("incompatible", `Inji Verify 0.18.2 accepted the call but ignored dcqlQuery (request ${r.requestId} has ${pd ? "a presentation_definition" : "no query at all"}), so no wallet can answer it meaningfully.`);
              } catch (e) {
                if (e instanceof RunError) throw e;
                const err = e as { status?: number; code?: string; detail?: string; message: string };
                throw new RunError("incompatible", `Inji Verify 0.18.2 refused the DCQL request (HTTP ${err.status ?? "?"}${err.code ? `, ${err.code}` : ""}${err.detail ? `: ${err.detail}` : ""}). It only understands Presentation Exchange; DCQL arrives with the 1.0 line.`);
              }
            }
            const { toPresentationDefinition } = await import("@playground/core");
            const req = await injiVerify.createRequest({ clientId: VERIFIER_CLIENT_ID, presentationDefinition: toPresentationDefinition(q, "inji"), runId: run.id });
            recorder.bind(run.id, req.requestId, req.transactionId, req.nonce);
            run.requestUri = injiVerify.authorizationUri(req, VERIFIER_CLIENT_ID);
            requestRef = { kind: "inji", transactionId: req.transactionId, requestId: req.requestId };
            s.note = `Presentation Exchange request ${req.requestId} created (by value, client_id ${VERIFIER_CLIENT_ID}).`;
          } else {
            const session = await refVerifier.createRequest(q, { language: spec.query, runId: run.id });
            run.requestUri = session.uri;
            requestRef = { kind: "ref", id: session.id };
            s.note = `${spec.query === "dcql" ? "DCQL" : "Presentation Exchange"} request created.`;
          }
        });
      }

      // 3. Present ----------------------------------------------------------------------------------------
      let directResult: VerifyResultV2["credentialResults"][number] | undefined;
      let walletAnswer: Awaited<ReturnType<ReferenceWallet["present"]>> | undefined;
      await this.step(run, "present", async (s) => {
        if (spec.mode === "direct-share") {
          if (human) {
            s.status = "waiting";
            s.action = { kind: "upload-vc", hint: "Open the credential in your wallet, show its QR code, and scan or upload it on the Verifier page." };
            await this.save(run);
            recorder.await(run.id, ["verify"]);
            await this.waitForEvent(run, (e) => e.title.startsWith("Verify credential"));
            return;
          }
          const vcText = typeof credential === "string" ? credential : JSON.stringify(credential);
          s.note = `Shared ${vcText.length} bytes directly (no OpenID4VP).`;
          directResult = await injiVerify.verifyCredential(vcText, run.id);
          return;
        }
        if (!human) {
          walletAnswer = await wallet.present(run.requestUri!, { heldId, tamper: spec.tamper, runId: run.id });
          const told = walletAnswer.disclosed ? ` Disclosed: ${walletAnswer.disclosed.join(", ") || "none"}; withheld: ${walletAnswer.withheld?.join(", ") || "none"}.` : "";
          s.note = `${walletAnswer.matches[0]?.explanation ?? "Presented."}${told}${spec.tamper !== "none" ? ` Tamper: ${TAMPER_PRESETS[spec.tamper].label}.` : ""}`;
          if (walletAnswer.status >= 400) s.note += ` The verifier answered HTTP ${walletAnswer.status}.`;
          return;
        }
        s.status = "waiting";
        s.action = { kind: "scan-request", uri: run.requestUri, hint: `Scan this request with ${WALLETS[spec.wallet].label} and share the credential.` };
        await this.save(run);
        recorder.await(run.id, [spec.verifier === "inji-verify" ? "verify" : "reference-verifier"]);
        await this.waitForEvent(run, (e) => e.title === "Submit presentation");
      });

      // 4. Verify -----------------------------------------------------------------------------------------
      let result!: RunResult;
      await this.step(run, "verify", async (s) => {
        const expected = expectationFor(spec, type);
        if (directResult) {
          result = explainResult({ expected, kind: "inji-direct", direct: directResult, tamper: spec.tamper });
        } else if (requestRef?.kind === "inji" && walletAnswer && walletAnswer.status >= 400) {
          // Inji Verify refused the submission itself (e.g. nonce/client_id checks); nothing to poll for.
          const body = walletAnswer.verifierResponse as Record<string, unknown> | string | undefined;
          const code = typeof body === "object" && body ? String(body.errorCode ?? body.error ?? "SUBMISSION_REJECTED") : "SUBMISSION_REJECTED";
          const detail = typeof body === "object" && body ? String(body.errorMessage ?? body.error_description ?? "") : String(body ?? "");
          result = explainResult({ expected, kind: "inji-error", errorCode: code, errorDetail: detail, tamper: spec.tamper, walletStatus: walletAnswer.status, walletBody: body });
        } else if (requestRef?.kind === "inji") {
          let status = "ACTIVE";
          for (let i = 0; i < 6 && status === "ACTIVE"; i++) status = await injiVerify.status(requestRef.requestId, run.id).catch(() => "ACTIVE");
          try {
            const r = await injiVerify.resultV2(requestRef.transactionId, run.id);
            result = explainResult({ expected, kind: "inji-vp", vp: r, tamper: spec.tamper, walletStatus: walletAnswer?.status, walletBody: walletAnswer?.verifierResponse });
          } catch (e) {
            const err = e as { code?: string; detail?: string; message: string; body?: unknown };
            result = explainResult({ expected, kind: "inji-error", errorCode: err.code ?? "VERIFY_ERROR", errorDetail: err.detail ?? err.message, tamper: spec.tamper, walletStatus: walletAnswer?.status, walletBody: walletAnswer?.verifierResponse });
          }
        } else if (requestRef?.kind === "ref") {
          const session = await refVerifier.waitFor(requestRef.id, human ? HUMAN_TIMEOUT_MS : 30_000);
          result = explainResult({ expected, kind: "ref", ref: session.result!, tamper: spec.tamper });
        }
        s.note = result.explanation;
        if (result.verifierOutcome === "REJECTED" && expected === "FAIL") s.note = `Rejected as expected. ${result.explanation}`;
      });
      run.result = result;
      run.status = "completed";
    } catch (e) {
      const err = e as RunError & { detail?: string; body?: unknown };
      if (err.code === "incompatible") {
        // A documented version gap, not a crash: the verifier cannot take this query language.
        for (const s of run.steps) if (s.status === "pending") s.status = "skipped";
        run.status = "completed";
        run.result = { verdict: "PASS", expected: "FAIL", verifierOutcome: "REJECTED", credentialStatus: "UNKNOWN", errorCode: "QUERY_LANGUAGE_UNSUPPORTED", errorDetail: err.message, explanation: `Expected incompatibility. ${err.message}`, checks: [{ name: `Verifier accepts ${spec.query === "dcql" ? "DCQL" : "Presentation Exchange"}`, ok: false, detail: err.message }] };
        return;
      }
      const expected = expectationFor(spec, type);
      const failedStep = run.steps.find((s) => s.status === "failed")?.name ?? "run";
      for (const s of run.steps) if (s.status === "pending") s.status = "skipped";
      run.status = err.code === "cancelled" ? "cancelled" : "failed";
      run.result = {
        verdict: "FAIL",
        expected,
        verifierOutcome: "NOT_REACHED",
        errorCode: err.code ?? "error",
        errorDetail: err.detail ?? err.message,
        explanation: `The run stopped at the ${failedStep} step: ${err.message}`,
        checks: [],
      };
    } finally {
      recorder.release(run.id);
      this.cancelled.delete(run.id);
      await this.save(run);
    }
  }
}
