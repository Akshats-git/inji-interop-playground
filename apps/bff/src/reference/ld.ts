/**
 * JSON-LD plumbing for the Reference Wallet and Reference Verifier: a document loader with the standard
 * contexts bundled offline, falling back to the network (through the gateway for playground-hosted
 * contexts) with a small cache.
 */
import { contexts as vcContexts } from "@digitalbazaar/credentials-context";
import didContext from "did-context";
import ed25519Ctx from "ed25519-signature-2020-context";

type Loaded = { contextUrl: null; documentUrl: string; document: unknown };

const bundled = new Map<string, unknown>([...vcContexts.entries()]);
for (const [url, doc] of (didContext as unknown as { contexts: Map<string, unknown> }).contexts)
  bundled.set(url, doc);
for (const [url, doc] of (ed25519Ctx as unknown as { contexts: Map<string, unknown> }).contexts)
  bundled.set(url, doc);

const cache = new Map<string, { at: number; doc: unknown }>();

export function makeDocumentLoader(
  fetchJson: (url: string) => Promise<unknown>,
  resolveDid?: (did: string) => Promise<unknown>,
) {
  return async (url: string): Promise<Loaded> => {
    const b = bundled.get(url);
    if (b) return { contextUrl: null, documentUrl: url, document: b };
    if (url.startsWith("did:") && resolveDid) {
      const [did, fragment] = url.split("#");
      const doc = (await resolveDid(did!)) as Record<string, unknown>;
      if (fragment) {
        const vm = ((doc.verificationMethod as Record<string, unknown>[]) ?? []).find((v) =>
          String(v.id).endsWith(`#${fragment}`),
        );
        if (vm)
          return {
            contextUrl: null,
            documentUrl: url,
            document: {
              "@context": doc["@context"] ?? "https://w3id.org/security/suites/ed25519-2020/v1",
              ...vm,
            },
          };
      }
      return { contextUrl: null, documentUrl: url, document: doc };
    }
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < 5 * 60_000)
      return { contextUrl: null, documentUrl: url, document: hit.doc };
    const doc = await fetchJson(url);
    cache.set(url, { at: Date.now(), doc });
    return { contextUrl: null, documentUrl: url, document: doc };
  };
}
