/** Self-signed P-256 certificates, used only by the "forged SD-JWT" tamper preset. */
import { webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";

x509.cryptoProvider.set(webcrypto as unknown as Parameters<typeof x509.cryptoProvider.set>[0]);

export async function selfSignedCert(subject: string) {
  const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  const keys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Date.now().toString(16),
    name: subject,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 365 * 86400_000),
    keys,
    signingAlgorithm: alg,
  });
  return { privateKey: keys.privateKey, certB64: Buffer.from(cert.rawData).toString("base64") };
}
