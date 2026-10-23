/**
 * Reference Verifier: an OpenID4VP relying party inside the playground. It speaks Presentation Exchange
 * (draft 23 style: client_id_scheme=redirect_uri, or a did: client with a signed request object) and DCQL
 * (OpenID4VP 1.0 style: redirect_uri: client id prefix), and verifies with its own trust policy.
 */
import { randomBytes } from "node:crypto";
import express from "express";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { toDcql, toPresentationDefinition, validateDcql, type DcqlPathStyle, type DcqlQuery, type PresentationDefinition, type QuerySpec } from "@playground/core";
import type { Recorder } from "../../gateway/recorder.js";
import { parseBody } from "../../gateway/recorder.js";
import { log } from "../../log.js";
import { verifyLdpPresentation, verifySdJwtPresentation, type Check, type CredentialVerdict, type VerifierContext } from "./checks.js";

export interface VerifierSession {
  id: string;
  createdAt: number;
  runId?: string | null;
  language: "presentation_exchange" | "dcql";
  presentationDefinition?: PresentationDefinition;
  dcqlQuery?: DcqlQuery;
  nonce: string;
  clientId: string;
  responseUri: string;
  requestUri?: string;
  uri: string;
  requireHolderBinding: boolean;
  status: "pending" | "submitted" | "verified";
  result?: VerifierResult;
}

export interface VerifierResult {
  accepted: boolean;
  checks: Check[];
  credentials: CredentialVerdict[];
  errorCode?: string;
  errorDetail?: string;
}

const PREFIX = "/pub/ref-verifier";

export class ReferenceVerifier {
  private sessions = new Map<string, VerifierSession>();
  private waiters = new Map<string, ((s: VerifierSession) => void)[]>();
  private key?: { privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]; jwk: JWK };

  constructor(
    private readonly publicBaseUrl: () => string,
    private readonly ctx: VerifierContext,
    private readonly recorder: Recorder,
  ) {}

  private async signingKey() {
    if (!this.key) {
      const { privateKey, publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
      this.key = { privateKey, jwk: { ...(await exportJWK(publicKey)), kid: "key-0", alg: "EdDSA" } };
    }
    return this.key;
  }

  did() {
    const u = new URL(this.publicBaseUrl());
    return `did:web:${encodeURIComponent(u.host)}${u.pathname.replace(/\/$/, "").split("/").join(":")}:pub:ref-verifier`;
  }

  /** Build a request in the chosen query language. `signed` uses a did: client id and request_uri. */
  async createRequest(spec: QuerySpec, opts: { language: "presentation_exchange" | "dcql"; signed?: boolean; runId?: string | null; peDialect?: "inji" | "spec"; pathStyle?: DcqlPathStyle }) {
    const id = randomBytes(9).toString("base64url");
    const base = this.publicBaseUrl();
    const responseUri = `${base}${PREFIX}/response/${id}`;
    const nonce = randomBytes(16).toString("base64url");
    const dcql = opts.language === "dcql" ? toDcql(spec, { format: "dc+sd-jwt", typeIri: spec.typeIri, pathStyle: opts.pathStyle }) : undefined;
    if (dcql) {
      const errs = validateDcql(dcql);
      if (errs.length) throw Object.assign(new Error(errs.map((e) => e.message).join(" ")), { code: errs[0]!.code });
    }
    const pd = opts.language === "presentation_exchange" ? toPresentationDefinition(spec, opts.peDialect ?? "inji") : undefined;
    const clientId = opts.signed ? this.did() : opts.language === "dcql" ? `redirect_uri:${responseUri}` : responseUri;
    const session: VerifierSession = {
      id,
      createdAt: Date.now(),
      runId: opts.runId,
      language: opts.language,
      presentationDefinition: pd,
      dcqlQuery: dcql,
      nonce,
      clientId,
      responseUri,
      requireHolderBinding: spec.requireHolderBinding,
      status: "pending",
      uri: "",
    };
    const params = new URLSearchParams({ client_id: clientId });
    if (opts.signed) {
      session.requestUri = `${base}${PREFIX}/requests/${id}`;
      params.set("request_uri", session.requestUri);
    } else {
      for (const [k, v] of Object.entries(this.requestParams(session))) params.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    session.uri = `openid4vp://authorize?${params.toString()}`;
    this.sessions.set(id, session);
    if (opts.runId) this.recorder.bind(opts.runId, id, nonce);
    this.gc();
    return session;
  }

  private requestParams(s: VerifierSession): Record<string, unknown> {
    return {
      response_type: "vp_token",
      response_mode: "direct_post",
      response_uri: s.responseUri,
      nonce: s.nonce,
      state: s.id,
      ...(s.language === "presentation_exchange" && !s.clientId.startsWith("did:") ? { client_id_scheme: "redirect_uri" } : {}),
      ...(s.presentationDefinition ? { presentation_definition: s.presentationDefinition } : {}),
      ...(s.dcqlQuery ? { dcql_query: s.dcqlQuery } : {}),
      client_metadata: {
        client_name: "Inji Playground Reference Verifier",
        vp_formats: { ldp_vp: { proof_type: ["Ed25519Signature2020"] }, "vc+sd-jwt": { "sd-jwt_alg_values": ["ES256", "EdDSA"], "kb-jwt_alg_values": ["ES256", "EdDSA"] }, "dc+sd-jwt": { "sd-jwt_alg_values": ["ES256", "EdDSA"], "kb-jwt_alg_values": ["ES256", "EdDSA"] } },
      },
    };
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  waitFor(id: string, timeoutMs: number): Promise<VerifierSession> {
    const s = this.sessions.get(id);
    if (!s) return Promise.reject(new Error("unknown session"));
    if (s.status === "verified") return Promise.resolve(s);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error("No presentation arrived in time."), { code: "timeout" })), timeoutMs);
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), (x) => (clearTimeout(t), resolve(x))]);
    });
  }

  private gc() {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, s] of this.sessions) if (s.createdAt < cutoff) this.sessions.delete(id);
  }

  async verifySubmission(s: VerifierSession, form: Record<string, unknown>): Promise<VerifierResult> {
    if (form.error) return { accepted: false, checks: [{ name: "Wallet answered", ok: false, detail: `${String(form.error)}: ${String(form.error_description ?? "")}` }], credentials: [], errorCode: String(form.error), errorDetail: String(form.error_description ?? "") };
    if (form.state !== undefined && form.state !== s.id) return { accepted: false, checks: [{ name: "State matches", ok: false }], credentials: [], errorCode: "invalid_state" };
    const raw = form.vp_token;
    let tokens: { queryId: string; token: unknown }[] = [];
    try {
      const parsed = typeof raw === "string" && /^[[{]/.test(raw.trim()) ? JSON.parse(raw) : raw;
      if (s.language === "dcql") {
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("A DCQL response's vp_token must be a JSON object keyed by credential query id.");
        tokens = Object.entries(parsed as Record<string, unknown>).flatMap(([queryId, v]) => (Array.isArray(v) ? v : [v]).map((token) => ({ queryId, token })));
      } else {
        const list = Array.isArray(parsed) ? parsed : [parsed];
        tokens = list.map((token, i) => ({ queryId: String(((form.presentation_submission as Record<string, unknown>)?.descriptor_map as Record<string, unknown>[])?.[i]?.id ?? i), token }));
      }
    } catch (e) {
      return { accepted: false, checks: [{ name: "vp_token parses", ok: false, detail: (e as Error).message }], credentials: [], errorCode: "invalid_vp_token" };
    }
    const checks: Check[] = [];
    const credentials: CredentialVerdict[] = [];
    if (s.language === "presentation_exchange") checks.push({ name: "presentation_submission present", ok: Boolean(form.presentation_submission) });
    const expectedIds = s.dcqlQuery ? s.dcqlQuery.credentials.map((c) => c.id) : s.presentationDefinition!.input_descriptors.map((d) => d.id);
    checks.push({ name: "Every requested credential answered", ok: expectedIds.every((id) => tokens.some((t) => t.queryId === id)), detail: `asked for ${expectedIds.join(", ")}; answered ${tokens.map((t) => t.queryId).join(", ") || "nothing"}${s.language === "presentation_exchange" ? " (descriptor_map ids must be input descriptor ids)" : ""}` });
    for (const t of tokens) {
      if (typeof t.token === "string" && t.token.includes("~")) {
        credentials.push(await verifySdJwtPresentation(this.ctx, t.token, { nonce: s.nonce, aud: s.clientId, requireHolderBinding: s.requireHolderBinding }));
      } else if (t.token && typeof t.token === "object") {
        const r = await verifyLdpPresentation(this.ctx, t.token as Record<string, unknown>, { challenge: s.nonce, domain: s.clientId, requireHolderBinding: s.requireHolderBinding });
        checks.push(...r.checks);
        credentials.push(...r.credentials);
      } else checks.push({ name: "Supported presentation format", ok: false, detail: "Expected an ldp_vp object or an SD-JWT presentation." });
    }
    const accepted = checks.every((c) => c.ok) && credentials.length > 0 && credentials.every((c) => c.ok);
    const firstFail = [...checks, ...credentials.flatMap((c) => c.checks)].find((c) => !c.ok);
    return { accepted, checks, credentials, errorCode: accepted ? undefined : firstFail?.name, errorDetail: firstFail?.detail };
  }

  router() {
    const r = express.Router();
    const record = async (req: express.Request, path: string, status: number, requestBody: unknown, responseBody: unknown, responseText?: string, runId?: string | null) =>
      this.recorder.record({ upstream: "reference-verifier", method: req.method, path, status, durationMs: 0, requestHeaders: req.headers, responseHeaders: {}, requestBody, responseBody, responseText, runId });

    r.get(`${PREFIX}/did.json`, async (_req, res) => {
      const { jwk } = await this.signingKey();
      const did = this.did();
      res.json({ "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"], id: did, verificationMethod: [{ id: `${did}#key-0`, type: "JsonWebKey2020", controller: did, publicKeyJwk: jwk }], authentication: [`${did}#key-0`], assertionMethod: [`${did}#key-0`] });
    });

    r.get(`${PREFIX}/requests/:id`, async (req, res) => {
      const s = this.sessions.get(req.params.id);
      if (!s) return void res.status(404).json({ error: "invalid_request_uri" });
      const { privateKey } = await this.signingKey();
      const jwt = await new SignJWT({ client_id: s.clientId, client_id_scheme: "did", ...this.requestParams(s), iss: s.clientId, aud: "https://self-issued.me/v2" })
        .setProtectedHeader({ alg: "EdDSA", typ: "oauth-authz-req+jwt", kid: `${s.clientId}#key-0` })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey);
      res.type("application/oauth-authz-req+jwt").send(jwt);
      void record(req, req.path, 200, undefined, undefined, jwt, s.runId);
    });

    r.post(`${PREFIX}/response/:id`, express.raw({ type: () => true, limit: "4mb" }), async (req, res) => {
      const s = this.sessions.get(req.params.id);
      const { body } = parseBody(req.headers["content-type"], req.body as Buffer);
      const form = (body ?? {}) as Record<string, unknown>;
      if (!s) {
        res.status(400).json({ error: "invalid_request", error_description: "Unknown or expired request." });
        return;
      }
      if (s.status !== "pending") {
        res.status(400).json({ error: "invalid_request", error_description: "This request was already answered." });
        void record(req, req.path, 400, form, { error: "invalid_request" }, undefined, s.runId);
        return;
      }
      s.status = "submitted";
      let result: VerifierResult;
      try {
        result = await this.verifySubmission(s, form);
      } catch (e) {
        log.warn({ err: e }, "reference verifier failed");
        result = { accepted: false, checks: [{ name: "Verification completed", ok: false, detail: (e as Error).message }], credentials: [], errorCode: "verification_error", errorDetail: (e as Error).message };
      }
      s.result = result;
      s.status = "verified";
      const response = {};
      res.json(response);
      await record(req, req.path, 200, form, { accepted: result.accepted, errorCode: result.errorCode }, undefined, s.runId);
      for (const w of this.waiters.get(s.id) ?? []) w(s);
      this.waiters.delete(s.id);
    });
    return r;
  }
}
