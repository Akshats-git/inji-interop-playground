import express from "express";
import type { Config } from "./config.js";
import { CertifyClient } from "./inji/certify.js";
import { Recorder } from "./gateway/recorder.js";
import { certifyRoute, recordingProxy, verifyRoute } from "./gateway/proxy.js";
import { publicRoutes } from "./public/routes.js";
import { StudioService } from "./studio/service.js";
import type { Store } from "./store/types.js";
import { studioApi } from "./api/studio.js";
import { errorHandler } from "./api/errors.js";

export function createApp(config: Config, store: Store) {
  const recorder = new Recorder(store);
  const certify = new CertifyClient(config.certifyUrl, recorder);
  const studio = new StudioService(store, certify, () => config.publicBaseUrl);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // Wallet-facing gateway first: it needs raw bodies.
  app.use(recordingProxy(certifyRoute(config.certifyUrl), recorder));
  app.use(recordingProxy(verifyRoute(config.verifyUrl), recorder));
  app.use(publicRoutes(studio, store));

  const api = express.Router();
  api.use(express.json({ limit: "2mb" }));
  api.use(studioApi(studio, store));
  app.use("/api", api);
  app.use("/api", (_req, res) => void res.status(404).json({ error: "not_found" }));
  app.use(errorHandler);

  return { app, recorder, certify, studio };
}
