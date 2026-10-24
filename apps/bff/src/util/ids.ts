import { randomBytes, randomUUID } from "node:crypto";

export const uuid = () => randomUUID();
/** Short, URL-safe, human-friendly run id, e.g. "r-7k2m9q". */
export const shortId = (prefix: string) =>
  `${prefix}-${randomBytes(4)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x")
    .slice(0, 6)}`;
export const now = () => new Date().toISOString();
