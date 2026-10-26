/** Public, unauthenticated documents that verifiers and wallets fetch: contexts, issuer documents, keys, logos. */
import express from "express";
import { shortTypeId, vctFor, type CredentialType, type SigningAlg } from "@playground/core";
import type { StudioService } from "../studio/service.js";
import type { Store } from "../store/types.js";

const ALGS = new Set<SigningAlg>(["EdDSA", "RS256", "ES256", "ES256K"]);

export function publicRoutes(studio: StudioService, store: Store) {
  const r = express.Router();
  const cors = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.set("access-control-allow-origin", "*");
    next();
  };
  r.use("/pub/contexts", cors);
  r.use("/pub/issuers", cors);

  r.get("/pub/contexts/:issuer/:file", async (req, res) => {
    const typeName = req.params.file.replace(/\.jsonld$|\.json$/, "");
    const doc = await studio.contextDocument(req.params.issuer, typeName);
    if (!doc) return void res.status(404).json({ error: "unknown_context" });
    res
      .type("application/ld+json")
      .set("cache-control", "public, max-age=300")
      .send(JSON.stringify(doc, null, 2));
  });

  r.get("/pub/issuers/:slug/did.json", async (req, res) => {
    const doc = await studio.issuerDidDocument(req.params.slug).catch(() => undefined);
    if (!doc) return void res.status(404).json({ error: "unknown_issuer" });
    res.type("application/did+json").json(doc);
  });

  r.get("/pub/issuers/:slug/keys/:alg", async (req, res) => {
    const alg = req.params.alg as SigningAlg;
    if (!ALGS.has(alg)) return void res.status(404).json({ error: "unknown_algorithm" });
    const key = await studio.issuerKey(req.params.slug, alg).catch(() => undefined);
    if (!key)
      return void res.status(404).json({
        error: "no_key",
        error_description: `Certify has no ${alg} key in use yet. Create a credential type that signs with ${alg} first.`,
      });
    res.json(key);
  });

  r.get("/pub/issuers/:slug/logo.svg", async (req, res) => {
    const issuer = await store.getIssuer(req.params.slug);
    if (!issuer) return void res.sendStatus(404);
    const initials = issuer.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
    const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
    res
      .type("image/svg+xml")
      .set("cache-control", "public, max-age=300")
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="${issuer.backgroundColor}"/><text x="48" y="58" font-family="Georgia, serif" font-size="34" font-weight="700" text-anchor="middle" fill="${issuer.textColor}">${esc(initials)}</text></svg>`,
      );
  });

  // SD-JWT VC type metadata, at the type's vct URL (readable form, or the short form used on long hosts).
  const typeMetadata = (t: CredentialType) => ({
    vct: vctFor(t.syncedBaseUrl, t),
    name: t.displayName,
    description: t.description,
    claims: t.fields.map((f) => ({ path: [f.name], display: [{ lang: "en", label: f.label }] })),
  });
  r.get("/pub/issuers/:slug/types/:type", async (req, res) => {
    // A type name can exist as JSON-LD and as SD-JWT; only the SD-JWT one has a vct.
    const t = (await store.listTypes(req.params.slug))
      .filter((x) => x.typeName === req.params.type)
      .sort((a, b) => Number(b.format === "vc+sd-jwt") - Number(a.format === "vc+sd-jwt"))[0];
    if (!t) return void res.sendStatus(404);
    res.json(typeMetadata(t));
  });
  r.get("/pub/vct/:id", async (req, res) => {
    const t = (await store.listTypes())
      .filter((x) => shortTypeId(x.issuerSlug, x.typeName) === req.params.id)
      .sort((a, b) => Number(b.format === "vc+sd-jwt") - Number(a.format === "vc+sd-jwt"))[0];
    if (!t) return void res.sendStatus(404);
    res.json(typeMetadata(t));
  });

  r.get("/pub/issuers/:slug/vocab", (req, res) =>
    res
      .type("text/plain")
      .send(
        `Vocabulary for credentials issued by "${req.params.slug}" through the Inji Interoperability Playground.`,
      ),
  );

  r.get("/pub/issuers/:slug", async (req, res) => {
    const doc = await studio.issuerProfileDocument(req.params.slug);
    if (!doc) return void res.status(404).json({ error: "unknown_issuer" });
    res.json(doc);
  });

  return r;
}
