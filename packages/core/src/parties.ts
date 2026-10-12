/**
 * External parties: issuers, verifiers and wallets that live outside the playground, declared in a config
 * file (infra/parties.yaml) instead of in code. Edit the file, restart the playground, and the UI lists them.
 *
 * Talking to an external party is described as a short list of HTTP steps. Each step is a template: values
 * like `${claims.memberName}` or `${offerUri}` are filled in at run time, and `save` picks values out of the
 * response (a JSON path, or a query parameter of a URI the response returned) for later steps.
 */
import { z } from "zod";
import { FieldKind, signingAlgOf, vctFor, type CredentialType, type Format } from "./studio.js";

const ID = /^[a-z][a-z0-9-]{1,40}$/;
const id = z.string().regex(ID, "lowercase letters, digits and dashes, starting with a letter");

/** Where to find a value in a step's response: "$" (the whole body), "$.a.b[0]", "header:location" or "query:<param>". */
const Selector = z.string().regex(/^(\$.*|header:[\w-]+|query:[\w.-]+)$/, 'a JSON path ("$.a.b"), "header:<name>" or "query:<param>"');

export const HttpStep = z.object({
  /** Shown in the inspector, e.g. "Create offer at walt.id". */
  title: z.string().max(80).optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  url: z.string().min(1),
  headers: z.record(z.string()).default({}),
  /** JSON body (any shape), or a string sent as-is. Placeholders are filled in anywhere inside it. */
  body: z.unknown().optional(),
  /** How to send the body: JSON (default for objects), plain text (default for strings) or a form. */
  bodyType: z.enum(["json", "text", "form"]).optional(),
  /** Values to keep for later steps and for the result, e.g. { offerUri: "$" }. */
  save: z.record(Selector).default({}),
  /** HTTP statuses that count as success; anything else stops the run with the response as the reason. */
  okStatus: z.array(z.number().int()).default([200, 201, 202, 204]),
});
export type HttpStep = z.infer<typeof HttpStep>;

const Steps = z.array(HttpStep).min(1).max(8);

export const ExternalField = z.object({
  name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,59}$/),
  label: z.string().trim().min(1).max(60).optional(),
  kind: FieldKind.default("text"),
  options: z.array(z.string()).optional(),
  /** A synthetic value to prefill the run form with. */
  sample: z.union([z.string(), z.number(), z.boolean()]).optional(),
  selectivelyDisclosable: z.boolean().default(true),
});

export const ExternalTypeInput = z
  .object({
    id,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280).default(""),
    /** The credential_configuration_id in the issuer's OpenID4VCI metadata. */
    configurationId: z.string().min(1),
    format: z.enum(["ldp_vc", "vc+sd-jwt"]),
    /** ldp_vc: the credential's own type, e.g. "UniversityDegree". */
    typeName: z.string().optional(),
    dataModel: z.enum(["1.1", "2.0"]).optional(),
    /** SD-JWT: the exact vct the issuer puts in the credential. */
    vct: z.string().optional(),
    /** Free text for reports, e.g. "ES256 with x5c". */
    proof: z.string().max(60).optional(),
    claims: z.array(ExternalField).min(1).max(30),
    /** Steps that make the issuer create a credential offer for these claims. Must save `offerUri`. Overrides the issuer's. */
    offer: Steps.optional(),
  })
  .refine((t) => (t.format === "ldp_vc" ? Boolean(t.typeName) : Boolean(t.vct)), { message: "ldp_vc types need typeName; SD-JWT types need vct", path: ["format"] });
export type ExternalTypeInput = z.infer<typeof ExternalTypeInput>;

export const ExternalIssuerInput = z.object({
  id,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(""),
  /** Software and version, e.g. "walt.id issuer-api 1.0.0". */
  software: z.string().max(80).optional(),
  homepage: z.string().url().optional(),
  /** The OpenID4VCI credential_issuer identifier (its metadata is at <this>/.well-known/openid-credential-issuer). */
  credentialIssuer: z.string().url(),
  /** A page where a person can get an offer by hand, when the issuer has no offer API. */
  offerPage: z.string().url().optional(),
  /** Default offer steps for all its types (a type can override them). Must save `offerUri`. */
  offer: Steps.optional(),
  /**
   * How the playground's Reference Verifier should trust this issuer's SD-JWT signatures. Inji Verify 0.18.2
   * ignores this (it trusts whatever x5c certificate the token carries, gap G11).
   */
  trust: z
    .object({
      /** PEM certificates (or a file:… reference to one) whose public keys are trusted. */
      certificates: z.array(z.string()).default([]),
      /** Inline public JWKs. */
      jwks: z.array(z.record(z.unknown())).default([]),
      /** A URL serving a JWKS. */
      jwksUri: z.string().url().optional(),
    })
    .default({}),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  types: z.array(ExternalTypeInput).min(1).max(30),
});
export type ExternalIssuerInput = z.infer<typeof ExternalIssuerInput>;

export const ExternalVerifierInput = z.object({
  id,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(""),
  software: z.string().max(80).optional(),
  homepage: z.string().url().optional(),
  /** Credential formats it can verify. */
  formats: z.array(z.enum(["ldp_vc", "vc+sd-jwt"])).min(1),
  /** Steps that create a presentation request. Must save `requestUri` (an openid4vp:// URI); may save `state`. */
  request: Steps,
  /** Steps that read the verdict. Must save `verified` (true/"true" means accepted); may save `detail`. Retried until `verified` appears. */
  result: Steps,
  /** How long to keep asking for the verdict, in seconds. */
  resultTimeoutSeconds: z.number().int().min(2).max(600).default(20),
});
export type ExternalVerifierInput = z.infer<typeof ExternalVerifierInput>;

export const ExternalWalletInput = z.object({
  id,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(""),
  software: z.string().max(80).optional(),
  kind: z.enum(["mobile", "web", "headless"]),
  homepage: z.string().url().optional(),
  install: z.object({ android: z.string().url().optional(), ios: z.string().url().optional(), web: z.string().url().optional() }).default({}),
  formats: z.array(z.string()).default([]),
  protocols: z.array(z.string()).default([]),
  notes: z.string().max(600).optional(),
  /**
   * Optional automation for wallets with an API (headless wallets): steps to accept an offer (`${offerUri}`,
   * `${txCode}`) and to answer a presentation request (`${requestUri}`, `${presentationDefinition}`).
   * Without it the wallet is driven by a person scanning QR codes.
   */
  automation: z.object({ receive: Steps, present: Steps }).optional(),
});
export type ExternalWalletInput = z.infer<typeof ExternalWalletInput>;

export const PartiesFile = z.object({
  version: z.literal(1).default(1),
  issuers: z.array(ExternalIssuerInput).default([]),
  verifiers: z.array(ExternalVerifierInput).default([]),
  wallets: z.array(ExternalWalletInput).default([]),
});
export type PartiesFile = z.infer<typeof PartiesFile>;

/** Check ids are unique and that every type has offer steps or a page to get offers from. Returns problems as text. */
export function partiesProblems(p: PartiesFile): string[] {
  const out: string[] = [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) out.push(`${kind} id "${i}" is used twice.`);
      seen.add(i);
    }
  };
  dup("issuer", p.issuers.map((i) => i.id));
  dup("verifier", p.verifiers.map((v) => v.id));
  dup("wallet", p.wallets.map((w) => w.id));
  for (const i of p.issuers) {
    dup(`type (issuer ${i.id})`, i.types.map((t) => t.id));
    for (const t of i.types) {
      const steps = t.offer ?? i.offer;
      if (steps && !steps.some((s) => "offerUri" in s.save)) out.push(`issuer ${i.id}, type ${t.id}: the offer steps never save "offerUri".`);
    }
  }
  for (const v of p.verifiers) {
    if (!v.request.some((s) => "requestUri" in s.save)) out.push(`verifier ${v.id}: the request steps never save "requestUri".`);
    if (!v.result.some((s) => "verified" in s.save)) out.push(`verifier ${v.id}: the result steps never save "verified".`);
  }
  for (const w of p.wallets) if (w.automation && w.kind !== "headless") out.push(`wallet ${w.id}: automation is only for headless wallets (kind: headless).`);
  return out;
}

// --- The runnable catalog: Studio types and external types in one shape ------------------------------------

export interface CatalogField {
  name: string;
  label: string;
  kind: z.infer<typeof FieldKind>;
  options?: string[];
  sample?: string | number | boolean;
  selectivelyDisclosable: boolean;
}

/** A credential type a run can use: designed in the Studio (issued by Inji Certify) or declared in the parties file. */
export interface CatalogType {
  /** Studio type id, or "ext:<issuer>/<type>". */
  id: string;
  origin: "studio" | "external";
  issuerId: string;
  issuerName: string;
  displayName: string;
  description: string;
  format: Format;
  dataModel?: "1.1" | "2.0";
  typeName?: string;
  vct?: string;
  /** What signs it, for reports: "Ed25519Signature2020", "SD-JWT ES256"… */
  proof: string;
  fields: CatalogField[];
  /** True when the playground can make the issuer create an offer by itself. */
  canIssue: boolean;
  /** External only: where to get an offer by hand. */
  offerPage?: string;
  configurationId: string;
  /** Studio only: a hard-coded expiry (runs expect such a credential to be rejected once it has passed). */
  expiresAt?: string;
}

/** A Studio type (issued by the playground's Inji Certify) as a catalog entry. */
export function catalogFromStudio(t: CredentialType, issuerName: string): CatalogType {
  return {
    id: t.id,
    origin: "studio",
    issuerId: t.issuerSlug,
    issuerName,
    displayName: t.displayName,
    description: t.description,
    format: t.format,
    dataModel: t.format === "ldp_vc" ? t.dataModel : undefined,
    typeName: t.typeName,
    vct: t.format === "vc+sd-jwt" ? vctFor(t.syncedBaseUrl, t) : undefined,
    proof: t.format === "ldp_vc" ? t.ldpSuite : `SD-JWT ${signingAlgOf(t)}`,
    fields: t.fields.map((f) => ({ name: f.name, label: f.label, kind: f.kind, options: f.options, sample: f.example, selectivelyDisclosable: f.selectivelyDisclosable })),
    canIssue: true,
    configurationId: t.configId,
    expiresAt: t.expiresAt || undefined,
  };
}

export const externalTypeId = (issuerId: string, typeId: string) => `ext:${issuerId}/${typeId}`;
export const isExternalTypeId = (id: string) => id.startsWith("ext:");

/** Wallets and verifiers as the run builder sees them: the built-in ones plus those from the parties file. */
export interface WalletInfo {
  id: string;
  label: string;
  origin: "builtin" | "external";
  kind: "headless" | "mobile" | "web";
  /** A person scans QR codes (true), or the playground drives it (false). */
  interactive: boolean;
  /** Only the Reference Wallet can misbehave on purpose. */
  supportsTamper: boolean;
  /** Can hand over a whole credential for direct share (the Reference Wallet), or show one to a camera (people). */
  supportsDirectShare: boolean;
  note: string;
  description?: string;
  software?: string;
  homepage?: string;
  install?: { android?: string; ios?: string; web?: string };
  formats?: string[];
  protocols?: string[];
  /** Built-in wallets that cannot take part in runs (Inji Web 0.17 has no offer support). */
  runnable: boolean;
}

export interface VerifierInfo {
  id: string;
  label: string;
  origin: "builtin" | "external";
  /** Query languages the playground can ask it to use; external verifiers write their own requests. */
  accepts: ("presentation_exchange" | "dcql")[];
  /** External verifiers choose their own query language. */
  ownQuery: boolean;
  formats: string[];
  note: string;
  description?: string;
  software?: string;
  homepage?: string;
  /** Direct share (a credential's own QR code) is something only Inji Verify does here. */
  supportsDirectShare: boolean;
}

// --- Templates ----------------------------------------------------------------------------------------------

const WHOLE = /^\$\{([^}]+)\}$/;
const PART = /\$\{([^}]+)\}/g;

/** Look a dotted name up in the context: "claims.memberName", "saved.token". */
export function lookup(ctx: Record<string, unknown>, name: string): unknown {
  let cur: unknown = ctx;
  for (const p of name.split(".")) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

export class TemplateError extends Error {}

/**
 * Fill in placeholders. A string that is exactly one placeholder takes the value's own type (an object stays
 * an object); placeholders inside longer strings are inserted as text. Unknown names are an error, so a typo
 * in the config fails loudly instead of sending "undefined" to someone else's server.
 */
export function render(template: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    const whole = WHOLE.exec(template);
    if (whole) {
      const v = lookup(ctx, whole[1]!.trim());
      if (v === undefined) throw new TemplateError(`Unknown placeholder \${${whole[1]}}.`);
      return v;
    }
    return template.replace(PART, (_m, name: string) => {
      const v = lookup(ctx, name.trim());
      if (v === undefined) throw new TemplateError(`Unknown placeholder \${${name}}.`);
      return typeof v === "string" ? v : JSON.stringify(v);
    });
  }
  if (Array.isArray(template)) return template.map((t) => render(t, ctx));
  if (template && typeof template === "object") return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, render(v, ctx)]));
  return template;
}

/** Take a value out of a response with a save selector. */
export function select(selector: string, res: { body: unknown; text: string; headers: Record<string, string> }): unknown {
  if (selector === "$") return res.body ?? res.text;
  if (selector.startsWith("header:")) return res.headers[selector.slice(7).toLowerCase()];
  if (selector.startsWith("query:")) {
    const raw = typeof res.body === "string" ? res.body : res.text;
    const q = raw.trim().indexOf("?");
    if (q < 0) return undefined;
    return new URLSearchParams(raw.trim().slice(q + 1)).get(selector.slice(6)) ?? undefined;
  }
  return jsonPathIndexed(res.body, selector);
}

/** jsonPath with array indexes ($.wallets[0].id). */
function jsonPathIndexed(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (Array.isArray(cur) && /^\d+$/.test(p)) cur = cur[Number(p)];
    else if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}

export const isTruthyVerdict = (v: unknown) => v === true || v === "true" || v === "SUCCESS" || v === "VALID";
