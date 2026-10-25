/**
 * Automated interop matrix: runs every journey that needs no human (Reference Wallet) against a running
 * playground and writes a Markdown report. Used locally and by the nightly CI workflow.
 *
 *   pnpm --filter @playground/bff matrix                       # against http://127.0.0.1:8080
 *   PLAYGROUND_URL=http://host:8080 REPORT=../../docs/interop-report.md pnpm --filter @playground/bff matrix
 *
 * Exit code is non-zero when any journey does not behave as expected, except rows marked as known gaps.
 *
 * When the external lab is running (./playground.sh up --external) the X rows add journeys with parties from
 * infra/parties.yaml: the walt.id issuer, verifier and wallet, mixed with Inji Certify and Inji Verify.
 *
 * When MOSIP Collab is reachable (the environments entry of infra/parties.yaml) the C rows add journeys with its
 * real Inji 1.0 issuers, eSignet and Inji Verify 1.0, alone and crossed with the bundled 0.x stack. The Reference
 * Wallet signs in at Collab's eSignet with a published demo identity and the static test OTP.
 */
import { writeFileSync } from "node:fs";
import type { CatalogType, CredentialType, Run } from "@playground/core";

const BASE = (process.env.PLAYGROUND_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const REPORT = process.env.REPORT ?? "interop-report.md";

interface Row {
  id: string;
  /** A Studio configId, or an external type id ("ext:<issuer>/<type>"). */
  type: string;
  verifier: string;
  wallet?: string;
  query?: "presentation_exchange" | "dcql";
  mode?: "openid4vp-cross-device" | "direct-share";
  tamper?: string;
  /** How Inji Verify sends its request (default: signed, by request_uri). */
  verifyRequest?: "signed" | "by-value";
  requested?: string[];
  /** DCQL claim paths for W3C credentials (default: from the credential's root, as OpenID4VP 1.0 says). */
  dcqlPaths?: "spec" | "inji";
  /** Only meaningful when the bundle has a public URL (a hosted verifier must be able to fetch local issuer keys). */
  needsPublicUrl?: boolean;
  /** Expected to misbehave today; documented in docs/gaps.md. */
  knownGap?: string;
}

const FARMER = "agri-dept__KarnatakaFarmerCard";
const FARMER_SD = "agri-dept__KarnatakaFarmerCard__sdjwt";
const DEGREE = "veridonia-uni__UniversityDegree";
const EXPIRED = "veridonia-uni__ExpiredLibraryPass";

const ROWS: Row[] = [
  { id: "M1", type: FARMER, verifier: "inji-verify" },
  { id: "M2", type: DEGREE, verifier: "inji-verify", requested: ["degree"] },
  { id: "M3", type: FARMER_SD, verifier: "inji-verify" },
  { id: "M4", type: FARMER, verifier: "inji-verify", mode: "direct-share" },
  { id: "M5", type: FARMER_SD, verifier: "inji-verify", mode: "direct-share" },
  { id: "M6", type: FARMER, verifier: "reference-verifier" },
  { id: "M7", type: FARMER, verifier: "reference-verifier", query: "dcql" },
  { id: "M8", type: FARMER_SD, verifier: "reference-verifier" },
  { id: "M9", type: FARMER_SD, verifier: "reference-verifier", query: "dcql" },
  { id: "M10", type: DEGREE, verifier: "reference-verifier", requested: ["degree"] },
  { id: "M11", type: FARMER, verifier: "inji-verify", query: "dcql" },
  { id: "M12", type: EXPIRED, verifier: "inji-verify", requested: [] },
  { id: "M13", type: EXPIRED, verifier: "reference-verifier", requested: [] },
  { id: "M14", type: FARMER, verifier: "inji-verify", verifyRequest: "by-value" },
  { id: "M15", type: FARMER_SD, verifier: "inji-verify", verifyRequest: "by-value" },
  ...(["alter-claim", "wrong-nonce", "no-holder-proof", "foreign-holder"] as const).flatMap((tamper, i) => [
    { id: `T${i * 4 + 1}`, type: FARMER, verifier: "inji-verify" as const, tamper },
    {
      id: `T${i * 4 + 2}`,
      type: FARMER_SD,
      verifier: "inji-verify" as const,
      tamper,
      knownGap: tamper === "wrong-nonce" ? "G19" : tamper === "no-holder-proof" ? "G20" : undefined,
    },
    { id: `T${i * 4 + 3}`, type: FARMER, verifier: "reference-verifier" as const, tamper },
    { id: `T${i * 4 + 4}`, type: FARMER_SD, verifier: "reference-verifier" as const, tamper },
  ]),
  { id: "T17", type: FARMER_SD, verifier: "inji-verify", tamper: "self-signed-sdjwt", knownGap: "G11" },
  { id: "T18", type: FARMER_SD, verifier: "reference-verifier", tamper: "self-signed-sdjwt" },
];

const LIB = "ext:waltid-demo/library-card";
const XDEG = "ext:waltid-demo/university-degree";
/** Journeys with external parties (walt.id), run when infra/parties.yaml's parties are reachable. */
const EXTERNAL_ROWS: Row[] = [
  { id: "X1", type: LIB, verifier: "inji-verify" },
  { id: "X2", type: LIB, verifier: "inji-verify", mode: "direct-share" },
  { id: "X3", type: XDEG, verifier: "inji-verify", requested: ["degree"] },
  { id: "X4", type: LIB, verifier: "reference-verifier" },
  { id: "X5", type: LIB, verifier: "reference-verifier", query: "dcql" },
  { id: "X6", type: LIB, verifier: "waltid-verifier" },
  { id: "X7", type: LIB, wallet: "waltid-wallet", verifier: "inji-verify", verifyRequest: "by-value" },
  { id: "X8", type: LIB, wallet: "waltid-wallet", verifier: "waltid-verifier" },
  { id: "X9", type: LIB, wallet: "waltid-wallet", verifier: "reference-verifier", knownGap: "G33" },
  { id: "X10", type: FARMER_SD, verifier: "waltid-verifier", knownGap: "G32" },
  { id: "X11", type: FARMER, wallet: "waltid-wallet", verifier: "inji-verify", knownGap: "G30" },
  { id: "X12", type: FARMER_SD, wallet: "waltid-wallet", verifier: "inji-verify", knownGap: "G30" },
  { id: "X13", type: LIB, verifier: "inji-verify", tamper: "alter-claim" },
  { id: "X14", type: LIB, verifier: "inji-verify", tamper: "self-signed-sdjwt", knownGap: "G11" },
  { id: "X15", type: LIB, verifier: "reference-verifier", tamper: "self-signed-sdjwt" },
  { id: "X16", type: LIB, verifier: "waltid-verifier", tamper: "wrong-nonce" },
  { id: "X17", type: LIB, verifier: "waltid-verifier", tamper: "alter-claim" },
  { id: "X18", type: LIB, wallet: "waltid-wallet", verifier: "inji-verify", knownGap: "G35" },
];

const MOCK = "hosted:collab/mock/MockVerifiableCredential";
const MOCK2 = "hosted:collab/mock/MockVerifiableCredential_VCDM2.0";
const MOCK_SD = "hosted:collab/mock/MockVerifiableCredential_SD_JWT";
const C_FARMER = "hosted:collab/Farmer/FarmerCredential_VCDM2.0";
const C_LAND = "hosted:collab/Land/LandStatementCredential_VCDM2.0";
const ANIMO = "ext:animo-tax/tax-id";
/** Animo's hosted playground (Credo, dc+sd-jwt, OpenID4VCI 1.0), run when it answers over the internet. */
const ANIMO_ROWS: Row[] = [
  { id: "A1", type: ANIMO, verifier: "inji-verify" },
  { id: "A2", type: ANIMO, verifier: "inji-verify", mode: "direct-share" },
  { id: "A3", type: ANIMO, verifier: "collab-verify", query: "dcql" },
  { id: "A4", type: ANIMO, verifier: "inji-verify", tamper: "alter-claim" },
];
/** Journeys with MOSIP Collab (Inji 1.0.0-alpha.1), run when it is reachable from this machine. */
const COLLAB_ROWS: Row[] = [
  // All on Collab: its issuers, its eSignet, its Inji Verify 1.0.
  { id: "C1", type: MOCK_SD, verifier: "collab-verify", query: "dcql", requested: ["UIN"] },
  { id: "C2", type: MOCK, verifier: "collab-verify", query: "dcql", requested: [] },
  { id: "C3", type: MOCK, verifier: "collab-verify", query: "dcql", requested: ["email"], knownGap: "G36" },
  { id: "C4", type: MOCK, verifier: "collab-verify", query: "dcql", requested: ["email"], dcqlPaths: "inji" },
  { id: "C5", type: MOCK2, verifier: "collab-verify", query: "dcql", requested: [] },
  { id: "C6", type: C_FARMER, verifier: "collab-verify", query: "dcql", requested: [] },
  { id: "C7", type: C_LAND, verifier: "collab-verify", query: "dcql", requested: [], knownGap: "G41" },
  { id: "C8", type: MOCK_SD, verifier: "collab-verify", mode: "direct-share" },
  { id: "C9", type: MOCK, verifier: "collab-verify", query: "presentation_exchange", requested: [] },
  // Crossing the version split: Collab's 1.0 credentials at the bundled Verify 0.18.2, the bundled 0.14 ones at Verify 1.0.
  { id: "C10", type: MOCK, verifier: "inji-verify", requested: [] },
  { id: "C11", type: MOCK_SD, verifier: "inji-verify", requested: ["UIN"] },
  { id: "C12", type: FARMER_SD, verifier: "collab-verify", query: "dcql" },
  {
    id: "C13",
    type: FARMER,
    verifier: "collab-verify",
    query: "dcql",
    dcqlPaths: "inji",
    needsPublicUrl: true,
  },
  // The independent Reference Verifier.
  { id: "C14", type: MOCK_SD, verifier: "reference-verifier", query: "dcql", requested: ["UIN"] },
  { id: "C15", type: MOCK, verifier: "reference-verifier", query: "dcql", requested: [], knownGap: "G15" },
  // Tampering, against Inji Verify 1.0: which 0.18.2 weaknesses are fixed?
  {
    id: "C16",
    type: MOCK_SD,
    verifier: "collab-verify",
    query: "dcql",
    tamper: "wrong-nonce",
    requested: ["UIN"],
  },
  {
    id: "C17",
    type: MOCK_SD,
    verifier: "collab-verify",
    query: "dcql",
    tamper: "no-holder-proof",
    requested: ["UIN"],
  },
  {
    id: "C18",
    type: MOCK_SD,
    verifier: "collab-verify",
    query: "dcql",
    tamper: "self-signed-sdjwt",
    requested: ["UIN"],
    knownGap: "G11",
  },
  {
    id: "C19",
    type: MOCK_SD,
    verifier: "collab-verify",
    query: "dcql",
    tamper: "alter-claim",
    requested: ["dateOfBirth"],
  },
  {
    id: "C20",
    type: MOCK_SD,
    verifier: "collab-verify",
    query: "dcql",
    tamper: "foreign-holder",
    requested: ["UIN"],
  },
  { id: "C21", type: MOCK, verifier: "collab-verify", query: "dcql", tamper: "alter-claim", requested: [] },
];

const CLAIMS: Record<string, Record<string, unknown>> = {
  [FARMER]: {
    fullName: "Ramesh Kumar",
    farmerId: "KA-MND-20931",
    primaryCropType: "Ragi",
    landAreaAcres: 3.5,
    district: "Mandya",
  },
  [FARMER_SD]: {
    fullName: "Ramesh Kumar",
    farmerId: "KA-MND-20931",
    primaryCropType: "Ragi",
    landAreaAcres: 3.5,
    district: "Mandya",
  },
  [DEGREE]: {
    fullName: "Asha Rao",
    degree: "B.Tech",
    major: "Computer Science",
    graduationDate: "2025-06-30",
  },
  [EXPIRED]: { holderName: "Asha Rao", cardNumber: "LIB-0042" },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

/** The matrix needs one credential type that is already expired; create it on first use. */
async function ensureExpiredType(types: CredentialType[]) {
  if (types.some((t) => t.configId === EXPIRED)) return;
  await api("/types", {
    method: "POST",
    body: JSON.stringify({
      issuerSlug: "veridonia-uni",
      typeName: "ExpiredLibraryPass",
      displayName: "Library Pass (expired)",
      description:
        "Hard-coded to have expired on 1 Jan 2025, to test how verifiers treat expired credentials.",
      format: "ldp_vc",
      dataModel: "2.0",
      expiresAt: "2025-01-01T00:00:00.000Z",
      fields: [
        { name: "holderName", label: "Holder" },
        { name: "cardNumber", label: "Card number" },
      ],
    }),
  });
}

async function runOne(row: Row, types: CredentialType[], catalog: CatalogType[]): Promise<Run> {
  const external = catalog.find((t) => t.id === row.type);
  const type = external ?? types.find((t) => t.configId === row.type);
  if (!type) throw new Error(`credential type ${row.type} not found`);
  const claims = external
    ? Object.fromEntries(external.fields.map((f) => [f.name, f.sample ?? "Sample"]))
    : CLAIMS[row.type];
  const run = await api<Run>("/runs", {
    method: "POST",
    body: JSON.stringify({
      typeId: type.id,
      wallet: row.wallet ?? "reference-wallet",
      verifier: row.verifier,
      query: row.query ?? "presentation_exchange",
      mode: row.mode ?? "openid4vp-cross-device",
      tamper: row.tamper ?? "none",
      verifyRequest: row.verifyRequest ?? "signed",
      dcqlPaths: row.dcqlPaths ?? "spec",
      requestedClaims:
        row.requested ??
        (row.type === EXPIRED ? [] : external ? [external.fields[0]!.name] : ["primaryCropType"]),
      claims,
    }),
  });
  for (let i = 0; i < 120; i++) {
    const r = await api<Run>(`/runs/${run.id}`);
    if (r.status !== "running" && r.status !== "waiting") return r;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`run ${run.id} did not finish`);
}

const icon = (r: Run) => (r.result?.verdict === "PASS" ? "✅" : "❌");

/** On a fresh stack the demo types are seeded in the background once Certify is up; wait for them. */
async function seededTypes(): Promise<CredentialType[]> {
  const needed = [FARMER, FARMER_SD, DEGREE];
  for (let i = 0; ; i++) {
    const types = await api<CredentialType[]>("/types").catch(() => [] as CredentialType[]);
    if (needed.every((id) => types.some((t) => t.configId === id))) return types;
    if (i >= 90)
      throw new Error(
        `demo credential types were not seeded within 3 minutes (missing ${needed.filter((id) => !types.some((t) => t.configId === id)).join(", ")})`,
      );
    if (i === 0) console.log("waiting for the demo credential types to be seeded…");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  let types = await seededTypes();
  await ensureExpiredType(types);
  types = await api<CredentialType[]>("/types");
  const catalog = await api<CatalogType[]>("/catalog");
  const status = await api<{
    mode: string;
    parties: { configured: number; reachable: number };
    hosted?: { id: string; reachable: boolean }[];
  }>("/status");
  const withExternal =
    catalog.some((t) => t.id === LIB) &&
    status.parties.configured > 0 &&
    status.parties.reachable === status.parties.configured;
  if (!withExternal)
    console.log(
      "external lab not running: skipping the X rows (./playground.sh up --external to include them)",
    );
  const withCollab =
    Boolean(status.hosted?.some((h) => h.id === "collab" && h.reachable)) &&
    catalog.some((t) => t.id === MOCK && t.canIssue);
  if (!withCollab)
    console.log("MOSIP Collab not reachable (or its test client key missing): skipping the C rows");
  const withAnimo =
    catalog.some((t) => t.id === ANIMO && t.canIssue) &&
    Boolean(status.hosted?.some((h) => h.id === "collab" && h.reachable));
  if (!withAnimo)
    console.log("Animo's playground not reachable (or Collab down for A3): skipping the A rows");
  const collabRows = COLLAB_ROWS.filter((r) => !r.needsPublicUrl || status.mode === "public");
  // ONLY=C7,C19 reruns just those rows (the report then lists only them), for chasing one result.
  const only = process.env.ONLY?.split(",").map((x) => x.trim());
  const rows = [
    ...ROWS,
    ...(withExternal ? EXTERNAL_ROWS : []),
    ...(withCollab ? collabRows : []),
    ...(withAnimo ? ANIMO_ROWS : []),
  ].filter((r) => !only || only.includes(r.id));
  const results: { row: Row; run?: Run; error?: string }[] = [];
  for (const row of rows) {
    // Certify fetches W3C contexts over the internet (gap G16), so retry once on a transient issuance error.
    let attempt = 0;
    for (;;) {
      try {
        const run = await runOne(row, types, catalog);
        if (run.status === "failed" && run.steps[0]?.status === "failed" && attempt++ < 1) continue;
        results.push({ row, run });
        console.log(
          `${row.id.padEnd(4)} ${icon(run)} ${run.labels.format.padEnd(9)} ${(row.wallet ?? "reference-wallet").padEnd(17)} ${row.verifier.padEnd(18)} ${(row.tamper ?? "none").padEnd(17)} ${run.result?.verifierOutcome ?? "-"} ${run.result?.errorCode ?? ""}`,
        );
        break;
      } catch (e) {
        results.push({ row, error: (e as Error).message });
        console.log(`${row.id} error ${(e as Error).message}`);
        break;
      }
    }
  }

  const lines = [
    "# Interop report",
    "",
    `Generated ${new Date().toISOString()} by \`apps/bff/scripts/matrix.ts\` against ${BASE}.`,
    `Stack: Inji Certify 0.14.0, Inji Verify 0.18.2, the playground's Reference Wallet and Reference Verifier${withExternal ? ", the external parties in infra/parties.yaml (walt.id issuer-api, verifier-api and wallet-api 1.0.0)" : ""}${withCollab ? ", MOSIP Collab (Inji 1.0.0-alpha.1: its Certify issuers, eSignet and Inji Verify 1.0, reached over the internet)" : ""}${withAnimo ? ", and Animo's hosted OpenID4VC playground (Credo)" : ""}.`,
    "",
    "**Verdict** means *the journey behaved as expected*: honest presentations are accepted, and tampered or expired ones are rejected.",
    "Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).",
    "",
    "| # | Credential | Issuer | Format | Wallet | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { row, run, error } of results) {
    if (!run) {
      lines.push(
        `| ${row.id} | ${row.type} | | | ${row.wallet ?? "reference-wallet"} | ${row.verifier} | | | ${row.tamper ?? "none"} | | | ${error} | ⚠️ | |`,
      );
      continue;
    }
    const r = run.result;
    const q =
      row.mode === "direct-share"
        ? "n/a"
        : run.labels.external?.verifier
          ? "own"
          : run.spec.query === "dcql"
            ? run.spec.dcqlPaths === "inji" && run.labels.format === "ldp_vc"
              ? "DCQL (Inji paths)"
              : "DCQL"
            : "PE";
    const fmt = `${run.labels.format}${run.labels.dataModel ? ` (DM ${run.labels.dataModel})` : ""}`;
    lines.push(
      `| ${row.id} | ${run.labels.typeName} | ${run.labels.issuerName}${run.labels.hosted?.issuer ? ` (${run.labels.hosted.issuer})` : ""} | ${fmt} | ${run.labels.wallet} | ${run.labels.verifier} | ${q} | ${row.mode === "direct-share" ? "direct share" : row.verifier === "inji-verify" && run.spec.query !== "dcql" ? `OpenID4VP, ${run.spec.verifyRequest === "by-value" ? "by value" : "signed request_uri"}` : "OpenID4VP"} | ${row.tamper ?? "none"} | ${r?.expected === "PASS" ? "accept" : "reject"} | ${r?.verifierOutcome ?? "n/a"} | ${r?.errorCode ?? r?.credentialStatus ?? ""} | ${icon(run)}${row.knownGap ? ` ${row.knownGap}` : ""} | \`${run.id}\` |`,
    );
  }
  const unexpected = results.filter((x) => !x.run || (x.run.result?.verdict !== "PASS" && !x.row.knownGap));
  const gaps = results.filter((x) => x.run?.result?.verdict !== "PASS" && x.row.knownGap);
  lines.push(
    "",
    `**${results.length - unexpected.length - gaps.length}/${results.length}** behaved as expected · **${gaps.length}** known gaps · **${unexpected.length}** unexpected.`,
    "",
  );
  writeFileSync(REPORT, lines.join("\n"));
  console.log(`\nwrote ${REPORT}: ${unexpected.length} unexpected`);
  process.exit(unexpected.length ? 1 : 0);
}

void main();
