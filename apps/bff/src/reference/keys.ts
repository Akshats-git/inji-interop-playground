/** Holder keys and DID encodings (did:key for Ed25519, did:jwk for P-256), using jose only. */
import { exportJWK, generateKeyPair, importJWK, type JWK } from "jose";
import { bytesToB64url, b64urlToBytes } from "@playground/core";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58btc(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

export function base58btcDecode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("invalid base58 character");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

export interface HolderKey {
  kind: "ed25519" | "p256";
  did: string;
  /** Verification method id, e.g. did:key:z6Mk…#z6Mk… */
  kid: string;
  alg: "EdDSA" | "ES256";
  privateJwk: JWK;
  publicJwk: JWK;
}

export async function newHolderKey(kind: "ed25519" | "p256"): Promise<HolderKey> {
  const { privateKey, publicKey } = await generateKeyPair(kind === "ed25519" ? "EdDSA" : "ES256", {
    extractable: true,
    crv: kind === "ed25519" ? "Ed25519" : undefined,
  });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  return fromJwks(kind, privateJwk, publicJwk);
}

export function fromJwks(kind: "ed25519" | "p256", privateJwk: JWK, publicJwk: JWK): HolderKey {
  if (kind === "ed25519") {
    const pub = b64urlToBytes(publicJwk.x!);
    const mb = "z" + base58btc(new Uint8Array([0xed, 0x01, ...pub]));
    const did = `did:key:${mb}`;
    return { kind, did, kid: `${did}#${mb}`, alg: "EdDSA", privateJwk, publicJwk };
  }
  const { kty, crv, x, y } = publicJwk;
  const did = `did:jwk:${bytesToB64url(new TextEncoder().encode(JSON.stringify({ crv, kty, x, y })))}`;
  return { kind, did, kid: `${did}#0`, alg: "ES256", privateJwk, publicJwk };
}

export async function privateKeyOf(k: HolderKey) {
  return importJWK(k.privateJwk, k.alg);
}

/** Ed25519 key material in the multibase forms the digitalbazaar suites expect. */
export function ed25519Multibase(k: HolderKey) {
  const pub = b64urlToBytes(k.publicJwk.x!);
  const priv = b64urlToBytes(k.privateJwk.d!);
  return {
    publicKeyMultibase: "z" + base58btc(new Uint8Array([0xed, 0x01, ...pub])),
    privateKeyMultibase: "z" + base58btc(new Uint8Array([0x80, 0x26, ...priv, ...pub])),
  };
}

/** Resolve did:key (Ed25519 / P-256) and did:jwk to a DID document locally. */
export function resolveLocalDid(did: string): Record<string, unknown> | undefined {
  if (did.startsWith("did:jwk:")) {
    const jwk = JSON.parse(new TextDecoder().decode(b64urlToBytes(did.slice(8))));
    const id = `${did}#0`;
    return {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
      id: did,
      verificationMethod: [{ id, type: "JsonWebKey2020", controller: did, publicKeyJwk: jwk }],
      assertionMethod: [id],
      authentication: [id],
    };
  }
  if (did.startsWith("did:key:z6Mk")) {
    const mb = did.slice(8);
    const id = `${did}#${mb}`;
    return {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/ed25519-2020/v1"],
      id: did,
      verificationMethod: [
        { id, type: "Ed25519VerificationKey2020", controller: did, publicKeyMultibase: mb },
      ],
      assertionMethod: [id],
      authentication: [id],
    };
  }
  return undefined;
}
