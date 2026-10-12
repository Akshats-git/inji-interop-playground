import { z } from "zod";

const Env = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default("::"),
  /** Origin wallets use to reach the gateway (localhost, or a tunnel's https URL for a phone). */
  PUBLIC_BASE_URL: z.string().url().default("http://playground.localhost:8080"),
  /** Base the BFF itself uses to call its own gateway (so its traffic is recorded like anyone else's). */
  SELF_URL: z.string().url().optional(),
  DATABASE_URL: z.string().optional(),
  CERTIFY_INTERNAL_URL: z.string().url().default("http://127.0.0.1:8090"),
  VERIFY_INTERNAL_URL: z.string().url().default("http://127.0.0.1:8092"),
  /** base64 32-byte key for AES-256-GCM sealing of recorded payloads. */
  EVENT_ENCRYPTION_KEY: z.string().optional(),
  RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  UI_DIST: z.string().optional(),
  /** Also serve the UI and API on the public (tunnel) URL. Off by default: wallets only need /pub/*. */
  PUBLIC_UI: z.enum(["true", "false"]).default("false"),
  /** External issuers, verifiers and wallets (infra/parties.yaml). Read at start-up: edit it, then restart. */
  PARTIES_FILE: z.string().optional(),
  LOG_LEVEL: z.string().default("info"),
  NODE_ENV: z.string().default("development"),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = Env.parse(env);
  const publicBaseUrl = e.PUBLIC_BASE_URL.replace(/\/+$/, "");
  return {
    port: e.PORT,
    host: e.HOST,
    publicBaseUrl,
    selfUrl: (e.SELF_URL ?? `http://127.0.0.1:${e.PORT}`).replace(/\/+$/, ""),
    databaseUrl: e.DATABASE_URL,
    certifyUrl: e.CERTIFY_INTERNAL_URL.replace(/\/+$/, ""),
    verifyUrl: e.VERIFY_INTERNAL_URL.replace(/\/+$/, ""),
    encryptionKey: e.EVENT_ENCRYPTION_KEY,
    retentionDays: e.RETENTION_DAYS,
    uiDist: e.UI_DIST,
    publicUi: e.PUBLIC_UI === "true",
    partiesFile: e.PARTIES_FILE,
    logLevel: e.LOG_LEVEL,
    production: e.NODE_ENV === "production",
  };
}
