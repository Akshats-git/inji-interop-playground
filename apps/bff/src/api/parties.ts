import express from "express";
import { catalogFromStudio, externalTypeId, type CatalogType } from "@playground/core";
import type { Recorder } from "../gateway/recorder.js";
import type { HostedService } from "../hosted/service.js";
import type { PartiesService } from "../parties/service.js";
import type { Orchestrator } from "../runs/orchestrator.js";
import type { Store } from "../store/types.js";
import { ApiError, h } from "./errors.js";

/**
 * The parties registry, as the UI reads it. Step definitions are left out on purpose: their bodies can hold
 * an external issuer's signing key or a wallet password from the parties file.
 */
export function partiesApi(
  parties: PartiesService,
  store: Store,
  orchestrator: Orchestrator,
  recorder: Recorder,
  hosted: HostedService,
) {
  const r = express.Router();

  r.get(
    "/parties",
    h(async (_req, res) => {
      const { file, loadedAt, errors, data } = parties.loaded;
      const [partyHealth, hostedHealth] = await Promise.all([parties.health(), hosted.health()]);
      res.json({
        file,
        loadedAt,
        errors,
        health: { ...partyHealth, ...hostedHealth },
        issuers: data.issuers.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          software: i.software,
          homepage: i.homepage,
          credentialIssuer: i.credentialIssuer,
          offerPage: i.offerPage,
          trust: {
            certificates: i.trust.certificates.length,
            jwks: i.trust.jwks.length,
            jwksUri: i.trust.jwksUri,
          },
          types: parties.catalog().filter((t) => t.issuerId === i.id),
        })),
        verifiers: [...parties.verifiers(), ...hosted.verifiers()],
        wallets: parties
          .wallets()
          .map((w) => ({ ...w, automated: w.origin === "external" && !w.interactive })),
        environments: hosted.summary(),
      });
    }),
  );

  /** Every credential type a run can use: Studio types (the bundled Certify), external ones, and hosted Inji issuers' types. */
  r.get(
    "/catalog",
    h(async (_req, res) => {
      const issuers = new Map((await store.listIssuers()).map((i) => [i.slug, i.name]));
      const studio: CatalogType[] = (await store.listTypes()).map((t) =>
        catalogFromStudio(t, issuers.get(t.issuerSlug) ?? t.issuerSlug),
      );
      res.json([...studio, ...parties.catalog(), ...hosted.catalog()]);
    }),
  );

  /** An offer from an external issuer, outside any run (the Wallet page's "collect" buttons). */
  r.post(
    "/parties/issuers/:issuer/types/:type/offers",
    h(async (req, res) => {
      const found = parties.findType(externalTypeId(req.params.issuer!, req.params.type!));
      if (!found) throw new ApiError(404, "not_found", "No such external credential type.");
      const steps = found.type.offer ?? found.issuer.offer;
      if (!steps)
        throw new ApiError(
          400,
          "no_offer_api",
          `${found.issuer.name} has no offer steps in the parties file.${found.issuer.offerPage ? ` Get an offer at ${found.issuer.offerPage}.` : ""}`,
        );
      const { claims = {}, txCode } = (req.body ?? {}) as {
        claims?: Record<string, unknown>;
        txCode?: string;
      };
      const merged = Object.fromEntries(
        found.catalog.fields.map((f) => [f.name, claims[f.name] ?? f.sample ?? ""]),
      );
      const saved = await parties.runSteps(
        steps,
        {
          claims: merged,
          configurationId: found.type.configurationId,
          vct: found.type.vct ?? "",
          typeName: found.type.typeName ?? "",
          txCode: txCode ?? "",
          runId: "",
        },
        { recorder, from: "verifier-backend", to: "external-issuer", phase: "issuance" },
      );
      res.status(201).json({ offerUri: String(saved.offerUri) });
    }),
  );

  /** Hand a waiting run what it asked for: an offer the person pasted, or Continue. */
  r.post(
    "/runs/:id/input",
    h(async (req, res) => {
      const { offerUri, confirm } = (req.body ?? {}) as { offerUri?: unknown; confirm?: unknown };
      if (
        offerUri !== undefined &&
        (typeof offerUri !== "string" || !offerUri.startsWith("openid-credential-offer"))
      )
        throw new ApiError(400, "invalid_offer", "Paste an openid-credential-offer:// link.");
      if (
        !orchestrator.provide(req.params.id!, {
          offerUri: offerUri as string | undefined,
          confirm: confirm === true,
        })
      )
        throw new ApiError(409, "not_waiting", "This run is not waiting for anything.");
      res.sendStatus(202);
    }),
  );

  return r;
}
