/** Inji Certify 0.14 admin client. Talks to Certify over the internal Docker network only. */
import type { CertifyCredentialConfiguration } from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";
import { call, HttpError } from "../util/http.js";

export interface IssuerMetadata {
  credential_issuer: string;
  credential_endpoint: string;
  authorization_servers?: string[];
  display?: { name: string; locale?: string }[];
  credential_configurations_supported: Record<string, Record<string, unknown>>;
}

export interface DidDocument {
  id: string;
  verificationMethod?: { id: string; type: string; controller?: string; publicKeyMultibase?: string; publicKeyJwk?: Record<string, unknown>; publicKeyPem?: string; "@context"?: unknown }[];
  [k: string]: unknown;
}

export class CertifyClient {
  constructor(
    private readonly base: string,
    private readonly recorder: Recorder,
  ) {}

  private url(p: string) {
    return `${this.base}/v1/certify${p}`;
  }

  async health(): Promise<boolean> {
    try {
      await call(`${this.base}/v1/certify/actuator/health`, { timeoutMs: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  async metadata(): Promise<IssuerMetadata> {
    return (await call<IssuerMetadata>(this.url("/.well-known/openid-credential-issuer"))).body;
  }

  async authServerMetadata(): Promise<Record<string, unknown>> {
    return (await call<Record<string, unknown>>(this.url("/.well-known/oauth-authorization-server"))).body;
  }

  async didDocument(): Promise<DidDocument> {
    return (await call<DidDocument>(this.url("/.well-known/did.json"))).body;
  }

  async getConfiguration(id: string): Promise<Record<string, unknown> | undefined> {
    try {
      return (await call<Record<string, unknown>>(this.url(`/credential-configurations/${encodeURIComponent(id)}`))).body;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 404 || e.status === 400 || e.code === "credential_configuration_not_found" || e.code === "invalid_request")) return undefined;
      throw e;
    }
  }

  async createConfiguration(cfg: CertifyCredentialConfiguration, runId?: string) {
    return (await call(this.url("/credential-configurations"), { json: cfg, record: { recorder: this.recorder, upstream: "studio", runId } })).body;
  }

  async updateConfiguration(cfg: CertifyCredentialConfiguration) {
    return (await call(this.url(`/credential-configurations/${encodeURIComponent(cfg.credentialConfigKeyId)}`), { method: "PUT", json: cfg, record: { recorder: this.recorder, upstream: "studio" } })).body;
  }

  async deleteConfiguration(id: string) {
    return (await call(this.url(`/credential-configurations/${encodeURIComponent(id)}`), { method: "DELETE", record: { recorder: this.recorder, upstream: "studio" } })).body;
  }

  /** Issuer-initiated issuance: push the claims, get back an openid-credential-offer:// URI. */
  async preAuthorize(req: { configId: string; claims: Record<string, unknown>; expiresIn?: number; txCode?: string }, runId?: string | null) {
    const body = await call<{ credential_offer_uri: string }>(this.url("/pre-authorized-data"), {
      json: { credential_configuration_id: req.configId, claims: req.claims, expires_in: req.expiresIn ?? 600, ...(req.txCode ? { tx_code: req.txCode } : {}) },
      record: { recorder: this.recorder, upstream: "studio", runId },
    });
    return body.body.credential_offer_uri;
  }

  /** Revoke through the status-list API (credential id comes from the ledger). */
  async ledgerSearch(credentialType: string) {
    return (await call<unknown[]>(this.url("/ledger-search"), { json: { credentialType, indexedAttributesEquals: {} }, record: { recorder: this.recorder, upstream: "studio" } })).body;
  }

  async updateStatus(credentialId: string, status: boolean, runId?: string | null) {
    return (
      await call(this.url("/credentials/status"), {
        json: { credentialId, credentialStatus: { statusPurpose: "revocation", status } },
        record: { recorder: this.recorder, upstream: "studio", runId },
      })
    ).body;
  }
}
