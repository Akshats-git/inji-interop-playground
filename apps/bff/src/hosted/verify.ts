/**
 * A hosted Inji Verify of the 1.0 line (MOSIP Collab runs 1.0.0-alpha.1), driven through its v2 API: DCQL
 * requests at /v2/vp-request, signed request objects by request_uri, results at /v2/vp-results. Every call is
 * recorded, so the inspector shows the hosted verifier exactly like the bundled one.
 */
import { randomBytes } from "node:crypto";
import type { DcqlQuery, PresentationDefinition } from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";
import type { VerifyResultV2 } from "../inji/verify.js";
import { recordedFetch } from "../util/recorded.js";

export interface HostedVerifyRequest {
  transactionId: string;
  requestId: string;
  requestUri?: string;
  authorizationDetails?: { clientId: string; nonce: string; responseUri: string; responseMode: string; responseType: string; dcqlQuery?: DcqlQuery; presentationDefinition?: PresentationDefinition };
  expiresAt?: number;
  nonce: string;
}

export class HostedVerifyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export class HostedVerifyClient {
  constructor(
    /** Base of the API, ending in /v1/verify. */
    readonly base: string,
    private readonly recorder?: Recorder,
  ) {}

  private url(p: string) {
    return `${this.base.replace(/\/+$/, "")}${p}`;
  }

  /** Without a title, the recorder names the step from the path and the answer ("Status: VP_SUBMITTED"…). */
  private rec(title: string | undefined, labels: string[], phase: "presentation" | "verification" = "presentation") {
    return { title, phase, from: "verifier-backend" as const, to: "hosted-verify" as const, labels: ["hosted Inji Verify", ...labels] };
  }

  private fail(r: { status: number; body: unknown }, what: string): never {
    const b = (r.body ?? {}) as Record<string, unknown>;
    const code = String(b.errorCode ?? b.error ?? `HTTP_${r.status}`);
    const detail = String(b.errorMessage ?? b.error_description ?? "");
    throw new HostedVerifyError(r.status, code, `${what}: HTTP ${r.status} ${code}${detail ? ` (${detail})` : ""}.`, r.body);
  }

  /**
   * Ask for a presentation. With a DCQL query this is the 1.0 request; a Presentation Exchange definition is sent
   * only to record how a DCQL-only verifier answers it.
   */
  async createRequest(o: { clientId: string; dcqlQuery?: DcqlQuery; presentationDefinition?: PresentationDefinition; runId?: string | null }): Promise<HostedVerifyRequest> {
    // Inji Verify 1.0 wants a nonce of at least 16 URL-safe characters.
    const nonce = randomBytes(18).toString("base64url");
    const json = { clientId: o.clientId, nonce, ...(o.dcqlQuery ? { dcqlQuery: o.dcqlQuery } : {}), ...(o.presentationDefinition ? { presentationDefinition: o.presentationDefinition } : {}) };
    const r = await recordedFetch(this.recorder, {
      url: this.url("/v2/vp-request"),
      json,
      runId: o.runId,
      record: this.rec("Create authorization request", ["OpenID4VP 1.0", o.dcqlQuery ? "dcql" : "presentation_exchange", o.clientId.includes("did:") ? "request_uri (signed request)" : "request by value"]),
    });
    if (r.status >= 300) this.fail(r, "The hosted Inji Verify refused the request");
    return { ...(r.body as Omit<HostedVerifyRequest, "nonce">), nonce };
  }

  /** The wallet-facing URI, as Inji Verify's own UI builds its QR code (client_id plus request_uri). */
  authorizationUri(req: HostedVerifyRequest, clientId: string): string {
    const params = new URLSearchParams({ client_id: clientId });
    if (req.requestUri) params.set("request_uri", req.requestUri);
    else if (req.authorizationDetails) {
      const a = req.authorizationDetails;
      params.set("state", req.requestId);
      params.set("response_mode", a.responseMode);
      params.set("response_type", a.responseType);
      params.set("nonce", a.nonce);
      params.set("response_uri", a.responseUri);
      if (a.dcqlQuery) params.set("dcql_query", JSON.stringify(a.dcqlQuery));
    }
    return `openid4vp://authorize?${params.toString()}`;
  }

  async status(requestId: string, runId?: string | null): Promise<string> {
    const r = await recordedFetch(this.recorder, { url: this.url(`/vp-request/${requestId}/status`), runId, timeoutMs: 40_000, record: this.rec(undefined, ["long polling"]) });
    if (r.status >= 300) this.fail(r, "Status check failed");
    return String((r.body as { status?: string }).status ?? "UNKNOWN");
  }

  async result(transactionId: string, runId?: string | null): Promise<VerifyResultV2> {
    const r = await recordedFetch(this.recorder, { url: this.url(`/v2/vp-results/${transactionId}`), json: { skipStatusChecks: false, includeClaims: false }, runId, record: this.rec(undefined, [], "verification") });
    if (r.status >= 300) this.fail(r, "The hosted Inji Verify gave no result");
    return r.body as VerifyResultV2;
  }

  /** Direct share: one credential, no OpenID4VP. */
  async verifyCredential(credential: string, runId?: string | null): Promise<VerifyResultV2["credentialResults"][number]> {
    const r = await recordedFetch(this.recorder, { url: this.url("/v2/vc-verification"), json: { verifiableCredential: credential }, runId, record: this.rec(undefined, ["direct share", "no OpenID4VP"], "verification") });
    if (r.status >= 300) this.fail(r, "The hosted Inji Verify could not check the credential");
    return r.body as VerifyResultV2["credentialResults"][number];
  }

  async reachable(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await fetch(this.url("/did.json"), { signal: AbortSignal.timeout(5000) });
      return { ok: true, detail: `HTTP ${res.status} from ${new URL(this.base).host}` };
    } catch (e) {
      return { ok: false, detail: `${new URL(this.base).host} is not reachable (${(e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name}).` };
    }
  }
}
