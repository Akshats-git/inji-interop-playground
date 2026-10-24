/**
 * AES-256-GCM sealing for everything that may carry personal data at rest (protocol payloads, held
 * credentials). Synthetic data only is expected, but nothing is stored in plaintext regardless.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Sealed {
  iv: Buffer;
  data: Buffer; // ciphertext || 16-byte tag
}

export class Sealer {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, "base64");
    if (key.length !== 32)
      throw new Error("EVENT_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    this.key = key;
  }

  static ephemeral() {
    return new Sealer(randomBytes(32).toString("base64"));
  }

  seal(value: unknown, aad = ""): Sealed {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { iv, data: Buffer.concat([ct, cipher.getAuthTag()]) };
  }

  open<T = unknown>(s: Sealed, aad = ""): T {
    const decipher = createDecipheriv("aes-256-gcm", this.key, s.iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(s.data.subarray(s.data.length - 16));
    const pt = Buffer.concat([decipher.update(s.data.subarray(0, s.data.length - 16)), decipher.final()]);
    return JSON.parse(pt.toString("utf8")) as T;
  }
}
