import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { log } from "./log.js";
import { MemoryStore } from "./store/memory.js";
import { PgStore } from "./store/pg.js";
import { Sealer } from "./util/sealed.js";
import { attachWebSocket } from "./ws.js";
import { isPublicHostRequest } from "./gateway/exposure.js";
import { seedDemo } from "./studio/seed.js";
import { redirectApp } from "./api/hosted.js";

const config = loadConfig();
let sealer: Sealer;
if (config.encryptionKey) sealer = new Sealer(config.encryptionKey);
else if (config.production)
  throw new Error("EVENT_ENCRYPTION_KEY is required (./playground.sh up generates one into .env)");
else {
  log.warn(
    "EVENT_ENCRYPTION_KEY not set: using an ephemeral key; stored payloads will be unreadable after a restart",
  );
  sealer = Sealer.ephemeral();
}
const store = config.databaseUrl ? new PgStore(config.databaseUrl, sealer) : new MemoryStore();
await store.init();

const { app, studio, recorder, orchestrator, certify, hosted } = createApp(config, store);
const server = createServer(app);
// The live feed carries every recorded message title, so like the API it stays off the public URL.
attachWebSocket(
  server,
  recorder,
  orchestrator,
  (req) => config.publicUi || !isPublicHostRequest(config, req),
);
server.listen(config.port, config.host, () =>
  log.info(
    {
      port: config.port,
      publicBaseUrl: config.publicBaseUrl,
      store: config.databaseUrl ? "postgres" : "memory",
    },
    "playground listening",
  ),
);

// Hosted Inji environments (MOSIP Collab): discover their issuers in the background, and listen for eSignet's redirect.
hosted.start();
let redirectServer: ReturnType<typeof createServer> | undefined;
if (config.oauthRedirectPort && hosted.environments.length) {
  redirectServer = createServer(redirectApp(hosted));
  redirectServer.on("error", (e) =>
    log.warn(
      { err: (e as Error).message, port: config.oauthRedirectPort },
      "the OAuth redirect port is unavailable; signing in yourself at eSignet will not return to the playground",
    ),
  );
  redirectServer.listen(config.oauthRedirectPort, config.host, () =>
    log.info({ port: config.oauthRedirectPort }, "listening for eSignet's redirect"),
  );
}

// Once Certify is reachable: seed demo content on a fresh install, then make Certify match our store.
void (async () => {
  for (let i = 0; i < 120 && !(await certify.health()); i++) await new Promise((r) => setTimeout(r, 2000));
  if (process.env.SEED_DEMO !== "false")
    await seedDemo(store, studio).catch((e) => log.warn({ err: e }, "seeding failed"));
  const r = await studio.reconcile();
  if (r.created.length || r.updated.length) log.info(r, "re-synced credential types with Certify");
})();

// Retention: protocol payloads and runs are purged after RETENTION_DAYS.
const purge = () =>
  store
    .purge(new Date(Date.now() - config.retentionDays * 86400_000))
    .then((n) => (n.runs || n.events || n.held) && log.info(n, "purged expired data"))
    .catch((e) => log.warn({ err: e }, "purge failed"));
void purge();
setInterval(purge, 3600_000).unref();

const shutdown = () => {
  server.close();
  redirectServer?.close();
  hosted.stop();
  void store.close().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
