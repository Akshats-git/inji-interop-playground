import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { log } from "./log.js";
import { MemoryStore } from "./store/memory.js";
import { PgStore } from "./store/pg.js";
import { Sealer } from "./util/sealed.js";

const config = loadConfig();
let sealer: Sealer;
if (config.encryptionKey) sealer = new Sealer(config.encryptionKey);
else if (config.production) throw new Error("EVENT_ENCRYPTION_KEY is required (./playground.sh up generates one into .env)");
else {
  log.warn("EVENT_ENCRYPTION_KEY not set: using an ephemeral key; stored payloads will be unreadable after a restart");
  sealer = Sealer.ephemeral();
}
const store = config.databaseUrl ? new PgStore(config.databaseUrl, sealer) : new MemoryStore();
await store.init();

const { app, studio } = createApp(config, store);
const server = createServer(app);
server.listen(config.port, config.host, () => log.info({ port: config.port, publicBaseUrl: config.publicBaseUrl, store: config.databaseUrl ? "postgres" : "memory" }, "playground listening"));

void studio.reconcile().then((r) => (r.created.length || r.updated.length) && log.info(r, "re-synced credential types with Certify"));

const shutdown = () => {
  server.close();
  void store.close().finally(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
