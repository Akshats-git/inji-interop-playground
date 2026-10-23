/**
 * External parties: loads the parties file (infra/parties.yaml) at start-up, turns it into the registry the
 * run builder shows (built-in wallets and verifiers plus the external ones), and runs the HTTP steps that the
 * file describes. Changing the file takes effect on the next restart; nothing here is hard-coded per vendor.
 */
import { createPrivateKey, X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import type { JWK } from "jose";
import {
  EnvironmentInput,
  ExternalIssuerInput,
  ExternalVerifierInput,
  ExternalWalletInput,
  externalTypeId,
  PartiesFile,
  partiesProblems,
  render,
  select,
  TemplateError,
  VERIFIERS,
  WALLETS,
  type CatalogType,
  type ExternalTypeInput,
  type HttpStep,
  type Party,
  type ProtocolEvent,
  type VerifierInfo,
  type WalletInfo,
} from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";
import { log } from "../log.js";

export class PartyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

/**
 * Values resolved once, when the file is read: `${file:keys/x.pem}` (text), `${json:keys/x.json}` (parsed),
 * `${jwk:keys/x.key.pem}` (a PEM private key as a JWK) and `${env:NAME}`. Paths are relative to the parties
 * file. Everything else stays a run-time placeholder.
 */
export function resolveLoadTime(value: unknown, dir: string, env: NodeJS.ProcessEnv = process.env): unknown {
  const read = (p: string) => readFileSync(isAbsolute(p) ? p : resolve(dir, p), "utf8");
  const one = (kind: string, arg: string): unknown => {
    if (kind === "file") return read(arg);
    if (kind === "json") return JSON.parse(read(arg));
    if (kind === "jwk") return createPrivateKey(read(arg)).export({ format: "jwk" });
    const v = env[arg];
    if (v === undefined) throw new Error(`environment variable ${arg} is not set`);
    return v;
  };
  if (typeof value === "string") {
    const whole = /^\$\{(file|json|jwk|env):([^}]+)\}$/.exec(value);
    if (whole) return one(whole[1]!, whole[2]!.trim());
    return value.replace(/\$\{(file|json|jwk|env):([^}]+)\}/g, (_m, k: string, a: string) => {
      const v = one(k, a.trim());
      return typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveLoadTime(v, dir, env));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveLoadTime(v, dir, env)]));
  return value;
}

export interface LoadedParties {
  file: string | null;
  loadedAt: string;
  data: PartiesFile;
  /** Problems found while reading the file. Entries with problems are left out; the rest still load. */
  errors: string[];
}

const EMPTY: PartiesFile = { version: 1, issuers: [], verifiers: [], wallets: [], environments: [] };

/**
 * Read the parties file. Each issuer, verifier and wallet is checked on its own, so one broken entry (a typo,
 * or a key file that has not been generated yet) is reported and skipped instead of hiding all the others.
 */
export function loadPartiesFile(file: string | undefined, env: NodeJS.ProcessEnv = process.env): LoadedParties {
  const loadedAt = new Date().toISOString();
  if (!file) return { file: null, loadedAt, data: EMPTY, errors: [] };
  if (!existsSync(file)) return { file, loadedAt, data: EMPTY, errors: [`${file} does not exist, so no external parties are configured.`] };
  let raw: Record<string, unknown>;
  try {
    raw = (YAML.parse(readFileSync(file, "utf8")) ?? {}) as Record<string, unknown>;
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("the file must be a mapping with issuers, verifiers and wallets");
  } catch (e) {
    return { file, loadedAt, data: EMPTY, errors: [`${file}: ${(e as Error).message}`] };
  }
  const errors: string[] = [];
  const top = PartiesFile.pick({ version: true }).safeParse({ version: raw.version });
  if (!top.success) errors.push(`version: ${top.error.issues[0]?.message}`);
  const section = <T,>(key: "issuers" | "verifiers" | "wallets" | "environments", schema: z.ZodType<T, z.ZodTypeDef, unknown>): T[] => {
    const list = raw[key] ?? [];
    if (!Array.isArray(list)) {
      errors.push(`${key}: must be a list.`);
      return [];
    }
    const out: T[] = [];
    list.forEach((entry, n) => {
      const name = `${key}[${n}]${entry && typeof entry === "object" && "id" in entry ? ` (${String((entry as { id: unknown }).id)})` : ""}`;
      try {
        const parsed = schema.safeParse(resolveLoadTime(entry, dirname(file), env));
        if (parsed.success) out.push(parsed.data);
        else errors.push(...parsed.error.issues.map((i) => `${name}.${i.path.join(".")}: ${i.message}`));
      } catch (e) {
        errors.push(`${name}: ${(e as Error).message}`);
      }
    });
    return out;
  };
  const data: PartiesFile = {
    version: 1,
    issuers: section("issuers", ExternalIssuerInput),
    verifiers: section("verifiers", ExternalVerifierInput),
    wallets: section("wallets", ExternalWalletInput),
    environments: section("environments", EnvironmentInput),
  };
  return { file, loadedAt, data, errors: [...errors, ...partiesProblems(data)] };
}

/** The built-in wallets, in the shape the registry lists. */
export const BUILTIN_WALLETS: WalletInfo[] = [
  { id: "reference-wallet", label: WALLETS["reference-wallet"].label, origin: "builtin", kind: "headless", interactive: false, supportsTamper: true, supportsDirectShare: true, runnable: true, note: "Automatic, no phone needed.", description: WALLETS["reference-wallet"].note, formats: ["ldp_vc", "vc+sd-jwt"], protocols: ["OpenID4VCI draft 13 (pre-authorized code)", "OpenID4VP draft 23 (PE)", "OpenID4VP 1.0 (DCQL)"] },
  { id: "inji-wallet", label: WALLETS["inji-wallet"].label, origin: "builtin", kind: "mobile", interactive: true, supportsTamper: false, supportsDirectShare: true, runnable: true, note: "Scan with the Inji app. Bundled parties need a public URL; MOSIP Collab's do not.", description: WALLETS["inji-wallet"].note, software: "Inji Wallet 1.0.0-alpha.1 (MOSIP)", homepage: "https://docs.inji.io/inji-wallet/inji-mobile/functional-overview/sandbox-details/inji-setup-guide", install: { android: "https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8", ios: "https://testflight.apple.com/join/7FTAdjLe" }, formats: ["ldp_vc", "vc+sd-jwt", "dc+sd-jwt", "mso_mdoc"], protocols: ["OpenID4VCI (pre-authorized and authorization code)", "OpenID4VP (PE and DCQL)"] },
  { id: "inji-web", label: WALLETS["inji-web"].label, origin: "builtin", kind: "web", interactive: true, supportsTamper: false, supportsDirectShare: true, runnable: false, note: "Wallet-initiated issuance only; not part of runs.", description: WALLETS["inji-web"].note, software: "Inji Web 1.0.0-alpha.1 + Mimoto on MOSIP Collab", homepage: "https://docs.inji.io/inji-wallet/inji-web/overview", install: { web: "https://injiweb.collab.mosip.net/" }, formats: ["ldp_vc", "vc+sd-jwt", "dc+sd-jwt"], protocols: ["OpenID4VCI (authorization code)", "OpenID4VP"] },
  { id: "external-wallet", label: WALLETS["external-wallet"].label, origin: "builtin", kind: "mobile", interactive: true, supportsTamper: false, supportsDirectShare: false, runnable: true, note: "Any OpenID4VCI wallet that scans offers.", description: WALLETS["external-wallet"].note, protocols: ["OpenID4VCI", "OpenID4VP"] },
];

export const BUILTIN_VERIFIERS: VerifierInfo[] = [
  { id: "inji-verify", label: VERIFIERS["inji-verify"].label, origin: "builtin", accepts: ["presentation_exchange"], ownQuery: false, formats: ["ldp_vc", "vc+sd-jwt"], note: VERIFIERS["inji-verify"].note, software: "Inji Verify service 0.18.2 (MOSIP)", supportsDirectShare: true },
  { id: "reference-verifier", label: VERIFIERS["reference-verifier"].label, origin: "builtin", accepts: ["presentation_exchange", "dcql"], ownQuery: false, formats: ["ldp_vc", "vc+sd-jwt"], note: VERIFIERS["reference-verifier"].note, supportsDirectShare: false },
];

export interface StepRecording {
  recorder?: Recorder;
  runId?: string | null;
  from: Party;
  to: Party;
  phase: ProtocolEvent["phase"];
}

export interface Health {
  ok: boolean;
  detail: string;
}

export class PartiesService {
  private jwksCache = new Map<string, { at: number; keys: JWK[] }>();

  constructor(readonly loaded: LoadedParties) {
    if (loaded.errors.length) log.warn({ file: loaded.file, errors: loaded.errors }, "parties file has problems");
    else if (loaded.file) log.info({ file: loaded.file, issuers: loaded.data.issuers.length, verifiers: loaded.data.verifiers.length, wallets: loaded.data.wallets.length }, "external parties loaded");
  }

  static fromFile(file: string | undefined) {
    return new PartiesService(loadPartiesFile(file));
  }

  get issuers() {
    return this.loaded.data.issuers;
  }

  /** Hosted Inji deployments (e.g. MOSIP Collab); the HostedService discovers their issuers. */
  get environments() {
    return this.loaded.data.environments;
  }

  // --- registry ----------------------------------------------------------------------------------------------

  catalog(): CatalogType[] {
    return this.issuers.flatMap((i) => i.types.map((t) => toCatalog(i, t)));
  }

  findType(id: string): { issuer: ExternalIssuerInput; type: ExternalTypeInput; catalog: CatalogType } | undefined {
    for (const i of this.issuers) for (const t of i.types) if (externalTypeId(i.id, t.id) === id) return { issuer: i, type: t, catalog: toCatalog(i, t) };
    return undefined;
  }

  wallets(): WalletInfo[] {
    return [...BUILTIN_WALLETS, ...this.loaded.data.wallets.map(toWalletInfo)];
  }

  verifiers(): VerifierInfo[] {
    return [...BUILTIN_VERIFIERS, ...this.loaded.data.verifiers.map(toVerifierInfo)];
  }

  wallet(id: string) {
    return this.wallets().find((w) => w.id === id);
  }
  verifier(id: string) {
    return this.verifiers().find((v) => v.id === id);
  }
  externalWallet(id: string): ExternalWalletInput | undefined {
    return this.loaded.data.wallets.find((w) => w.id === id);
  }
  externalVerifier(id: string): ExternalVerifierInput | undefined {
    return this.loaded.data.verifiers.find((v) => v.id === id);
  }

  /** Public keys the Reference Verifier trusts for external issuers' SD-JWTs (certificates, inline JWKs, JWKS URLs). */
  async trustedJwks(): Promise<JWK[]> {
    const out: JWK[] = [];
    for (const i of this.issuers) {
      for (const pem of i.trust.certificates) {
        try {
          out.push({ ...(new X509Certificate(pem).publicKey.export({ format: "jwk" }) as JWK), kid: `${i.id}#cert` });
        } catch (e) {
          log.warn({ issuer: i.id, err: (e as Error).message }, "trusted certificate could not be read");
        }
      }
      out.push(...(i.trust.jwks as JWK[]));
      if (i.trust.jwksUri) {
        const cached = this.jwksCache.get(i.trust.jwksUri);
        if (cached && Date.now() - cached.at < 60_000) out.push(...cached.keys);
        else {
          try {
            const res = await fetch(i.trust.jwksUri, { signal: AbortSignal.timeout(5000) });
            const keys = ((await res.json()) as { keys?: JWK[] }).keys ?? [];
            this.jwksCache.set(i.trust.jwksUri, { at: Date.now(), keys });
            out.push(...keys);
          } catch (e) {
            log.warn({ issuer: i.id, err: (e as Error).message }, "issuer JWKS unavailable");
          }
        }
      }
    }
    return out;
  }

  /** Can the playground reach each external party? Any HTTP answer counts; only a network failure does not. */
  async health(): Promise<Record<string, Health>> {
    const probe = async (url: string): Promise<Health> => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return { ok: true, detail: `HTTP ${res.status} from ${new URL(url).host}` };
      } catch (e) {
        const cause = (e as { cause?: { code?: string } }).cause?.code;
        return { ok: false, detail: `${new URL(url).host} is not reachable (${cause ?? (e as Error).name}).` };
      }
    };
    const checks: [string, string][] = [
      ...this.issuers.map((i) => [`issuer:${i.id}`, `${i.credentialIssuer.replace(/\/+$/, "")}/.well-known/openid-credential-issuer`] as [string, string]),
      ...this.loaded.data.verifiers.map((v) => [`verifier:${v.id}`, originOf(v.request[0]!.url)] as [string, string]),
      ...this.loaded.data.wallets.filter((w) => w.automation).map((w) => [`wallet:${w.id}`, originOf(w.automation!.receive[0]!.url)] as [string, string]),
    ];
    const results = await Promise.all(checks.map(async ([k, url]) => [k, url ? await probe(url) : { ok: false, detail: "No URL to check." }] as const));
    return Object.fromEntries(results);
  }

  // --- steps -------------------------------------------------------------------------------------------------

  /**
   * Run HTTP steps in order. Each step's `save` values join the context for the next step and are returned.
   * Every exchange is recorded, so external parties show up in the inspector next to Inji's own messages.
   */
  async runSteps(steps: HttpStep[], context: Record<string, unknown>, rec: StepRecording): Promise<Record<string, unknown>> {
    const ctx: Record<string, unknown> = { ...context };
    const saved: Record<string, unknown> = {};
    for (const step of steps) {
      let url: string, headers: Record<string, string>, body: unknown;
      try {
        url = String(render(step.url, ctx));
        headers = render(step.headers, ctx) as Record<string, string>;
        body = step.body === undefined ? undefined : render(step.body, ctx);
      } catch (e) {
        if (e instanceof TemplateError) throw new PartyError("config_error", `${step.title ?? step.url}: ${e.message} Check the parties file.`);
        throw e;
      }
      const bodyType = step.bodyType ?? (typeof body === "string" ? "text" : "json");
      let payload: string | undefined;
      if (body !== undefined) {
        if (bodyType === "json") {
          payload = JSON.stringify(body);
          headers["content-type"] ??= "application/json";
        } else if (bodyType === "form") {
          const fields = Object.entries(body as Record<string, unknown>).map(([k, v]): [string, string] => [k, typeof v === "string" ? v : JSON.stringify(v)]);
          payload = new URLSearchParams(fields).toString();
          headers["content-type"] ??= "application/x-www-form-urlencoded";
        } else {
          payload = String(body);
          headers["content-type"] ??= "text/plain";
        }
      }
      headers.accept ??= "application/json, text/plain, */*";
      const started = Date.now();
      const at = new Date().toISOString();
      let res: Response;
      try {
        res = await fetch(url, { method: step.method, headers, body: payload, signal: AbortSignal.timeout(30_000) });
      } catch (e) {
        const cause = (e as { cause?: { code?: string } }).cause?.code;
        throw new PartyError("unreachable", `${step.title ?? url}: ${new URL(url).host} is not reachable (${cause ?? (e as Error).message}). Is it running?`);
      }
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        /* text */
      }
      const resHeaders = Object.fromEntries(res.headers);
      await rec.recorder?.recordInternal({
        upstream: "external",
        method: step.method,
        path: url,
        requestBody: body,
        responseBody: parsed,
        responseText: parsed === undefined ? text : undefined,
        status: res.status,
        durationMs: Date.now() - started,
        at,
        runId: rec.runId ?? null,
        requestHeaders: headers,
        responseHeaders: resHeaders,
        // A status the parties file allows (e.g. 409 "account exists") is not a failure, so say so on the event.
        external: { title: step.title, phase: rec.phase, from: rec.from, to: rec.to, labels: ["parties file step", ...(res.status >= 400 && step.okStatus.includes(res.status) ? [`HTTP ${res.status} expected here`] : [])] },
      });
      if (!step.okStatus.includes(res.status)) throw new PartyError("step_failed", `${step.title ?? url} answered HTTP ${res.status}.`, parsed ?? text.slice(0, 2000));
      for (const [k, sel] of Object.entries(step.save)) {
        const v = select(sel, { body: parsed ?? text, text, headers: resHeaders });
        if (v === undefined) throw new PartyError("step_failed", `${step.title ?? url}: the response has nothing at ${sel} (wanted for "${k}").`, parsed ?? text.slice(0, 2000));
        ctx[k] = saved[k] = typeof v === "string" ? v.trim() : v;
      }
    }
    return saved;
  }
}

const originOf = (url: string) => {
  try {
    return new URL(url).origin;
  } catch {
    return ""; // a placeholder in the host; nothing to probe
  }
};

function toCatalog(i: ExternalIssuerInput, t: ExternalTypeInput): CatalogType {
  return {
    id: externalTypeId(i.id, t.id),
    origin: "external",
    issuerId: i.id,
    issuerName: i.name,
    displayName: t.name,
    description: t.description,
    format: t.format,
    dataModel: t.dataModel,
    typeName: t.typeName,
    vct: t.vct,
    proof: t.proof ?? (t.format === "vc+sd-jwt" ? "SD-JWT (issuer's choice)" : "issuer's choice"),
    fields: t.claims.map((c) => ({ name: c.name, label: c.label ?? c.name, kind: c.kind, options: c.options, sample: c.sample, selectivelyDisclosable: c.selectivelyDisclosable })),
    canIssue: Boolean(t.offer ?? i.offer),
    offerPage: i.offerPage,
    configurationId: t.configurationId,
  };
}

function toWalletInfo(w: ExternalWalletInput): WalletInfo {
  const automated = Boolean(w.automation);
  return {
    id: w.id,
    label: w.name,
    origin: "external",
    kind: w.kind,
    interactive: !automated,
    supportsTamper: false,
    // A person can show a credential's QR code from a phone; an API-driven wallet keeps its credentials to itself.
    supportsDirectShare: !automated,
    runnable: true,
    note: automated ? "Driven through its API by the playground." : w.kind === "mobile" ? "Scan the QR codes with this app." : "Open the links in this wallet.",
    description: w.description || w.notes,
    software: w.software,
    homepage: w.homepage,
    install: w.install,
    formats: w.formats,
    protocols: w.protocols,
  };
}

function toVerifierInfo(v: ExternalVerifierInput): VerifierInfo {
  return { id: v.id, label: v.name, origin: "external", accepts: [], ownQuery: true, formats: v.formats, note: v.description || "Writes its own presentation request.", description: v.description, software: v.software, homepage: v.homepage, supportsDirectShare: false };
}
