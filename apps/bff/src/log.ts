import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  redact: { paths: ["req.headers.authorization", "*.access_token", "*.pre-authorized_code", "*.tx_code"], censor: "●●●" },
});
