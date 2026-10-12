/**
 * Run orchestrator. A run is one journey — issuer type × wallet × verifier × format × mode — executed as
 * four steps (issue → request → present → verify). Automated wallets run straight through; for a human
 * wallet (a phone) a step waits, shows a QR, and advances when the gateway sees the wallet's traffic.
 *
 * Issuers, wallets and verifiers are either built in (Inji Certify via the Studio, the Reference Wallet and
 * Verifier, Inji Verify) or external parties declared in the parties file, which the run drives through the
 * HTTP steps the file describes. Steps an external party completes out of sight wait for the person to
 * press Continue (or to paste an offer).
 */
import { EventEmitter } from "node:events";
import {
  catalogFromStudio,
  coerceClaims,
  isExternalTypeId,
  isTruthyVerdict,
  toDcql,
  toPresentationDefinition,
  TAMPER_PRESETS,
  type CatalogType,
  type CredentialType,
  type EventSummary,
  type QuerySpec,
  type Run,
  type RunResult,
  type RunSpec,
  type RunStep,
  type StepName,
  type VerifierInfo,
  type WalletInfo,
} from "@playground/core";
import { z } from "zod";
import type { Recorder } from "../gateway/recorder.js";
import type { InjiVerifyClient, VerifyResultV2 } from "../inji/verify.js";
import { log } from "../log.js";
import { PartyError, type PartiesService } from "../parties/service.js";
import type { ReferenceVerifier } from "../reference/verifier/service.js";
import type { ReferenceWallet } from "../reference/wallet/service.js";
import type { Store } from "../store/types.js";
import type { StudioService } from "../studio/service.js";
import { now, shortId } from "../util/ids.js";
import { explainResult } from "./explain.js";

export const RunSpecInput = z.object({
  typeId: z.string().min(1),
  /** A built-in wallet (reference-wallet, inji-wallet, external-wallet) or one from the parties file. */
  wallet: z.string().min(1).default("reference-wallet"),
  /** inji-verify, reference-verifier, or a verifier from the parties file. */
  verifier: z.string().min(1).default("inji-verify"),
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
export function expectationFor(spec: Pick<RunSpec, "tamper">, type: Pick<CatalogType, "expiresAt">): "PASS" | "FAIL" {
  if (TAMPER_PRESETS[spec.tamper].expect === "FAIL") return "FAIL";
  if (type.expiresAt && new Date(type.expiresAt).getTime() < Date.now()) return "FAIL";
  return "PASS";
}

export class RunError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** Everything a run needs to know about its parties, resolved once at the start. */
interface Cast {
  type: CatalogType;
  /** Set for Studio types (issued by the playground's Certify). */
  studio?: CredentialType;
  wallet: WalletInfo;
  verifier: VerifierInfo;
}

/** What a waiting step can receive from the person (POST /api/runs/:id/input). */
export interface RunInput {
  offerUri?: string;
  /** Pressing Continue. */
  confirm?: boolean;
}

export class Orchestrator extends EventEmitter {
  private cancelled = new Set<string>();
  private inputs = new Map<string, (input: RunInput) => void>();

  constructor(
    private readonly deps: {
      store: Store;
      recorder: Recorder;
      studio: StudioService;
      wallet: ReferenceWallet;
      refVerifier: ReferenceVerifier;
      injiVerify: InjiVerifyClient;
      parties: PartiesService;
    },
  ) {
    super();
    this.setMaxListeners(200);
  }

  /** The type behind a run: a Studio type id or "ext:<issuer>/<type>". */
  async resolveType(typeId: string): Promise<{ type: CatalogType; studio?: CredentialType }> {
    if (isExternalTypeId(typeId)) {
      const found = this.deps.parties.findType(typeId);
      if (!found) throw new RunError("unknown_type", `No external credential type ${typeId} in the parties file. Was the file changed without a restart?`);
      return { type: found.catalog };
    }
    const studio = await this.deps.studio.requireType(typeId);
    const issuer = await this.deps.store.getIssuer(studio.issuerSlug);
    return { type: catalogFromStudio(studio, issuer?.name ?? studio.issuerSlug), studio };
  }

  async start(input: unknown): Promise<Run> {
    const spec = RunSpecInput.parse(input) as RunSpec;
    const { type, studio } = await this.resolveType(spec.typeId);
    const wallet = this.deps.parties.wallet(spec.wallet);
    const verifier = this.deps.parties.verifier(spec.verifier);
    if (!wallet) throw new RunError("unknown_wallet", `No wallet called "${spec.wallet}". Built-in wallets and the ones in the parties file are listed on the Parties page.`);
    if (!verifier) throw new RunError("unknown_verifier", `No verifier called "${spec.verifier}".`);
    const cast: Cast = { type, studio, wallet, verifier };
    this.check(spec, cast);
    if (spec.query === "dcql" && !verifier.ownQuery && !verifier.accepts.includes("dcql") && spec.mode !== "direct-share") {
      // Allowed on purpose: the verifier will refuse, and that refusal is the finding. We note it up front.
      log.info({ verifier: spec.verifier }, "DCQL requested from a PE-only verifier");
    }
    const run: Run = {
      id: shortId("run"),
      createdAt: now(),
      updatedAt: now(),
      status: "running",
      spec,
      labels: {
        ...(type.origin === "external" || wallet.origin === "external" || verifier.origin === "external"
          ? { external: { issuer: type.origin === "external" || undefined, wallet: wallet.origin === "external" || undefined, verifier: verifier.origin === "external" || undefined } }
          : {}),
        issuer: type.issuerId,
        issuerName: type.issuerName,
        typeName: type.displayName,
        format: type.format,
        dataModel: type.format === "ldp_vc" ? type.dataModel : undefined,
        proofType: type.proof,
        wallet: wallet.label,
        verifier: verifier.label,
        versions: { ...VERSIONS, ...(type.origin === "external" ? { [type.issuerName]: this.deps.parties.issuers.find((i) => i.id === type.issuerId)?.software ?? "external" } : {}), ...(verifier.software && verifier.origin === "external" ? { [verifier.label]: verifier.software } : {}), ...(wallet.software && wallet.origin === "external" ? { [wallet.label]: wallet.software } : {}) },
      },
      steps: (["issue", "request", "present", "verify"] as StepName[]).map((name) => ({ name, status: "pending" })),
    };
    if (spec.mode === "direct-share") run.steps[1] = { name: "request", status: "skipped", note: "Direct share has no request: the holder shows the credential itself as a QR code." };
    await this.save(run);
    void this.execute(run, cast).catch((e) => log.error({ err: e, run: run.id }, "run crashed"));
    return run;
  }

  /** Combinations that cannot work, refused up front with the reason. */
  private check(spec: RunSpec, c: Cast) {
    if (!c.wallet.runnable) throw new RunError("unsupported", "Inji Web 0.17 has no credential-offer support, so it cannot take part in issuer-initiated runs. Use it from the Wallet page (wallet-initiated).");
    if (spec.tamper !== "none" && !c.wallet.supportsTamper) throw new RunError("unsupported", `Only the Reference Wallet can misbehave on purpose; ${c.wallet.label} presents honestly.`);
    if (spec.mode === "direct-share") {
      if (!c.verifier.supportsDirectShare) throw new RunError("unsupported", `Direct share means showing the credential's own QR code to Inji Verify. ${c.verifier.label} only takes OpenID4VP presentations.`);
      if (!c.wallet.supportsDirectShare) throw new RunError("unsupported", `${c.wallet.label} keeps its credentials behind its API, so it cannot show one as a QR code. Use an OpenID4VP request instead.`);
    }
    if (c.verifier.origin === "external" && !c.verifier.formats.includes(c.type.format)) throw new RunError("unsupported", `${c.verifier.label} is configured to verify ${c.verifier.formats.join(", ")}, not ${c.type.format}.`);
    if (spec.skipIssuance && c.wallet.id !== "reference-wallet") throw new RunError("unsupported", "Only the Reference Wallet can reuse a credential it already holds.");
  }

  cancel(id: string) {
    this.cancelled.add(id);
    this.deps.recorder.release(id);
  }

  /** Hand a waiting run what it asked for (an offer, or a Continue). Returns false when nothing is waiting. */
  provide(id: string, input: RunInput): boolean {
    const resolve = this.inputs.get(id);
    if (!resolve) return false;
    this.inputs.delete(id);
    resolve(input);
    return true;
  }

  private save = async (run: Run) => {
    run.updatedAt = now();
    await this.deps.store.putRun(run);
    this.emit("run", run);
  };

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

  /** Wait for the person: an offer pasted in, or Continue pressed. */
  private waitForInput(run: Run, accept: (i: RunInput) => boolean, timeoutMs = HUMAN_TIMEOUT_MS): Promise<RunInput> {
    return new Promise((resolve, reject) => {
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
        this.inputs.delete(run.id);
      };
      const listen = () =>
        this.inputs.set(run.id, (i) => {
          if (!accept(i)) return listen();
          cleanup();
          resolve(i);
        });
      listen();
    });
  }

  private querySpec(run: Run, type: CatalogType): QuerySpec {
    const claims = run.spec.requestedClaims.filter((c) => type.fields.some((f) => f.name === c));
    return {
      id: `${type.issuerId}-${type.typeName ?? type.configurationId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      purpose: `Show your ${type.displayName}`,
      format: type.format,
      typeName: type.typeName,
      vct: type.vct,
      claims,
      requireHolderBinding: true,
    };
  }

  /** Claims typed per field (numbers, booleans), for an external issuer's offer request. */
  private externalClaims(type: CatalogType, raw: Record<string, unknown>) {
    const { claims, errors, ok } = coerceClaims({ fields: type.fields.map((f) => ({ ...f, required: false })) }, raw);
    if (!ok) throw new RunError("invalid_claims", `Some claim values do not fit the type: ${Object.entries(errors).map(([k, v]) => `${k} ${v}`).join("; ")}.`);
    return claims;
  }

  /** Turn an external party's failure into a run error that keeps its answer as the detail. */
  private partyError(e: unknown): never {
    if (e instanceof PartyError) throw new RunError(e.code, e.message, e.detail === undefined ? undefined : typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail).slice(0, 2000));
    throw e;
  }

  private async execute(run: Run, cast: Cast) {
    const { spec } = run;
    const { type, studio: studioType, wallet: walletInfo, verifier: verifierInfo } = cast;
    const { wallet, recorder, studio, refVerifier, injiVerify, parties } = this.deps;
    const human = walletInfo.interactive;
    const extWallet = walletInfo.origin === "external" ? parties.externalWallet(walletInfo.id) : undefined;
    const extVerifier = verifierInfo.origin === "external" ? parties.externalVerifier(verifierInfo.id) : undefined;
    const extIssuer = type.origin === "external" ? parties.findType(type.id) : undefined;
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

        // Get an offer: from the playground's Certify, from an external issuer's offer API, or from the person.
        let offerUri: string | undefined;
        if (studioType) {
          offerUri = (await studio.createOffer(studioType.id, spec.claims, { txCode: spec.txCode, runId: run.id })).offerUri;
          recorder.bind(run.id, decodeURIComponent(offerUri).split("/").pop());
        } else if (extIssuer) {
          const steps = extIssuer.type.offer ?? extIssuer.issuer.offer;
          if (steps) {
            const claims = this.externalClaims(type, spec.claims);
            const saved = await parties
              .runSteps(steps, { claims, configurationId: type.configurationId, vct: type.vct ?? "", typeName: type.typeName ?? "", txCode: spec.txCode ?? "", runId: run.id }, { recorder, runId: run.id, from: "verifier-backend", to: "external-issuer", phase: "issuance" })
              .catch((e) => this.partyError(e));
            offerUri = String(saved.offerUri);
          } else if (!human) {
            s.status = "waiting";
            s.action = { kind: "paste-offer", uri: type.offerPage, hint: `${type.issuerName} has no offer API in the parties file. Get an offer for "${type.displayName}" from it${type.offerPage ? " (link above)" : ""} and paste it here.` };
            await this.save(run);
            offerUri = (await this.waitForInput(run, (i) => typeof i.offerUri === "string" && i.offerUri.startsWith("openid-credential-offer"))).offerUri!;
          }
        }
        if (offerUri) run.offerUri = offerUri;

        // Deliver it to the wallet.
        if (walletInfo.id === "reference-wallet") {
          const r = await wallet.receive(offerUri!, { txCode: spec.txCode, runId: run.id, typeId: studioType?.id });
          heldId = r.held.id;
          credential = r.credential;
          s.note = `Credential received from ${type.issuerName} and bound to ${r.held.holder.slice(0, 32)}…`;
          return;
        }
        if (extWallet?.automation) {
          await parties
            .runSteps(extWallet.automation.receive, { offerUri: offerUri!, txCode: spec.txCode ?? "", runId: run.id }, { recorder, runId: run.id, from: "verifier-backend", to: "external-wallet", phase: "issuance" })
            .catch((e) => this.partyError(e));
          s.note = `${walletInfo.label} accepted the offer through its API${studioType ? "; its own requests to Certify went through the gateway and are in the inspector" : ""}.`;
          return;
        }
        // A person with a wallet app.
        s.status = "waiting";
        if (!offerUri) {
          s.action = { kind: "open-link", uri: type.offerPage, needsConfirm: true, hint: `Collect "${type.displayName}" from ${type.issuerName} with ${walletInfo.label}${type.offerPage ? " (link above)" : ""}, then press Continue.` };
          await this.save(run);
          await this.waitForInput(run, (i) => Boolean(i.confirm));
          s.note = `Collected outside the playground (${type.issuerName} is not behind the gateway).`;
          return;
        }
        if (studioType) {
          s.action = { kind: "scan-offer", uri: offerUri, hint: spec.txCode ? `Scan with ${walletInfo.label}, then enter PIN ${spec.txCode}.` : `Scan with ${walletInfo.label} and accept the credential.` };
          await this.save(run);
          recorder.await(run.id, ["certify"]);
          await this.waitForEvent(run, (e) => e.title === "Credential request" && e.status < 300);
          s.note = "The wallet fetched its credential through the gateway.";
          return;
        }
        // An external issuer's offer: the phone talks to that issuer directly, so the person tells us when it is done.
        s.action = { kind: "scan-offer", uri: offerUri, needsConfirm: true, hint: `Scan with ${walletInfo.label}${spec.txCode ? ` (PIN ${spec.txCode})` : ""} and accept the credential, then press Continue. ${type.issuerName} is outside the gateway, so the playground cannot see the wallet collect it.` };
        await this.save(run);
        await this.waitForInput(run, (i) => Boolean(i.confirm));
        s.note = `${walletInfo.label} collected the credential from ${type.issuerName}.`;
      });

      // 2. Request ----------------------------------------------------------------------------------------
      const q = this.querySpec(run, type);
      let requestRef: { kind: "inji"; transactionId: string; requestId: string } | { kind: "ref"; id: string } | { kind: "ext"; saved: Record<string, unknown> } | undefined;
      if (spec.mode !== "direct-share") {
        await this.step(run, "request", async (s) => {
          if (extVerifier) {
            const saved = await parties
              .runSteps(extVerifier.request, { format: type.format, vct: type.vct ?? "", typeName: type.typeName ?? "", requestedClaims: q.claims, presentationDefinition: toPresentationDefinition(q, "spec"), runId: run.id }, { recorder, runId: run.id, from: "verifier-backend", to: "external-verifier", phase: "presentation" })
              .catch((e) => this.partyError(e));
            run.requestUri = String(saved.requestUri);
            requestRef = { kind: "ext", saved };
            s.note = `${verifierInfo.label} wrote its own request${saved.state ? ` (state ${String(saved.state)})` : ""}.`;
            return;
          }
          if (spec.verifier === "inji-verify") {
            if (spec.query === "dcql") {
              // Send it anyway: what the 0.x service does with a DCQL request is the finding.
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

      /** Ask an external verifier for its verdict until it has one. */
      const externalVerdict = async (timeoutMs: number) => {
        const deadline = Date.now() + timeoutMs;
        let last: unknown;
        for (;;) {
          if (this.cancelled.has(run.id)) throw new RunError("cancelled", "The run was cancelled.");
          try {
            const saved = await parties.runSteps(extVerifier!.result, { ...(requestRef as { saved: Record<string, unknown> }).saved, runId: run.id }, { recorder, runId: run.id, from: "verifier-backend", to: "external-verifier", phase: "verification" });
            if (saved.verified !== undefined && saved.verified !== null) return saved;
          } catch (e) {
            last = e;
            if (!(e instanceof PartyError) || e.code === "config_error" || e.code === "unreachable") this.partyError(e);
          }
          if (Date.now() > deadline) throw new RunError("timeout", `${verifierInfo.label} gave no verdict within ${Math.round(timeoutMs / 1000)} s.`, last instanceof PartyError ? String(last.message) : undefined);
          await new Promise((r) => setTimeout(r, 1500));
        }
      };

      // 3. Present ----------------------------------------------------------------------------------------
      let directResult: VerifyResultV2["credentialResults"][number] | undefined;
      let walletAnswer: Awaited<ReturnType<ReferenceWallet["present"]>> | undefined;
      let externalAnswer: Record<string, unknown> | undefined;
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
        if (walletInfo.id === "reference-wallet") {
          walletAnswer = await wallet.present(run.requestUri!, { heldId, tamper: spec.tamper, runId: run.id });
          const told = walletAnswer.disclosed ? ` Disclosed: ${walletAnswer.disclosed.join(", ") || "none"}; withheld: ${walletAnswer.withheld?.join(", ") || "none"}.` : "";
          s.note = `${walletAnswer.matches[0]?.explanation ?? "Presented."}${told}${spec.tamper !== "none" ? ` Tamper: ${TAMPER_PRESETS[spec.tamper].label}.` : ""}`;
          if (walletAnswer.status >= 400) s.note += ` The verifier answered HTTP ${walletAnswer.status}.`;
          return;
        }
        if (extWallet?.automation) {
          const pd = requestRef?.kind === "ext" ? undefined : toPresentationDefinition(q, spec.verifier === "inji-verify" ? "inji" : "spec");
          externalAnswer = await parties
            .runSteps(extWallet.automation.present, { requestUri: run.requestUri!, presentationDefinition: pd ?? {}, runId: run.id }, { recorder, runId: run.id, from: "verifier-backend", to: "external-wallet", phase: "presentation" })
            .catch((e) => this.partyError(e));
          s.note = `${walletInfo.label} answered the request through its API.`;
          return;
        }
        s.status = "waiting";
        s.action = { kind: "scan-request", uri: run.requestUri, hint: `Scan this request with ${walletInfo.label} and share the credential.` };
        await this.save(run);
        if (extVerifier) {
          // The phone talks to the external verifier directly; its verdict appearing is the signal.
          externalAnswer = await externalVerdict(HUMAN_TIMEOUT_MS);
          s.note = `${verifierInfo.label} received a presentation.`;
          return;
        }
        recorder.await(run.id, [spec.verifier === "inji-verify" ? "verify" : "reference-verifier"]);
        await this.waitForEvent(run, (e) => e.title === "Submit presentation");
      });

      // 4. Verify -----------------------------------------------------------------------------------------
      let result!: RunResult;
      await this.step(run, "verify", async (s) => {
        const expected = expectationFor(spec, type);
        if (directResult) {
          result = explainResult({ expected, kind: "inji-direct", direct: directResult, tamper: spec.tamper });
        } else if (requestRef?.kind === "ext") {
          const verdict = externalAnswer && "verified" in externalAnswer ? externalAnswer : await externalVerdict(extVerifier!.resultTimeoutSeconds * 1000);
          result = explainResult({ expected, kind: "external", who: verifierInfo.label, accepted: isTruthyVerdict(verdict.verified), detail: verdict.detail, tamper: spec.tamper });
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
      this.inputs.delete(run.id);
      await this.save(run);
    }
  }
}
