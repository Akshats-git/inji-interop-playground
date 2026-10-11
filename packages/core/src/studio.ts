/**
 * Issuer Studio model: what a user designs (issuer profiles, credential types) and how a design becomes
 * an Inji Certify `CredentialConfigurationDTO` (POST /credential-configurations).
 */
import { z } from "zod";

export const SLUG = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
/** Field names become Velocity variables and JSON keys, so keep them to a safe identifier alphabet. */
export const FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]{2,59}$/;
const RESERVED_FIELDS = new Set(["id", "type", "issuer", "holder", "proof", "validFrom", "validUntil", "credentialStatus", "cnf", "vct", "iss", "iat", "exp", "nbf", "sub", "_sd", "_sd_alg"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

export const IssuerProfileInput = z.object({
  slug: z.string().regex(SLUG, "lowercase letters, digits and dashes (3–32 chars)"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(280).default(""),
  logoUrl: z.string().url().or(z.literal("")).default(""),
  backgroundColor: z.string().regex(HEX).default("#1F4D3A"),
  textColor: z.string().regex(HEX).default("#FFFFFF"),
});
export type IssuerProfileInput = z.infer<typeof IssuerProfileInput>;
export type IssuerProfile = IssuerProfileInput & { id: string; createdAt: string };

export const FieldKind = z.enum(["text", "number", "date", "boolean", "choice"]);
export type FieldKind = z.infer<typeof FieldKind>;

export const FieldDef = z
  .object({
    name: z.string().regex(FIELD_NAME, "start with a letter; letters, digits, _ only"),
    label: z.string().trim().min(1).max(60),
    kind: FieldKind.default("text"),
    options: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    required: z.boolean().default(true),
    /** SD-JWT only: the claim is hashed into `_sd` and revealed through a disclosure. */
    selectivelyDisclosable: z.boolean().default(true),
    example: z.string().max(200).optional(),
  })
  .refine((f) => !RESERVED_FIELDS.has(f.name), { message: "this name is reserved by the VC data model", path: ["name"] })
  .refine((f) => f.kind !== "choice" || (f.options?.length ?? 0) >= 2, { message: "a choice needs at least two options", path: ["options"] });
export type FieldDef = z.infer<typeof FieldDef>;

export const Format = z.enum(["ldp_vc", "vc+sd-jwt"]);
export type Format = z.infer<typeof Format>;

/** Linked-data proof suites Certify 0.14 can sign with, and the key algorithm behind each one. */
export const LDP_SUITES = {
  Ed25519Signature2020: "EdDSA",
  Ed25519Signature2018: "EdDSA",
  RsaSignature2018: "RS256",
  EcdsaSecp256k1Signature2019: "ES256K",
  EcdsaKoblitzSignature2016: "ES256K",
  EcdsaSecp256r1Signature2019: "ES256",
  "eddsa-rdfc-2022": "EdDSA",
  "ecdsa-rdfc-2019": "ES256K",
} as const satisfies Record<string, SigningAlg>;
export type LdpSuite = keyof typeof LDP_SUITES;
export const SD_JWT_ALGS = ["ES256", "EdDSA", "RS256", "ES256K"] as const;
export type SigningAlg = "EdDSA" | "RS256" | "ES256" | "ES256K";

/** Certify's default key-alias map (mosip.certify.signature-algo.key-alias-mapper). */
export const KEY_ALIASES: Record<SigningAlg, { appId: string; refId: string }> = {
  RS256: { appId: "CERTIFY_VC_SIGN_RSA", refId: "" },
  EdDSA: { appId: "CERTIFY_VC_SIGN_ED25519", refId: "ED25519_SIGN" },
  ES256K: { appId: "CERTIFY_VC_SIGN_EC_K1", refId: "EC_SECP256K1_SIGN" },
  ES256: { appId: "CERTIFY_VC_SIGN_EC_R1", refId: "EC_SECP256R1_SIGN" },
};

export const CredentialTypeInput = z
  .object({
    issuerSlug: z.string().regex(SLUG),
    typeName: z.string().regex(TYPE_NAME, "PascalCase, e.g. KarnatakaFarmerCard"),
    displayName: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280).default(""),
    format: Format,
    dataModel: z.enum(["1.1", "2.0"]).default("2.0"),
    ldpSuite: z.enum(Object.keys(LDP_SUITES) as [LdpSuite, ...LdpSuite[]]).default("Ed25519Signature2020"),
    sdJwtAlg: z.enum(SD_JWT_ALGS).default("ES256"),
    fields: z.array(FieldDef).min(1).max(30),
    /** Status-list revocation; Certify only attaches credentialStatus to Data Model 2.0 credentials. */
    revocable: z.boolean().default(false),
    /**
     * W3C allows `issuer` as a URL string or as an object with an id (and a name). Inji Verify 0.18.2 only
     * accepts the string form (its validator cannot read a JSON object's id), so "string" is the default and
     * "object" exists to reproduce that gap.
     */
    issuerForm: z.enum(["string", "object"]).default("string"),
    /** ISO date to hard-code as the expiry (e.g. a past date to test "valid but expired"); empty = Certify's default (2 years). */
    expiresAt: z.string().datetime().or(z.literal("")).default(""),
  })
  .refine((t) => new Set(t.fields.map((f) => f.name)).size === t.fields.length, { message: "field names must be unique", path: ["fields"] });
export type CredentialTypeInput = z.infer<typeof CredentialTypeInput>;
export type CredentialType = CredentialTypeInput & {
  id: string;
  configId: string;
  createdAt: string;
  /** The PUBLIC_BASE_URL baked into this type's context and key URLs when it was last synced to Certify. */
  syncedBaseUrl: string;
};

export const signingAlgOf = (t: Pick<CredentialTypeInput, "format" | "ldpSuite" | "sdJwtAlg">): SigningAlg =>
  t.format === "ldp_vc" ? LDP_SUITES[t.ldpSuite] : t.sdJwtAlg;

/** Certify's credential_configuration_id: issuer-scoped so two issuers can both have a "StudentCard". */
export const configIdOf = (t: Pick<CredentialTypeInput, "issuerSlug" | "typeName" | "format">) =>
  `${t.issuerSlug}__${t.typeName}${t.format === "vc+sd-jwt" ? "__sdjwt" : ""}`;

export const W3C_V1 = "https://www.w3.org/2018/credentials/v1";
export const W3C_V2 = "https://www.w3.org/ns/credentials/v2";
export const ED25519_2020_CONTEXT = "https://w3id.org/security/suites/ed25519-2020/v1";

export interface PublicUrls {
  /** Context document defining this type's terms. */
  context: string;
  /** Issuer identifier placed in `issuer.id`. */
  issuerId: string;
  /** Base that Certify appends `#<kid>` to for `proof.verificationMethod` (Certify's `didUrl`). */
  keyBase: string;
  /** SD-JWT `vct` value. */
  vct: string;
}

/** Where a type's public artefacts live. did:web needs HTTPS, so plain-HTTP local runs use URL-based keys. */
export function publicUrlsFor(baseUrl: string, t: Pick<CredentialTypeInput, "issuerSlug" | "typeName" | "format" | "ldpSuite" | "sdJwtAlg">): PublicUrls {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(base);
  const issuerPath = `/pub/issuers/${t.issuerSlug}`;
  const alg = signingAlgOf(t);
  if (url.protocol === "https:") {
    const did = `did:web:${encodeURIComponent(url.host)}${(url.pathname.replace(/\/$/, "") + issuerPath).split("/").join(":")}`;
    return { context: `${base}/pub/contexts/${t.issuerSlug}/${t.typeName}.jsonld`, issuerId: did, keyBase: did, vct: `${base}${issuerPath}/types/${t.typeName}` };
  }
  return {
    context: `${base}/pub/contexts/${t.issuerSlug}/${t.typeName}.jsonld`,
    issuerId: `${base}${issuerPath}`,
    keyBase: `${base}${issuerPath}/keys/${alg}`,
    vct: `${base}${issuerPath}/types/${t.typeName}`,
  };
}

/** A JSON-LD context for the type: its terms map into an issuer-specific vocabulary. */
export function buildContextDocument(baseUrl: string, t: Pick<CredentialTypeInput, "issuerSlug" | "typeName" | "fields">) {
  const vocab = `${baseUrl.replace(/\/+$/, "")}/pub/issuers/${t.issuerSlug}/vocab#`;
  // Only the type's own terms: VCDM terms (id, type, name, description…) are protected by the base context.
  const terms: Record<string, unknown> = { [t.typeName]: `${vocab}${t.typeName}` };
  for (const f of t.fields) terms[f.name] = `${vocab}${f.name}`;
  return { "@context": { "@version": 1.1, ...terms } };
}

/** Literal text inside the template: JSON-escaped, with Velocity's `$` and `#` neutralised via Certify's EscapeTool. */
const literal = (s: string) => JSON.stringify(s).slice(1, -1).replace(/\$/g, "${_esc.d}").replace(/#/g, "${_esc.h}");

/**
 * The Velocity template Certify renders at issuance. Claims sent to /pre-authorized-data fill the field
 * placeholders; Certify supplies `_holderId`, `validFrom` and `validUntil`, and adds `id` (urn:uuid),
 * `credentialStatus` (DM 2.0 + revocation) or, for SD-JWT, `iss`/`cnf`/`vct` itself.
 * String claims go through `$_esc.java(...)` (JSON-compatible escaping; Certify's Velocity Tools has no json()) so a value containing quotes cannot break out of the JSON.
 */
export function buildVelocityTemplate(urls: PublicUrls, t: CredentialTypeInput, issuer: Pick<IssuerProfile, "name">): string {
  // Quiet references ($!) render an omitted optional claim as "" (strings) or null (numbers/booleans).
  const value = (f: FieldDef) =>
    f.kind === "number" || f.kind === "boolean"
      ? `#if("$!${f.name}" != "")$${f.name}#{else}null#end`
      : `"$!{_esc.java($${f.name})}"`;
  const claimLines = (indent: string) => t.fields.map((f) => `${indent}"${f.name}": ${value(f)}`).join(",\n");

  if (t.format === "vc+sd-jwt") {
    return ["{", `  "issuer_name": "${literal(issuer.name)}",`, claimLines("  "), "}"].join("\n");
  }

  const v2 = t.dataModel === "2.0";
  // Keep milliseconds: Certify's ledger parses validFrom with a fixed "...ss.SSS'Z'" pattern (gap G23).
  const iso = (d: Date) => `"${d.toISOString()}"`;
  const expiry = t.expiresAt ? iso(new Date(t.expiresAt)) : `"\${validUntil}"`;
  // A credential that is meant to be expired gets a validity window wholly in the past (one year long),
  // so it is consistent (validFrom before validUntil) and fails only on expiry.
  const pastExpiry = t.expiresAt && new Date(t.expiresAt).getTime() < Date.now();
  const start = pastExpiry ? iso(new Date(new Date(t.expiresAt).getTime() - 365 * 86400_000)) : `"\${validFrom}"`;
  return [
    "{",
    `  "@context": ${JSON.stringify(buildContextList(urls, t))},`,
    `  "type": ["VerifiableCredential", "${t.typeName}"],`,
    t.issuerForm === "object" ? `  "issuer": { "id": "${urls.issuerId}", "name": "${literal(issuer.name)}" },` : `  "issuer": "${urls.issuerId}",`,
    v2 ? `  "validFrom": ${start},` : `  "issuanceDate": ${start},`,
    v2 ? `  "validUntil": ${expiry},` : `  "expirationDate": ${expiry},`,
    `  "credentialSubject": {`,
    `    "id": "\${_holderId}",`,
    claimLines("    "),
    "  }",
    "}",
  ].join("\n");
}

export interface CertifyCredentialConfiguration {
  credentialConfigKeyId: string;
  vcTemplate: string;
  credentialFormat: Format;
  contextURLs?: string[];
  credentialTypes?: string[];
  sdJwtVct?: string;
  didUrl: string;
  keyManagerAppId: string;
  keyManagerRefId: string;
  signatureAlgo: SigningAlg;
  signatureCryptoSuite?: string;
  /** Comma-separated JSONPaths of selectively disclosable claims, e.g. "$.fullName,$.crop". */
  sdClaim?: string;
  metaDataDisplay: unknown[];
  displayOrder: string[];
  scope: string;
  credentialSubjectDefinition?: Record<string, unknown>;
  sdJwtClaims?: Record<string, unknown>;
  credentialStatusPurposes?: string[];
}

const toBase64 = (s: string) => {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};

/** The exact payload sent to Certify's POST /credential-configurations. */
export function buildCertifyConfiguration(baseUrl: string, t: CredentialTypeInput, issuer: IssuerProfile): CertifyCredentialConfiguration {
  const urls = publicUrlsFor(baseUrl, t);
  const alg = signingAlgOf(t);
  const keys = KEY_ALIASES[alg];
  const display = t.fields.map((f) => [f.name, { display: [{ name: f.label, locale: "en" }] }] as const);
  const common = {
    credentialConfigKeyId: configIdOf(t),
    vcTemplate: toBase64(buildVelocityTemplate(urls, t, issuer)),
    didUrl: urls.keyBase,
    keyManagerAppId: keys.appId,
    keyManagerRefId: keys.refId,
    signatureAlgo: alg,
    metaDataDisplay: [
      {
        name: t.displayName,
        locale: "en",
        logo: { url: issuer.logoUrl || `${baseUrl.replace(/\/+$/, "")}/pub/issuers/${issuer.slug}/logo.svg`, alt_text: `${issuer.name} logo` },
        background_color: issuer.backgroundColor,
        text_color: issuer.textColor,
        background_image: { uri: issuer.logoUrl || `${baseUrl.replace(/\/+$/, "")}/pub/issuers/${issuer.slug}/logo.svg` },
      },
    ],
    displayOrder: t.fields.map((f) => f.name),
    scope: configIdOf(t).toLowerCase(),
  };
  if (t.format === "vc+sd-jwt") {
    return {
      ...common,
      credentialFormat: "vc+sd-jwt",
      sdJwtVct: urls.vct,
      sdClaim: t.fields.filter((f) => f.selectivelyDisclosable).map((f) => `$.${f.name}`).join(","),
      sdJwtClaims: Object.fromEntries(t.fields.map((f) => [f.name, { display: [{ name: f.label, locale: "en" }] }])),
    };
  }
  return {
    ...common,
    credentialFormat: "ldp_vc",
    contextURLs: buildContextList(urls, t),
    credentialTypes: ["VerifiableCredential", t.typeName],
    signatureCryptoSuite: t.ldpSuite,
    credentialSubjectDefinition: Object.fromEntries(display),
    credentialStatusPurposes: t.revocable && t.dataModel === "2.0" ? ["revocation"] : undefined,
  };
}

/**
 * The VC's @context list. The Ed25519Signature2020 suite context is needed for both data models: the VCDM 2.0
 * base context does not define that proof type, and strict (safe-mode) JSON-LD processors reject the proof
 * without it, while lenient ones silently drop it from the signed data.
 */
export function buildContextList(urls: PublicUrls, t: Pick<CredentialTypeInput, "dataModel" | "ldpSuite">) {
  const v2 = t.dataModel === "2.0";
  return [v2 ? W3C_V2 : W3C_V1, urls.context, ...(t.ldpSuite === "Ed25519Signature2020" ? [ED25519_2020_CONTEXT] : [])];
}

/** Turn form input (strings) into typed claims for /pre-authorized-data, validating against the type. */
export function coerceClaims(t: Pick<CredentialTypeInput, "fields">, raw: Record<string, unknown>) {
  const claims: Record<string, string | number | boolean> = {};
  const errors: Record<string, string> = {};
  for (const f of t.fields) {
    const v = raw[f.name];
    if (v === undefined || v === null || v === "") {
      if (f.required) errors[f.name] = "required";
      continue;
    }
    switch (f.kind) {
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n)) claims[f.name] = n;
        else errors[f.name] = "must be a number";
        break;
      }
      case "boolean":
        claims[f.name] = v === true || v === "true";
        break;
      case "date":
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) claims[f.name] = String(v);
        else errors[f.name] = "use YYYY-MM-DD";
        break;
      case "choice":
        if (f.options?.includes(String(v))) claims[f.name] = String(v);
        else errors[f.name] = `one of: ${f.options?.join(", ")}`;
        break;
      default:
        claims[f.name] = String(v).slice(0, 500);
    }
  }
  return { claims, errors, ok: Object.keys(errors).length === 0 };
}
