/**
 * Run orchestrator. A run is one journey: an issuer type, a wallet, a verifier, a format and a mode. It runs
 * as four steps (issue, request, present, verify). Automated wallets run straight through. For a human
 * wallet (a phone), a step waits, shows a QR code, and moves on when the gateway sees the wallet's traffic.
 *
 * Issuers, wallets and verifiers are either built in (Inji Certify via the Studio, the Reference Wallet and
 * Verifier, Inji Verify) or external parties declared in the parties file. The run drives external parties
 * through the HTTP steps the file describes. When an external party finishes a step out of sight, the run
 * waits for the person to press Continue (or to paste an offer).
 */
import { EventEmitter } from "node:events";
import {
  authorizationCodeOffer,
  catalogFromStudio,
  coerceClaims,
  isExternalTypeId,
  isHostedTypeId,
  isTruthyVerdict,
  toDcql,
  toPresentationDefinition,
  validateDcql,
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
import type { HostedService } from "../hosted/service.js";
import { HostedVerifyError, type HostedVerifyClient } from "../hosted/verify.js";
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
  mode: z
    .enum(["openid4vp-cross-device", "openid4vp-same-device", "direct-share"])
    .default("openid4vp-cross-device"),
  query: z.enum(["presentation_exchange", "dcql"]).default("presentation_exchange"),
  requestedClaims: z.array(z.string()).default([]),
  claims: z.record(z.unknown()).default({}),
  txCode: z.string().optional(),
  tamper: z
    .enum(Object.keys(TAMPER_PRESETS) as [keyof typeof TAMPER_PRESETS, ...(keyof typeof TAMPER_PRESETS)[]])
    .default("none"),
  verifyRequest: z.enum(["signed", "by-value"]).default("signed"),
  heldCredentialId: z.string().optional(),
  skipIssuance: z.boolean().default(false),
  /** Authorization-code issuance from a hosted Inji issuer: sign in automatically as a demo identity, or yourself. */
  login: z
    .object({
      mode: z.enum(["auto", "interactive"]).default("auto"),
      individualId: z.string().trim().max(40).optional(),
    })
    .optional(),
  /** DCQL claim paths for W3C credentials: from the credential's root (OpenID4VP 1.0) or from credentialSubject (Inji, G36). */
  dcqlPaths: z.enum(["spec", "inji"]).default("spec"),
});

export const VERSIONS = {
  "Inji Certify": "0.14.0",
  "Inji Verify": "0.18.2",
  OpenID4VCI: "draft 13",
  OpenID4VP: "draft 23 (PE) / 1.0 (DCQL)",
};

const HUMAN_TIMEOUT_MS = 10 * 60_000;
/** The client id for Inji Verify requests by value (a pre-registered name; Verify then does not sign). */
export const VERIFIER_CLIENT_ID = "inji-playground";

/** A verifier should reject tampered presentations and credentials past their expiry date. */
export function expectationFor(
  spec: Pick<RunSpec, "tamper">,
  type: Pick<CatalogType, "expiresAt">,
): "PASS" | "FAIL" {
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
  /** Runs waiting for a person to sign in at eSignet: their OAuth state, so a cancel can release them. */
  private logins = new Map<string, string>();

  constructor(
    private readonly deps: {
      store: Store;
      recorder: Recorder;
      studio: StudioService;
      wallet: ReferenceWallet;
      refVerifier: ReferenceVerifier;
      injiVerify: InjiVerifyClient;
      parties: PartiesService;
      /** Hosted Inji environments (MOSIP Collab): their issuers, their Inji Verify, signing in at their eSignet. */
      hosted: HostedService;
      /** Inji Verify's DID, used as the client id for signed requests. Without it every request goes by value. */
      verifyDid?: string;
    },
  ) {
    super();
    this.setMaxListeners(200);
  }

  /** The type behind a run: a Studio type id, "ext:<issuer>/<type>" or "hosted:<environment>/<issuer>/<configuration>". */
  async resolveType(typeId: string): Promise<{ type: CatalogType; studio?: CredentialType }> {
    if (isHostedTypeId(typeId)) {
      const found = this.deps.hosted.findType(typeId);
      if (!found)
        throw new RunError(
          "unknown_type",
          `No hosted credential type ${typeId}. Hosted issuers are discovered in the background after start-up; check the Parties page, then try again.`,
        );
      return { type: found };
    }
    if (isExternalTypeId(typeId)) {
      const found = this.deps.parties.findType(typeId);
      if (!found)
        throw new RunError(
          "unknown_type",
          `No external credential type ${typeId} in the parties file. Was the file changed without a restart?`,
        );
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
    const verifier =
      this.deps.parties.verifier(spec.verifier) ?? this.deps.hosted.verifier(spec.verifier)?.info;
    if (!wallet)
      throw new RunError(
        "unknown_wallet",
        `No wallet called "${spec.wallet}". Built-in wallets and the ones in the parties file are listed on the Parties page.`,
      );
    if (!verifier) throw new RunError("unknown_verifier", `No verifier called "${spec.verifier}".`);
    const cast: Cast = { type, studio, wallet, verifier };
    this.check(spec, cast);
    if (
      spec.query === "dcql" &&
      !verifier.ownQuery &&
      !verifier.accepts.includes("dcql") &&
      spec.mode !== "direct-share"
    ) {
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
          ? {
              external: {
                issuer: type.origin === "external" || undefined,
                wallet: wallet.origin === "external" || undefined,
                verifier: verifier.origin === "external" || undefined,
              },
            }
          : {}),
        ...(type.hosted || verifier.origin === "hosted"
          ? {
              hosted: {
                issuer: type.hosted?.environmentName,
                verifier:
                  verifier.origin === "hosted"
                    ? this.deps.hosted.environment(verifier.environmentId!)?.name
                    : undefined,
              },
            }
          : {}),
        issuer: type.issuerId,
        issuerName: type.issuerName,
        typeName: type.displayName,
        format: type.format,
        dataModel: type.format === "ldp_vc" ? type.dataModel : undefined,
        proofType: type.proof,
        wallet: wallet.label,
        verifier: verifier.label,
        versions: {
          ...VERSIONS,
          ...(type.origin === "external"
            ? {
                [type.issuerName]:
                  this.deps.parties.issuers.find((i) => i.id === type.issuerId)?.software ?? "external",
              }
            : {}),
          ...(type.hosted
            ? {
                [`Inji Certify (${type.hosted.environmentName}, ${type.issuerName})`]: `${type.hosted.protocol === "1.0" ? "1.0 line" : "0.x line"}, OpenID4VCI ${type.hosted.protocol}`,
              }
            : {}),
          ...(verifier.software && verifier.origin !== "builtin"
            ? { [verifier.label]: verifier.software }
            : {}),
          ...(wallet.software && wallet.origin === "external" ? { [wallet.label]: wallet.software } : {}),
        },
      },
      steps: (["issue", "request", "present", "verify"] as StepName[]).map((name) => ({
        name,
        status: "pending",
      })),
    };
    if (spec.mode === "direct-share")
      run.steps[1] = {
        name: "request",
        status: "skipped",
        note: "Direct share has no request: the holder shows the credential itself as a QR code.",
      };
    await this.save(run);
    void this.execute(run, cast).catch((e) => log.error({ err: e, run: run.id }, "run crashed"));
    return run;
  }

  /** Combinations that cannot work, refused up front with the reason. */
  private check(spec: RunSpec, c: Cast) {
    if (!c.wallet.runnable)
      throw new RunError(
        "unsupported",
        "Inji Web is a wallet-initiated browser wallet on MOSIP Collab: open it, pick an issuer and sign in. It presents only to verifiers its Mimoto trusts, so the playground cannot drive it in runs.",
      );
    if (c.type.format === "mso_mdoc" && spec.mode !== "direct-share")
      throw new RunError(
        "unsupported",
        "No verifier here can check an mso_mdoc credential yet: Inji Verify does not support it (MOSIP, AMA 4) and neither does the Reference Verifier. Collect it from the Wallet page to look at it.",
      );
    const h = c.type.hosted;
    if (h) {
      if (
        c.wallet.id === "reference-wallet" &&
        !(h.authorizationServer && this.deps.hosted.clientFor(h.environmentId, h.authorizationServer))
      )
        throw new RunError(
          "unsupported",
          `${c.type.issuerName} signs holders in at ${h.authorizationServer ? new URL(h.authorizationServer).host : "its own server"}, where the Reference Wallet has no OAuth client${this.deps.hosted.clientProblem(h.environmentId) ? ` (${this.deps.hosted.clientProblem(h.environmentId)})` : ""}. Use Inji Wallet on a phone, which signs in through ${h.environmentName}'s Mimoto, or pick an issuer marked "automatic".`,
        );
      if (c.wallet.origin === "external" && !c.wallet.interactive)
        throw new RunError(
          "unsupported",
          `${c.wallet.label} is driven through its API and cannot sign a person in at eSignet, so it cannot collect from ${c.type.issuerName}.`,
        );
    }
    if (c.verifier.origin === "hosted" && spec.mode === "direct-share" && c.wallet.interactive)
      throw new RunError(
        "unsupported",
        `To show a credential's own QR code to ${c.verifier.label}, open its page yourself; the playground can only send it a credential the Reference Wallet holds.`,
      );
    if (spec.tamper !== "none" && !c.wallet.supportsTamper)
      throw new RunError(
        "unsupported",
        `Only the Reference Wallet can misbehave on purpose; ${c.wallet.label} presents honestly.`,
      );
    if (spec.mode === "direct-share") {
      if (!c.verifier.supportsDirectShare)
        throw new RunError(
          "unsupported",
          `Direct share means showing the credential's own QR code to Inji Verify. ${c.verifier.label} only takes OpenID4VP presentations.`,
        );
      if (!c.wallet.supportsDirectShare)
        throw new RunError(
          "unsupported",
          `${c.wallet.label} keeps its credentials behind its API, so it cannot show one as a QR code. Use an OpenID4VP request instead.`,
        );
    }
    if (c.verifier.origin !== "builtin" && !c.verifier.formats.includes(c.type.format))
      throw new RunError(
        "unsupported",
        `${c.verifier.label} is configured to verify ${c.verifier.formats.join(", ")}, not ${c.type.format}.`,
      );
    if (spec.skipIssuance && c.wallet.id !== "reference-wallet")
      throw new RunError("unsupported", "Only the Reference Wallet can reuse a credential it already holds.");
  }

  cancel(id: string) {
    this.cancelled.add(id);
    this.deps.recorder.release(id);
    const state = this.logins.get(id);
    if (state) this.deps.hosted.cancelInteractive(state);
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
  private waitForEvent(
    run: Run,
    predicate: (e: EventSummary) => boolean,
    timeoutMs = HUMAN_TIMEOUT_MS,
  ): Promise<EventSummary> {
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
  private waitForInput(
    run: Run,
    accept: (i: RunInput) => boolean,
    timeoutMs = HUMAN_TIMEOUT_MS,
  ): Promise<RunInput> {
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
      id: `${type.issuerId}-${type.typeName ?? type.configurationId}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-"),
      purpose: `Show your ${type.displayName}`,
      format: type.format,
      typeName: type.typeName,
      typeIri: type.typeIri,
      vct: type.vct,
      claims,
      requireHolderBinding: true,
    };
  }

  /** Claims typed per field (numbers, booleans), for an external issuer's offer request. */
  private externalClaims(type: CatalogType, raw: Record<string, unknown>) {
    const { claims, errors, ok } = coerceClaims(
      { fields: type.fields.map((f) => ({ ...f, required: false })) },
      raw,
    );
    if (!ok)
      throw new RunError(
        "invalid_claims",
        `Some claim values do not fit the type: ${Object.entries(errors)
          .map(([k, v]) => `${k} ${v}`)
          .join("; ")}.`,
      );
    return claims;
  }

  /** Turn an external party's failure into a run error that keeps its answer as the detail. */
  private partyError(e: unknown): never {
    if (e instanceof PartyError)
      throw new RunError(
        e.code,
        e.message,
        e.detail === undefined
          ? undefined
          : typeof e.detail === "string"
            ? e.detail
            : JSON.stringify(e.detail).slice(0, 2000),
      );
    throw e;
  }

  /** Turn a hosted Inji service's failure (or its absence) into a run error with its answer as the detail. */
  private hostedError(e: unknown): never {
    if (e instanceof HostedVerifyError)
      throw new RunError(
        e.code,
        e.message,
        e.body === undefined ? undefined : JSON.stringify(e.body).slice(0, 2000),
      );
    const err = e as { code?: string; message: string };
    throw new RunError(err.code ?? "hosted_error", err.message);
  }

  /**
   * Authorization-code issuance from a hosted Inji issuer (MOSIP Collab). The Reference Wallet signs the holder
   * in at the issuer's eSignet, by itself with a demo identity or with the person on eSignet's own page; a
   * person's wallet gets an authorization-code offer to scan and signs in on the phone.
   */
  private async issueHosted(
    run: Run,
    s: RunStep,
    cast: Cast,
  ): Promise<{ heldId?: string; credential?: unknown }> {
    const { type, wallet: walletInfo } = cast;
    const h = type.hosted!;
    const { wallet, hosted } = this.deps;
    const host = h.authorizationServer ? new URL(h.authorizationServer).host : "the issuer";
    if (walletInfo.id === "reference-wallet") {
      const client = hosted.clientFor(h.environmentId, h.authorizationServer!)!;
      const mode = run.spec.login?.mode ?? "auto";
      let who = "";
      const r = await wallet
        .receiveAuthorized({
          credentialIssuer: h.credentialIssuer,
          configId: type.configurationId,
          client,
          runId: run.id,
          typeId: type.id,
          signIn: async (p) => {
            if (mode === "auto") {
              const id =
                run.spec.login?.individualId ??
                hosted.identities(h.environmentId, p.authorizationServer)[0]?.id;
              who = `as demo identity ${id ?? "?"} with ${h.environmentName}'s test OTP`;
              s.note = `Signing in at ${host} ${who}…`;
              await this.save(run);
              return hosted.signInAutomatically(h.environmentId, p, { individualId: id, runId: run.id });
            }
            const { url, code } = hosted.startInteractive(h.environmentId, p);
            this.logins.set(run.id, p.state);
            s.status = "waiting";
            s.action = {
              kind: "login",
              uri: url,
              environment: h.environmentId,
              hint: `Sign in at ${host} (eSignet) as the holder, with a demo identity from the test data below or your own. eSignet then sends you back to the playground, and the run carries on.`,
            };
            await this.save(run);
            try {
              const c = await code;
              who = "by you";
              return c;
            } finally {
              this.logins.delete(run.id);
              s.status = "running";
              s.action = undefined;
              await this.save(run);
            }
          },
        })
        .catch((e) => {
          const err = e as { code?: string; message: string; status?: number; body?: unknown };
          throw new RunError(
            err.code ?? "issuance_failed",
            err.status ? `${err.message} (HTTP ${err.status})` : err.message,
            err.body === undefined ? undefined : JSON.stringify(err.body).slice(0, 2000),
          );
        });
      s.note = `Signed in at ${host} ${who} and collected the credential from ${type.issuerName} with the authorization code flow (OpenID4VCI ${h.protocol}). Bound to ${r.held.holder.slice(0, 32)}…`;
      return { heldId: r.held.id, credential: r.credential };
    }
    // A person's wallet: an authorization-code offer to scan. The phone then talks to the hosted issuer directly.
    s.status = "waiting";
    s.action = {
      kind: "scan-offer",
      uri: authorizationCodeOffer(h.credentialIssuer, [type.configurationId], h.authorizationServer),
      needsConfirm: true,
      environment: h.environmentId,
      hint: `Scan with ${walletInfo.label}. It sends you to ${host} (eSignet) to sign in with the test data below, then downloads "${type.displayName}". Inji Wallet can also add it from its own issuer list (+, then ${type.issuerName}). Press Continue once the credential is in the wallet.`,
    };
    await this.save(run);
    await this.waitForInput(run, (i) => Boolean(i.confirm));
    s.note = `${walletInfo.label} collected "${type.displayName}" from ${type.issuerName}. That exchange ran between the phone and ${h.environmentName}, outside the playground's gateway.`;
    return {};
  }

  /** A presentation request at a hosted Inji Verify: DCQL for the 1.0 line, or Presentation Exchange to record its refusal. */
  private async requestHosted(
    run: Run,
    s: RunStep,
    hv: NonNullable<ReturnType<HostedService["verifier"]>>,
    q: QuerySpec,
    type: CatalogType,
  ) {
    const clientId = hv.env.verify!.clientId;
    const host = new URL(hv.env.verify!.url).host;
    if (run.spec.query !== "dcql" && !hv.info.accepts.includes("presentation_exchange")) {
      // Send it anyway: what a DCQL-only verifier does with Presentation Exchange is the finding (M11 the other way round).
      let r: Awaited<ReturnType<HostedVerifyClient["createRequest"]>>;
      try {
        r = await hv.client.createRequest({
          clientId,
          presentationDefinition: toPresentationDefinition(q, "inji"),
          runId: run.id,
        });
      } catch (e) {
        if (!(e instanceof HostedVerifyError)) this.hostedError(e);
        throw new RunError(
          "incompatible",
          `${hv.info.label} refused the Presentation Exchange request (HTTP ${e.status}, ${e.code}). The 1.0 line understands DCQL only; Presentation Exchange is the 0.x line's query language.`,
        );
      }
      throw new RunError(
        "incompatible",
        `${hv.info.label} accepted the call but request ${r.requestId} carries ${r.authorizationDetails?.dcqlQuery ? "a DCQL query it did not get" : "no query a wallet can answer"}.`,
      );
    }
    const dcqlQuery = toDcql(q, { typeIri: type.typeIri, pathStyle: run.spec.dcqlPaths });
    const problems = validateDcql(dcqlQuery);
    if (problems.length) throw new RunError(problems[0]!.code, problems.map((p) => p.message).join(" "));
    const req = await hv.client
      .createRequest({ clientId, dcqlQuery, runId: run.id })
      .catch((e) => this.hostedError(e));
    this.deps.recorder.bind(run.id, req.requestId, req.transactionId, req.nonce);
    run.requestUri = hv.client.authorizationUri(req, clientId);
    s.note = req.requestUri
      ? `DCQL request ${req.requestId} created at ${host}: signed by Inji Verify (client_id ${clientId}) and fetched by request_uri.`
      : `DCQL request ${req.requestId} created at ${host}, by value (client_id ${clientId}).`;
    return {
      kind: "hosted" as const,
      transactionId: req.transactionId,
      requestId: req.requestId,
      client: hv.client,
      label: hv.info.label,
    };
  }

  /** Wait for a phone to answer a hosted verifier, which the playground sees only as the request's status changing. */
  private async waitForHostedSubmission(run: Run, ref: { requestId: string; client: HostedVerifyClient }) {
    const deadline = Date.now() + HUMAN_TIMEOUT_MS;
    for (;;) {
      if (this.cancelled.has(run.id)) throw new RunError("cancelled", "The run was cancelled.");
      const status = await ref.client.status(ref.requestId, run.id).catch(() => "ACTIVE");
      if (status === "VP_SUBMITTED") return;
      if (status === "EXPIRED")
        throw new RunError("timeout", "The hosted verifier's request expired before a wallet answered it.");
      if (Date.now() > deadline)
        throw new RunError("timeout", "Nobody answered the request within 10 minutes.");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  private async execute(run: Run, cast: Cast) {
    const { spec } = run;
    const { type, studio: studioType, wallet: walletInfo, verifier: verifierInfo } = cast;
    const { wallet, recorder, studio, refVerifier, injiVerify, parties } = this.deps;
    const human = walletInfo.interactive;
    const extWallet = walletInfo.origin === "external" ? parties.externalWallet(walletInfo.id) : undefined;
    const extVerifier =
      verifierInfo.origin === "external" ? parties.externalVerifier(verifierInfo.id) : undefined;
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

        // A hosted Inji issuer (MOSIP Collab): the authorization code flow, the holder signs in at its eSignet.
        if (type.hosted) {
          const got = await this.issueHosted(run, s, cast);
          heldId = got.heldId;
          credential = got.credential;
          return;
        }

        // Get an offer: from the playground's Certify, from an external issuer's offer API, or from the person.
        let offerUri: string | undefined;
        if (studioType) {
          offerUri = (
            await studio.createOffer(studioType.id, spec.claims, { txCode: spec.txCode, runId: run.id })
          ).offerUri;
          recorder.bind(run.id, decodeURIComponent(offerUri).split("/").pop());
        } else if (extIssuer) {
          const steps = extIssuer.type.offer ?? extIssuer.issuer.offer;
          if (steps) {
            const claims = this.externalClaims(type, spec.claims);
            const saved = await parties
              .runSteps(
                steps,
                {
                  claims,
                  configurationId: type.configurationId,
                  vct: type.vct ?? "",
                  typeName: type.typeName ?? "",
                  txCode: spec.txCode ?? "",
                  runId: run.id,
                },
                {
                  recorder,
                  runId: run.id,
                  from: "verifier-backend",
                  to: "external-issuer",
                  phase: "issuance",
                },
              )
              .catch((e) => this.partyError(e));
            offerUri = String(saved.offerUri);
          } else if (!human) {
            s.status = "waiting";
            s.action = {
              kind: "paste-offer",
              uri: type.offerPage,
              hint: `${type.issuerName} has no offer API in the parties file. Get an offer for "${type.displayName}" from it${type.offerPage ? " (link above)" : ""} and paste it here.`,
            };
            await this.save(run);
            offerUri = (
              await this.waitForInput(
                run,
                (i) => typeof i.offerUri === "string" && i.offerUri.startsWith("openid-credential-offer"),
              )
            ).offerUri!;
          }
        }
        if (offerUri) run.offerUri = offerUri;

        // Deliver it to the wallet.
        if (walletInfo.id === "reference-wallet") {
          const r = await wallet.receive(offerUri!, {
            txCode: spec.txCode,
            runId: run.id,
            typeId: studioType?.id,
          });
          heldId = r.held.id;
          credential = r.credential;
          s.note = `Credential received from ${type.issuerName} and bound to ${r.held.holder.slice(0, 32)}…`;
          return;
        }
        if (extWallet?.automation) {
          await parties
            .runSteps(
              extWallet.automation.receive,
              { offerUri: offerUri!, txCode: spec.txCode ?? "", runId: run.id },
              { recorder, runId: run.id, from: "verifier-backend", to: "external-wallet", phase: "issuance" },
            )
            .catch((e) => this.partyError(e));
          s.note = `${walletInfo.label} accepted the offer through its API${studioType ? "; its own requests to Certify went through the gateway and are in the inspector" : ""}.`;
          return;
        }
        // A person with a wallet app.
        s.status = "waiting";
        if (!offerUri) {
          s.action = {
            kind: "open-link",
            uri: type.offerPage,
            needsConfirm: true,
            hint: `Collect "${type.displayName}" from ${type.issuerName} with ${walletInfo.label}${type.offerPage ? " (link above)" : ""}, then press Continue.`,
          };
          await this.save(run);
          await this.waitForInput(run, (i) => Boolean(i.confirm));
          s.note = `Collected outside the playground (${type.issuerName} is not behind the gateway).`;
          return;
        }
        if (studioType) {
          s.action = {
            kind: "scan-offer",
            uri: offerUri,
            hint: spec.txCode
              ? `Scan with ${walletInfo.label}, then enter PIN ${spec.txCode}.`
              : `Scan with ${walletInfo.label} and accept the credential.`,
          };
          await this.save(run);
          recorder.await(run.id, ["certify"]);
          await this.waitForEvent(run, (e) => e.title === "Credential request" && e.status < 300);
          s.note = "The wallet fetched its credential through the gateway.";
          return;
        }
        // An external issuer's offer: the phone talks to that issuer directly, so the person tells us when it is done.
        s.action = {
          kind: "scan-offer",
          uri: offerUri,
          needsConfirm: true,
          hint: `Scan with ${walletInfo.label}${spec.txCode ? ` (PIN ${spec.txCode})` : ""} and accept the credential, then press Continue. ${type.issuerName} is outside the gateway, so the playground cannot see the wallet collect it.`,
        };
        await this.save(run);
        await this.waitForInput(run, (i) => Boolean(i.confirm));
        s.note = `${walletInfo.label} collected the credential from ${type.issuerName}.`;
      });

      // 2. Request ----------------------------------------------------------------------------------------
      const q = this.querySpec(run, type);
      let requestRef:
        | { kind: "inji"; transactionId: string; requestId: string }
        | {
            kind: "hosted";
            transactionId: string;
            requestId: string;
            client: HostedVerifyClient;
            label: string;
          }
        | { kind: "ref"; id: string }
        | { kind: "ext"; saved: Record<string, unknown> }
        | undefined;
      const hostedVerifier = this.deps.hosted.verifier(spec.verifier);
      if (spec.mode !== "direct-share") {
        await this.step(run, "request", async (s) => {
          if (extVerifier) {
            const saved = await parties
              .runSteps(
                extVerifier.request,
                {
                  format: type.format,
                  vct: type.vct ?? "",
                  typeName: type.typeName ?? "",
                  requestedClaims: q.claims,
                  presentationDefinition: toPresentationDefinition(q, "spec"),
                  runId: run.id,
                },
                {
                  recorder,
                  runId: run.id,
                  from: "verifier-backend",
                  to: "external-verifier",
                  phase: "presentation",
                },
              )
              .catch((e) => this.partyError(e));
            run.requestUri = String(saved.requestUri);
            requestRef = { kind: "ext", saved };
            s.note = `${verifierInfo.label} wrote its own request${saved.state ? ` (state ${String(saved.state)})` : ""}.`;
            return;
          }
          if (hostedVerifier) {
            requestRef = await this.requestHosted(run, s, hostedVerifier, q, type);
            return;
          }
          if (spec.verifier === "inji-verify") {
            if (spec.query === "dcql") {
              // Send it anyway: what the 0.x service does with a DCQL request is the finding.
              try {
                const r = await injiVerify.createDcqlRequest({
                  clientId: VERIFIER_CLIENT_ID,
                  dcqlQuery: toDcql(q),
                  runId: run.id,
                });
                const pd = r.authorizationDetails?.presentationDefinition;
                throw new RunError(
                  "incompatible",
                  `Inji Verify 0.18.2 accepted the call but ignored dcqlQuery (request ${r.requestId} has ${pd ? "a presentation_definition" : "no query at all"}), so no wallet can answer it meaningfully.`,
                );
              } catch (e) {
                if (e instanceof RunError) throw e;
                const err = e as { status?: number; code?: string; detail?: string; message: string };
                throw new RunError(
                  "incompatible",
                  `Inji Verify 0.18.2 refused the DCQL request (HTTP ${err.status ?? "?"}${err.code ? `, ${err.code}` : ""}${err.detail ? `: ${err.detail}` : ""}). It only understands Presentation Exchange; DCQL arrives with the 1.0 line.`,
                );
              }
            }
            const signed = spec.verifyRequest !== "by-value" && Boolean(this.deps.verifyDid);
            const clientId = signed ? this.deps.verifyDid! : VERIFIER_CLIENT_ID;
            const req = await injiVerify.createRequest({
              clientId,
              presentationDefinition: toPresentationDefinition(q, "inji"),
              runId: run.id,
            });
            recorder.bind(run.id, req.requestId, req.transactionId, req.nonce);
            run.requestUri = injiVerify.authorizationUri(req, clientId);
            requestRef = { kind: "inji", transactionId: req.transactionId, requestId: req.requestId };
            s.note = req.requestUri
              ? `Presentation Exchange request ${req.requestId} created: signed by Inji Verify, fetched by request_uri (client_id ${clientId}).`
              : `Presentation Exchange request ${req.requestId} created (by value, client_id ${clientId}).`;
          } else {
            const session = await refVerifier.createRequest(q, {
              language: spec.query,
              runId: run.id,
              pathStyle: spec.dcqlPaths,
            });
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
            const saved = await parties.runSteps(
              extVerifier!.result,
              { ...(requestRef as { saved: Record<string, unknown> }).saved, runId: run.id },
              {
                recorder,
                runId: run.id,
                from: "verifier-backend",
                to: "external-verifier",
                phase: "verification",
              },
            );
            if (saved.verified !== undefined && saved.verified !== null) return saved;
          } catch (e) {
            last = e;
            if (!(e instanceof PartyError) || e.code === "config_error" || e.code === "unreachable")
              this.partyError(e);
          }
          if (Date.now() > deadline)
            throw new RunError(
              "timeout",
              `${verifierInfo.label} gave no verdict within ${Math.round(timeoutMs / 1000)} s.`,
              last instanceof PartyError ? String(last.message) : undefined,
            );
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
            s.action = {
              kind: "upload-vc",
              hint: "Open the credential in your wallet, show its QR code, and scan or upload it on the Verifier page.",
            };
            await this.save(run);
            recorder.await(run.id, ["verify"]);
            await this.waitForEvent(run, (e) => e.title.startsWith("Verify credential"));
            return;
          }
          const vcText = typeof credential === "string" ? credential : JSON.stringify(credential);
          s.note = `Shared ${vcText.length} bytes directly (no OpenID4VP)${hostedVerifier ? ` with ${hostedVerifier.info.label}` : ""}.`;
          directResult = hostedVerifier
            ? await hostedVerifier.client.verifyCredential(vcText, run.id).catch((e) => this.hostedError(e))
            : await injiVerify.verifyCredential(vcText, run.id);
          return;
        }
        if (walletInfo.id === "reference-wallet") {
          walletAnswer = await wallet.present(run.requestUri!, {
            heldId,
            tamper: spec.tamper,
            runId: run.id,
          });
          const told = walletAnswer.disclosed
            ? ` Disclosed: ${walletAnswer.disclosed.join(", ") || "none"}; withheld: ${walletAnswer.withheld?.join(", ") || "none"}.`
            : "";
          s.note = `${walletAnswer.matches[0]?.explanation ?? "Presented."}${told}${spec.tamper !== "none" ? ` Tamper: ${TAMPER_PRESETS[spec.tamper].label}.` : ""}${walletAnswer.notes.length ? ` ${walletAnswer.notes.join(" ")}` : ""}`;
          if (walletAnswer.status >= 400) s.note += ` The verifier answered HTTP ${walletAnswer.status}.`;
          return;
        }
        if (extWallet?.automation) {
          const pd =
            requestRef?.kind === "ext"
              ? undefined
              : toPresentationDefinition(q, spec.verifier === "inji-verify" ? "inji" : "spec");
          externalAnswer = await parties
            .runSteps(
              extWallet.automation.present,
              { requestUri: run.requestUri!, presentationDefinition: pd ?? {}, runId: run.id },
              {
                recorder,
                runId: run.id,
                from: "verifier-backend",
                to: "external-wallet",
                phase: "presentation",
              },
            )
            .catch((e) => this.partyError(e));
          s.note = `${walletInfo.label} answered the request through its API.`;
          return;
        }
        s.status = "waiting";
        s.action = {
          kind: "scan-request",
          uri: run.requestUri,
          hint: `Scan this request with ${walletInfo.label} and share the credential.`,
        };
        await this.save(run);
        if (extVerifier) {
          // The phone talks to the external verifier directly; its verdict appearing is the signal.
          externalAnswer = await externalVerdict(HUMAN_TIMEOUT_MS);
          s.note = `${verifierInfo.label} received a presentation.`;
          return;
        }
        if (requestRef?.kind === "hosted") {
          // The phone answers the hosted verifier directly; its request status changing is the signal.
          await this.waitForHostedSubmission(run, requestRef);
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
          result = explainResult({
            expected,
            kind: "inji-direct",
            direct: directResult,
            tamper: spec.tamper,
            who: hostedVerifier?.info.label,
          });
        } else if (requestRef?.kind === "ext") {
          const verdict =
            externalAnswer && "verified" in externalAnswer
              ? externalAnswer
              : await externalVerdict(extVerifier!.resultTimeoutSeconds * 1000);
          result = explainResult({
            expected,
            kind: "external",
            who: verifierInfo.label,
            accepted: isTruthyVerdict(verdict.verified),
            detail: verdict.detail,
            tamper: spec.tamper,
          });
        } else if (requestRef?.kind === "inji" && walletAnswer && walletAnswer.status >= 400) {
          // Inji Verify refused the submission itself (e.g. nonce/client_id checks); nothing to poll for.
          const body = walletAnswer.verifierResponse as Record<string, unknown> | string | undefined;
          const code =
            typeof body === "object" && body
              ? String(body.errorCode ?? body.error ?? "SUBMISSION_REJECTED")
              : "SUBMISSION_REJECTED";
          const detail =
            typeof body === "object" && body
              ? String(body.errorMessage ?? body.error_description ?? "")
              : String(body ?? "");
          result = explainResult({
            expected,
            kind: "inji-error",
            errorCode: code,
            errorDetail: detail,
            tamper: spec.tamper,
            walletStatus: walletAnswer.status,
            walletBody: body,
          });
        } else if (requestRef?.kind === "inji") {
          let status = "ACTIVE";
          for (let i = 0; i < 6 && status === "ACTIVE"; i++)
            status = await injiVerify.status(requestRef.requestId, run.id).catch(() => "ACTIVE");
          try {
            const r = await injiVerify.resultV2(requestRef.transactionId, run.id);
            result = explainResult({
              expected,
              kind: "inji-vp",
              vp: r,
              tamper: spec.tamper,
              walletStatus: walletAnswer?.status,
              walletBody: walletAnswer?.verifierResponse,
            });
          } catch (e) {
            const err = e as { code?: string; detail?: string; message: string; body?: unknown };
            result = explainResult({
              expected,
              kind: "inji-error",
              errorCode: err.code ?? "VERIFY_ERROR",
              errorDetail: err.detail ?? err.message,
              tamper: spec.tamper,
              walletStatus: walletAnswer?.status,
              walletBody: walletAnswer?.verifierResponse,
            });
          }
        } else if (requestRef?.kind === "hosted") {
          const who = requestRef.label;
          if (walletAnswer && walletAnswer.status >= 400) {
            const body = walletAnswer.verifierResponse as Record<string, unknown> | string | undefined;
            const code =
              typeof body === "object" && body
                ? String(body.errorCode ?? body.error ?? "SUBMISSION_REJECTED")
                : "SUBMISSION_REJECTED";
            const detail =
              typeof body === "object" && body
                ? String(body.errorMessage ?? body.error_description ?? "")
                : String(body ?? "");
            result = explainResult({
              expected,
              kind: "inji-error",
              errorCode: code,
              errorDetail: detail,
              tamper: spec.tamper,
              walletStatus: walletAnswer.status,
              walletBody: body,
              who,
            });
          } else {
            let status = "ACTIVE";
            for (let i = 0; i < 6 && status === "ACTIVE"; i++)
              status = await requestRef.client.status(requestRef.requestId, run.id).catch(() => "ACTIVE");
            try {
              const r = await requestRef.client.result(requestRef.transactionId, run.id);
              result = explainResult({
                expected,
                kind: "inji-vp",
                vp: r,
                tamper: spec.tamper,
                walletStatus: walletAnswer?.status,
                walletBody: walletAnswer?.verifierResponse,
                who,
              });
            } catch (e) {
              const err = e as { code?: string; message: string };
              result = explainResult({
                expected,
                kind: "inji-error",
                errorCode: err.code ?? "VERIFY_ERROR",
                errorDetail: err.message,
                tamper: spec.tamper,
                walletStatus: walletAnswer?.status,
                walletBody: walletAnswer?.verifierResponse,
                who,
              });
            }
          }
        } else if (requestRef?.kind === "ref") {
          const session = await refVerifier.waitFor(requestRef.id, human ? HUMAN_TIMEOUT_MS : 30_000);
          result = explainResult({ expected, kind: "ref", ref: session.result!, tamper: spec.tamper });
        }
        s.note = result.explanation;
        if (result.verifierOutcome === "REJECTED" && expected === "FAIL")
          s.note = `Rejected as expected. ${result.explanation}`;
      });
      run.result = result;
      run.status = "completed";
    } catch (e) {
      const err = e as RunError & { detail?: string; body?: unknown };
      if (err.code === "incompatible") {
        // A documented version gap, not a crash: the verifier cannot take this query language.
        for (const s of run.steps) if (s.status === "pending") s.status = "skipped";
        run.status = "completed";
        run.result = {
          verdict: "PASS",
          expected: "FAIL",
          verifierOutcome: "REJECTED",
          credentialStatus: "UNKNOWN",
          errorCode: "QUERY_LANGUAGE_UNSUPPORTED",
          errorDetail: err.message,
          explanation: `Expected incompatibility. ${err.message}`,
          checks: [
            {
              name: `Verifier accepts ${spec.query === "dcql" ? "DCQL" : "Presentation Exchange"}`,
              ok: false,
              detail: err.message,
            },
          ],
        };
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
