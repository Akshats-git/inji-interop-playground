import express from "express";
import { LDP_SUITES, SD_JWT_ALGS } from "@playground/core";
import type { StudioService } from "../studio/service.js";
import type { Store } from "../store/types.js";
import { h } from "./errors.js";

export function studioApi(studio: StudioService, store: Store) {
  const r = express.Router();

  r.get(
    "/issuers",
    h(async (_req, res) => {
      const issuers = await store.listIssuers();
      const types = await store.listTypes();
      res.json(issuers.map((i) => ({ ...i, types: types.filter((t) => t.issuerSlug === i.slug) })));
    }),
  );
  r.post(
    "/issuers",
    h(async (req, res) => void res.status(201).json(await studio.createIssuer(req.body))),
  );
  r.get(
    "/issuers/:slug",
    h(async (req, res) => {
      const i = await studio.requireIssuer(req.params.slug!);
      res.json({ ...i, types: await store.listTypes(i.slug) });
    }),
  );
  r.put(
    "/issuers/:slug",
    h(async (req, res) => void res.json(await studio.updateIssuer(req.params.slug!, req.body))),
  );
  r.delete(
    "/issuers/:slug",
    h(async (req, res) => {
      await studio.deleteIssuer(req.params.slug!);
      res.sendStatus(204);
    }),
  );

  r.get(
    "/types",
    h(async (_req, res) => void res.json(await store.listTypes())),
  );
  r.post(
    "/types/preview",
    h(async (req, res) => void res.json(await studio.preview(req.body))),
  );
  r.post(
    "/types",
    h(async (req, res) => void res.status(201).json(await studio.createType(req.body))),
  );
  r.get(
    "/types/:id",
    h(async (req, res) => {
      const t = await studio.requireType(req.params.id!);
      res.json({ ...t, advertised: await studio.isAdvertised(t.configId) });
    }),
  );
  r.put(
    "/types/:id",
    h(async (req, res) => void res.json(await studio.updateType(req.params.id!, req.body))),
  );
  r.delete(
    "/types/:id",
    h(async (req, res) => {
      await studio.deleteType(req.params.id!);
      res.sendStatus(204);
    }),
  );

  /** Standalone offer (outside a run): QR / deep link for any wallet. */
  r.post(
    "/types/:id/offers",
    h(async (req, res) => {
      const { claims = {}, txCode, expiresIn } = req.body ?? {};
      const { offerUri } = await studio.createOffer(req.params.id!, claims, { txCode, expiresIn });
      res.status(201).json({ offerUri });
    }),
  );

  r.get("/studio/options", (_req, res) => {
    res.json({
      ldpSuites: Object.entries(LDP_SUITES).map(([suite, alg]) => ({ suite, alg })),
      sdJwtAlgs: SD_JWT_ALGS,
    });
  });

  r.post(
    "/studio/reconcile",
    h(async (_req, res) => void res.json(await studio.reconcile())),
  );
  return r;
}
