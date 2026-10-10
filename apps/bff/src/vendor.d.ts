// Untyped JSON-LD / VC libraries from Digital Bazaar.
declare module "@digitalbazaar/credentials-context" {
  export const contexts: Map<string, unknown>;
}
declare module "did-context" {
  const m: { contexts: Map<string, unknown> };
  export default m;
}
declare module "ed25519-signature-2020-context" {
  const m: { contexts: Map<string, unknown>; CONTEXT_URL: string };
  export default m;
}
declare module "@digitalbazaar/vc";
declare module "@digitalbazaar/ed25519-signature-2020";
declare module "@digitalbazaar/ed25519-verification-key-2020";
declare module "jsonld";
declare module "@injistack/pixelpass";
