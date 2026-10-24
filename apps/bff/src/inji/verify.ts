/**
 * Inji Verify 0.18.2 as a relying party driven by the BFF (for automated runs). The browser path uses the
 * official React SDK instead; both go through the recording gateway.
 */
import { randomBytes } from "node:crypto";
import type { PresentationDefinition } from "@playground/core";
import { call } from "../util/http.js";

export interface VerifyRequest {
  transactionId: string;
  requestId: string;
  requestUri?: string;
  authorizationDetails?: {
    clientId: string;
    presentationDefinition: PresentationDefinition;
    nonce: string;
    responseUri: string;
    responseType: string;
    responseMode: string;
  };
  expiresAt: number;
}

/** v2 result: one entry per credential with the individual checks. */
export interface VerifyResultV2 {
  transactionId: string;
  allChecksSuccessful: boolean;
  credentialResults: {
    verifiableCredential: string;
    allChecksSuccessful: boolean;
    schemaAndSignatureCheck?: { valid: boolean; error?: { errorCode: string; errorMessage: string } | null };
    expiryCheck?: { valid: boolean } | null;
    statusCheck?: {
      purpose?: string;
      valid: boolean;
      error?: { errorCode: string; errorMessage: string } | null;
    }[];
    holderProofCheck?: { valid: boolean; error?: { errorCode: string; errorMessage: string } | null } | null;
  }[];
}

export class InjiVerifyClient {
  /** `gatewayBase` = <self>/pub/verify/v1/verify, so the BFF's own calls are recorded too. */
  constructor(
    private readonly gatewayBase: string,
    private readonly publicBase: string,
  ) {}

  private headers(runId?: string | null) {
    return { "x-playground-actor": "verifier-backend", ...(runId ? { "x-playground-run": runId } : {}) };
  }

  async createRequest(opts: {
    clientId: string;
    presentationDefinition: PresentationDefinition;
    acceptVPWithoutHolderProof?: boolean;
    runId?: string | null;
  }) {
    const nonce = randomBytes(16).toString("base64url");
    const res = await call<VerifyRequest>(`${this.gatewayBase}/vp-request`, {
      json: {
        clientId: opts.clientId,
        nonce,
        presentationDefinition: opts.presentationDefinition,
        acceptVPWithoutHolderProof: opts.acceptVPWithoutHolderProof ?? false,
      },
      headers: this.headers(opts.runId),
    });
    return { ...res.body, nonce };
  }

  /** Send a DCQL query the way Inji Verify 1.0 expects it (`dcqlQuery`), to see how a 0.x service reacts. */
  async createDcqlRequest(opts: { clientId: string; dcqlQuery: unknown; runId?: string | null }) {
    const nonce = randomBytes(16).toString("base64url");
    const res = await call<VerifyRequest>(`${this.gatewayBase}/vp-request`, {
      json: { clientId: opts.clientId, nonce, dcqlQuery: opts.dcqlQuery },
      headers: this.headers(opts.runId),
    });
    return { ...res.body, nonce };
  }

  /** The wallet-facing URI, built the way the Inji Verify SDK builds its QR code. */
  authorizationUri(req: VerifyRequest, clientId: string) {
    const params = new URLSearchParams({ client_id: clientId });
    if (req.requestUri)
      params.set(
        "request_uri",
        req.requestUri.replace(this.gatewayBase, `${this.publicBase}/pub/verify/v1/verify`),
      );
    else if (req.authorizationDetails) {
      const a = req.authorizationDetails;
      params.set("state", req.requestId);
      params.set("response_mode", a.responseMode);
      params.set("response_type", a.responseType);
      params.set("nonce", a.nonce);
      params.set("response_uri", a.responseUri);
      params.set("presentation_definition", JSON.stringify(a.presentationDefinition));
      params.set(
        "client_metadata",
        JSON.stringify({
          client_name: clientId,
          vp_formats: {
            ldp_vp: { proof_type: ["Ed25519Signature2018", "Ed25519Signature2020", "RsaSignature2018"] },
            "vc+sd-jwt": {
              "sd-jwt_alg_values": ["RS256", "ES256", "ES256K", "EdDSA"],
              "kb-jwt_alg_values": ["RS256", "ES256", "ES256K", "EdDSA"],
            },
          },
        }),
      );
    }
    return `openid4vp://authorize?${params.toString()}`;
  }

  async status(requestId: string, runId?: string | null): Promise<string> {
    const res = await call<{ status: string }>(`${this.gatewayBase}/vp-request/${requestId}/status`, {
      headers: this.headers(runId),
      timeoutMs: 30_000,
    });
    return res.body.status;
  }

  async resultV2(transactionId: string, runId?: string | null): Promise<VerifyResultV2> {
    return (
      await call<VerifyResultV2>(`${this.gatewayBase}/v2/vp-results/${transactionId}`, {
        method: "POST",
        json: { skipStatusChecks: false, includeClaims: false },
        headers: this.headers(runId),
      })
    ).body;
  }

  async verifyCredential(credential: string, runId?: string | null) {
    return (
      await call<VerifyResultV2["credentialResults"][number]>(`${this.gatewayBase}/v2/vc-verification`, {
        json: { verifiableCredential: credential },
        headers: this.headers(runId),
      })
    ).body;
  }
}
