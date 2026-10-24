import express from "express";
import { credentialClaims } from "../reference/wallet/issuance.js";
import type { ReferenceWallet } from "../reference/wallet/service.js";
import type { ReferenceVerifier } from "../reference/verifier/service.js";
import type { Store } from "../store/types.js";
import { ApiError, h } from "./errors.js";

export function walletApi(store: Store, wallet: ReferenceWallet, refVerifier: ReferenceVerifier) {
  const r = express.Router();
  r.get(
    "/wallet/credentials",
    h(async (_req, res) => void res.json(await store.listHeld())),
  );
  r.get(
    "/wallet/credentials/:id",
    h(async (req, res) => {
      const held = await store.getHeld(req.params.id!);
      if (!held) throw new ApiError(404, "not_found", "No such credential.");
      const raw = held.raw as { credential: unknown };
      res.json({
        ...held,
        raw: undefined,
        credential: raw.credential,
        claims: credentialClaims(held.format, raw.credential),
      });
    }),
  );
  r.delete(
    "/wallet/credentials/:id",
    h(async (req, res) => {
      await store.deleteHeld(req.params.id!);
      res.sendStatus(204);
    }),
  );
  /** Paste any credential offer (ours or another issuer's) into the Reference Wallet. */
  r.post(
    "/wallet/receive",
    h(async (req, res) => {
      const { offerUri, txCode } = req.body ?? {};
      if (typeof offerUri !== "string") throw new ApiError(400, "invalid_offer", "Provide offerUri.");
      const { held } = await wallet.receive(offerUri, { txCode });
      // Never send the stored credential back with its holder's private key.
      const { raw: _raw, ...summary } = held;
      res.status(201).json(summary);
    }),
  );
  /** Answer any OpenID4VP request (Inji Verify's, the Reference Verifier's, or an external verifier's). */
  r.post(
    "/wallet/present",
    h(async (req, res) => {
      const { requestUri, heldId, tamper } = req.body ?? {};
      if (typeof requestUri !== "string") throw new ApiError(400, "invalid_request", "Provide requestUri.");
      const out = await wallet.present(requestUri, { heldId, tamper });
      res.json({
        status: out.status,
        verifierResponse: out.verifierResponse,
        disclosed: out.disclosed,
        withheld: out.withheld,
        matches: out.matches.map((m) => ({
          queryId: m.queryId,
          credentialId: m.credential.id,
          explanation: m.explanation,
        })),
        request: {
          clientId: out.request.clientId,
          transport: out.request.transport,
          signed: out.request.signed,
          language: out.request.dcqlQuery ? "dcql" : "presentation_exchange",
        },
      });
    }),
  );
  r.get(
    "/ref-verifier/sessions/:id",
    h(async (req, res) => {
      const s = refVerifier.get(req.params.id!);
      if (!s) throw new ApiError(404, "not_found", "No such verifier session.");
      res.json(s);
    }),
  );
  return r;
}
