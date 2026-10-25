/**
 * Query Builder: one form, two query languages.
 *
 * - Presentation Exchange 2.0 (`presentation_definition`), spoken by OpenID4VP drafts 21 to 23 and Inji 0.x.
 * - DCQL (`dcql_query`), spoken by OpenID4VP 1.0 and Inji 1.0-alpha.
 *
 * Both have a dialect question for W3C credentials. PE: Inji filters `$.type` with a regex pattern, the spec with
 * JSON Schema (gap G13). DCQL: OpenID4VP 1.0 evaluates claim paths from the credential's root
 * (`["credentialSubject", "x"]`, Appendix B.1.2), while Inji's "Transition from PEX to DCQL" guide and Inji Verify
 * 1.0 evaluate them from credentialSubject (`["x"]`, gap G36). Spec style is the default; Inji style reproduces
 * what Inji Verify 1.0 expects.
 */
import type { CredentialFormat } from "./model.js";

export interface QuerySpec {
  id: string;
  purpose: string;
  format: CredentialFormat;
  /** ldp_vc: the credential's type (e.g. KarnatakaFarmerCard). */
  typeName?: string;
  /** ldp_vc: the type's expanded IRI, for DCQL's type_values (the short name is used when it is unknown). */
  typeIri?: string;
  /** SD-JWT: the exact vct value. */
  vct?: string;
  /** Claim names under credentialSubject (ldp_vc) or top level (SD-JWT). Empty = whole credential. */
  claims: string[];
  /** ldp_vc proof types the verifier accepts. */
  proofTypes?: string[];
  /** SD-JWT issuer-signature algorithms the verifier accepts. */
  sdJwtAlgs?: string[];
  requireHolderBinding: boolean;
}

/**
 * How a PE type filter is written.
 * - "inji": `{type: "object", pattern: "X"}` on `$.type`, the idiom Inji Verify's bundled definitions and
 *   Inji Wallet's matcher use. It is not valid JSON Schema for an array value.
 * - "spec": `{type: "array", contains: {const: "X"}}`, the JSON Schema way the PE spec examples use.
 */
export type PeDialect = "inji" | "spec";

/** Where DCQL claim paths start for W3C credentials: the credential's root (OpenID4VP 1.0) or credentialSubject (Inji). */
export type DcqlPathStyle = "spec" | "inji";

export interface PresentationDefinition {
  id: string;
  purpose?: string;
  format?: Record<string, unknown>;
  input_descriptors: {
    id: string;
    name?: string;
    purpose?: string;
    format?: Record<string, unknown>;
    constraints: {
      limit_disclosure?: "required" | "preferred";
      fields: { path: string[]; filter?: Record<string, unknown>; optional?: boolean }[];
    };
  }[];
}

export interface DcqlQuery {
  credentials: {
    id: string;
    format: string;
    meta?: { type_values?: string[][]; vct_values?: string[] };
    claims?: { id?: string; path: (string | number | null)[]; values?: unknown[] }[];
    require_cryptographic_holder_binding?: boolean;
    multiple?: boolean;
  }[];
  credential_sets?: { options: string[][]; required?: boolean }[];
}

const DEFAULT_PROOF_TYPES = [
  "Ed25519Signature2020",
  "Ed25519Signature2018",
  "RsaSignature2018",
  "EcdsaSecp256k1Signature2019",
  "EcdsaSecp256r1Signature2019",
];
const DEFAULT_SD_ALGS = ["ES256", "EdDSA", "RS256", "ES256K"];

function formatBlock(spec: QuerySpec) {
  return spec.format === "ldp_vc"
    ? { ldp_vc: { proof_type: spec.proofTypes?.length ? spec.proofTypes : DEFAULT_PROOF_TYPES } }
    : {
        "vc+sd-jwt": {
          "sd-jwt_alg_values": spec.sdJwtAlgs?.length ? spec.sdJwtAlgs : DEFAULT_SD_ALGS,
          "kb-jwt_alg_values": DEFAULT_SD_ALGS,
        },
      };
}

export function toPresentationDefinition(
  spec: QuerySpec,
  dialect: PeDialect = "inji",
): PresentationDefinition {
  const fields: PresentationDefinition["input_descriptors"][number]["constraints"]["fields"] = [];
  if (spec.format === "ldp_vc") {
    fields.push({
      path: ["$.type"],
      filter:
        dialect === "inji"
          ? { type: "object", pattern: spec.typeName }
          : { type: "array", contains: { const: spec.typeName } },
    });
    for (const c of spec.claims) fields.push({ path: [`$.credentialSubject.${c}`] });
  } else {
    fields.push({
      path: ["$.vct"],
      filter:
        dialect === "inji"
          ? { type: "string", pattern: escapeRegex(spec.vct ?? "") }
          : { type: "string", const: spec.vct },
    });
    for (const c of spec.claims) fields.push({ path: [`$.${c}`] });
  }
  const fmt = formatBlock(spec);
  return {
    id: spec.id,
    purpose: spec.purpose,
    format: fmt,
    input_descriptors: [
      {
        id: `${spec.id}-credential`,
        purpose: spec.purpose,
        format: fmt,
        constraints: {
          ...(spec.format === "vc+sd-jwt" && spec.claims.length
            ? { limit_disclosure: "required" as const }
            : {}),
          fields,
        },
      },
    ],
  };
}

export const W3C_VC_TYPE_IRI = "https://www.w3.org/2018/credentials#VerifiableCredential";

/**
 * DCQL for the same question. `type_values` must hold *expanded* type IRIs; the caller passes the
 * credential type's IRI (from its JSON-LD context) when it knows it. SD-JWT queries name the credential's own
 * media type (vc+sd-jwt or dc+sd-jwt) unless told otherwise.
 */
export function toDcql(
  spec: QuerySpec,
  opts: { format?: "vc+sd-jwt" | "dc+sd-jwt"; typeIri?: string; pathStyle?: DcqlPathStyle } = {},
): DcqlQuery {
  const id = `${spec.id}-credential`;
  if (spec.format === "ldp_vc") {
    return {
      credentials: [
        {
          id,
          format: "ldp_vc",
          meta: { type_values: [[W3C_VC_TYPE_IRI, opts.typeIri ?? spec.typeIri ?? spec.typeName ?? ""]] },
          claims: spec.claims.map((c) => ({
            path: opts.pathStyle === "inji" ? [c] : ["credentialSubject", c],
          })),
          require_cryptographic_holder_binding: spec.requireHolderBinding,
        },
      ],
    };
  }
  return {
    credentials: [
      {
        id,
        format: opts.format ?? (spec.format === "vc+sd-jwt" ? "vc+sd-jwt" : "dc+sd-jwt"),
        meta: { vct_values: [spec.vct ?? ""] },
        claims: spec.claims.map((c) => ({ path: [c] })),
        require_cryptographic_holder_binding: spec.requireHolderBinding,
      },
    ],
  };
}

/** The checks Inji Verify 1.0 applies when a DCQL request is created (e.g. DCQL_META_NOT_MATCHING_FORMAT). */
export function validateDcql(q: DcqlQuery): { code: string; message: string }[] {
  const errors: { code: string; message: string }[] = [];
  if (!q.credentials?.length)
    errors.push({
      code: "DCQL_EMPTY_CREDENTIALS",
      message: "A DCQL query needs at least one credential query.",
    });
  const ids = new Set<string>();
  for (const c of q.credentials ?? []) {
    if (ids.has(c.id))
      errors.push({ code: "DCQL_DUPLICATE_ID", message: `Credential query id "${c.id}" is used twice.` });
    ids.add(c.id);
    const sd = c.format === "vc+sd-jwt" || c.format === "dc+sd-jwt";
    if (c.meta?.vct_values && !sd)
      errors.push({
        code: "DCQL_META_NOT_MATCHING_FORMAT",
        message: `vct_values can only be used with SD-JWT formats, not ${c.format}.`,
      });
    if (c.meta?.type_values && c.format !== "ldp_vc")
      errors.push({
        code: "DCQL_META_NOT_MATCHING_FORMAT",
        message: `type_values can only be used with ldp_vc, not ${c.format}.`,
      });
  }
  for (const set of q.credential_sets ?? [])
    for (const opt of set.options)
      for (const ref of opt)
        if (!ids.has(ref))
          errors.push({
            code: "DCQL_UNKNOWN_CREDENTIAL_REF",
            message: `credential_sets refers to unknown id "${ref}".`,
          });
  return errors;
}

/** Field-by-field explanation of how the PE request maps onto DCQL, for the inspector. */
export function explainMapping(spec: QuerySpec): { pe: string; dcql: string; note: string }[] {
  const rows = [
    {
      pe: "input_descriptors[0]",
      dcql: "credentials[0]",
      note: "One input descriptor becomes one credential query.",
    },
    {
      pe: "format",
      dcql: "credentials[0].format",
      note: "Format moves from a capability map to a single value per credential.",
    },
  ];
  if (spec.format === "ldp_vc")
    rows.push({
      pe: "fields: $.type ∋ " + spec.typeName,
      dcql: "meta.type_values",
      note: "DCQL matches expanded JSON-LD type IRIs, not short names.",
    });
  else
    rows.push({
      pe: "fields: $.vct = …",
      dcql: "meta.vct_values",
      note: "Exact string match. DCQL has no vct inheritance.",
    });
  for (const c of spec.claims)
    rows.push({
      pe: spec.format === "ldp_vc" ? `$.credentialSubject.${c}` : `$.${c}`,
      dcql: JSON.stringify(spec.format === "ldp_vc" ? ["credentialSubject", c] : [c]),
      note:
        spec.format === "ldp_vc"
          ? `JSONPath strings become path arrays, from the credential's root (OpenID4VP 1.0, B.1.2). Inji's guide and Inji Verify 1.0 drop "credentialSubject" instead: ${JSON.stringify([c])} (gap G36).`
          : "JSONPath strings become path arrays.",
    });
  rows.push({
    pe: "acceptVPWithoutHolderProof (Inji config)",
    dcql: "require_cryptographic_holder_binding",
    note: "Holder binding becomes part of the query.",
  });
  return rows;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Evaluate a PE field filter the lenient way a wallet would (supports both dialects). */
export function filterMatches(filter: Record<string, unknown> | undefined, value: unknown): boolean {
  if (!filter) return value !== undefined;
  if (value === undefined) return false;
  const values = Array.isArray(value) ? value : [value];
  if ("const" in filter) return values.some((v) => v === filter.const);
  if (filter.contains && typeof filter.contains === "object") {
    const inner = filter.contains as Record<string, unknown>;
    return values.some((v) => filterMatches(inner, v));
  }
  if (typeof filter.pattern === "string") {
    const re = new RegExp(filter.pattern);
    return values.some((v) => typeof v === "string" && re.test(v));
  }
  if (Array.isArray(filter.enum)) return values.some((v) => (filter.enum as unknown[]).includes(v));
  return true;
}

/** Resolve a simple JSONPath ($.a.b, $['a']) against an object. */
export function jsonPath(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/^\$\.?/, "")
    .replace(/\[['"]?([^\]'"]+)['"]?\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[p];
    else return undefined;
  }
  return cur;
}
