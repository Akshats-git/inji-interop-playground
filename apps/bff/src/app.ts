import express from "express";
import type { JWK } from "jose";
import type { Config } from "./config.js";
import { CertifyClient } from "./inji/certify.js";
import { InjiVerifyClient } from "./inji/verify.js";
import { Recorder } from "./gateway/recorder.js";
import { certifyRoute, recordingProxy, verifyRoute } from "./gateway/proxy.js";
import { publicRoutes } from "./public/routes.js";
import { StudioService } from "./studio/service.js";
import type { Store } from "./store/types.js";
import { studioApi } from "./api/studio.js";
import { runsApi } from "./api/runs.js";
import { walletApi } from "./api/wallet.js";
import { insightsApi } from "./api/insights.js";
import { partiesApi } from "./api/parties.js";
import { PartiesService } from "./parties/service.js";
import { HostedService } from "./hosted/service.js";
import { hostedApi } from "./api/hosted.js";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { errorHandler } from "./api/errors.js";
import { publicExposureGuard } from "./gateway/exposure.js";
import { ReferenceWallet } from "./reference/wallet/service.js";
import { ReferenceVerifier } from "./reference/verifier/service.js";
import { walletHttp } from "./reference/wallet/http.js";
import { Orchestrator } from "./runs/orchestrator.js";
import { call } from "./util/http.js";

export function createApp(
  config: Config,
  store: Store,
  parties: PartiesService = PartiesService.fromFile(config.partiesFile),
) {
  const publicBaseUrl = () => config.publicBaseUrl;
  const recorder = new Recorder(store);
  const certify = new CertifyClient(config.certifyUrl, recorder);
  const studio = new StudioService(store, certify, publicBaseUrl);
  // Hosted Inji deployments (MOSIP Collab) from the parties file; key files are relative to that file.
  const hosted = new HostedService(
    parties.environments,
    parties.loaded.file ? dirname(parties.loaded.file) : process.cwd(),
    recorder,
  );
  const wallet = new ReferenceWallet(store, { publicBaseUrl, selfUrl: config.selfUrl }, recorder);
  wallet.partyOf = (url) => hosted.partyOf(url);
  const injiVerify = new InjiVerifyClient(`${config.selfUrl}/pub/verify/v1/verify`, config.publicBaseUrl);

  // The Reference Verifier fetches public documents like any outside party would (through the gateway),
  // and trusts as SD-JWT issuers the playground's Certify (by its published JWKS) plus the external issuers whose
  // keys the parties file lists.
  const verifierHttp = walletHttp({
    publicBaseUrl: config.publicBaseUrl,
    selfUrl: config.selfUrl,
    actor: "reference-verifier",
    recorder,
    partyOf: (url) => hosted.partyOf(url),
  });
  let jwksCache: { at: number; keys: JWK[] } | undefined;
  const refVerifier = new ReferenceVerifier(
    publicBaseUrl,
    {
      fetchJson: (url) => verifierHttp.getJson(url),
      resolveDidWeb: (did) => wallet.resolveDidWeb(did),
      trustedIssuerJwks: async () => {
        // One unreachable source (the bundled Certify still booting) must not hide the others' keys.
        if (!jwksCache || Date.now() - jwksCache.at > 60_000)
          jwksCache = {
            at: Date.now(),
            keys: await call<{ keys: JWK[] }>(`${config.certifyUrl}/v1/certify/.well-known/jwks.json`, {
              timeoutMs: 5000,
            }).then(
              (r) => r.body.keys,
              () => [],
            ),
          };
        return [...jwksCache.keys, ...(await parties.trustedJwks()), ...(await hosted.trustedJwks())];
      },
    },
    recorder,
  );
  const orchestrator = new Orchestrator({
    store,
    recorder,
    studio,
    wallet,
    refVerifier,
    injiVerify,
    parties,
    hosted,
    verifyDid: config.verifyDid,
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(publicExposureGuard(config));

  // Wallet-facing gateway first: it needs raw bodies.
  app.use(recordingProxy(certifyRoute(config.certifyUrl), recorder));
  app.use(recordingProxy(verifyRoute(config.verifyUrl), recorder));
  app.use(refVerifier.router());
  app.use(publicRoutes(studio, store));

  const api = express.Router();
  api.use(express.json({ limit: "2mb" }));
  api.use(studioApi(studio, store));
  api.use(runsApi(store, orchestrator));
  api.use(walletApi(store, wallet, refVerifier));
  api.use(insightsApi(config, store, certify, parties, hosted));
  api.use(partiesApi(parties, store, orchestrator, recorder, hosted));
  api.use(hostedApi(hosted, wallet));
  app.use("/api", api);
  app.use("/api", (_req, res) => void res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);

  // The built UI (single origin with the API and gateway). Client-side routes fall back to index.html.
  const uiDist = resolve(config.uiDist ?? join(import.meta.dirname, "../../ui/dist"));
  if (existsSync(uiDist)) {
    app.use(
      express.static(uiDist, {
        index: false,
        maxAge: "1h",
        setHeaders: (res, path) => path.endsWith(".html") && res.setHeader("cache-control", "no-cache"),
      }),
    );
    app.get(/^\/(?!api|pub|ws).*/, (_req, res) => res.sendFile(join(uiDist, "index.html")));
  }

  return { app, recorder, certify, studio, wallet, refVerifier, injiVerify, orchestrator, parties, hosted };
}
