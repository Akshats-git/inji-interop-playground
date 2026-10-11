/**
 * Automated interop matrix: runs every journey that needs no human (Reference Wallet) against a running
 * playground and writes a Markdown report. Used locally and by the nightly CI workflow.
 *
 *   pnpm --filter @playground/bff matrix                       # against http://127.0.0.1:8080
 *   PLAYGROUND_URL=http://host:8080 REPORT=../../docs/interop-report.md pnpm --filter @playground/bff matrix
 *
 * Exit code is non-zero when any journey does not behave as expected, except rows marked as known gaps.
 */
import { writeFileSync } from "node:fs";
import type { CredentialType, Run } from "@playground/core";

const BASE = (process.env.PLAYGROUND_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const REPORT = process.env.REPORT ?? "interop-report.md";

interface Row {
  id: string;
  type: string;
  verifier: "inji-verify" | "reference-verifier";
  query?: "presentation_exchange" | "dcql";
  mode?: "openid4vp-cross-device" | "direct-share";
  tamper?: string;
  requested?: string[];
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
  ...(["alter-claim", "wrong-nonce", "no-holder-proof", "foreign-holder"] as const).flatMap((tamper, i) => [
    { id: `T${i * 4 + 1}`, type: FARMER, verifier: "inji-verify" as const, tamper },
    { id: `T${i * 4 + 2}`, type: FARMER_SD, verifier: "inji-verify" as const, tamper, knownGap: tamper === "wrong-nonce" ? "G19" : tamper === "no-holder-proof" ? "G20" : undefined },
    { id: `T${i * 4 + 3}`, type: FARMER, verifier: "reference-verifier" as const, tamper },
    { id: `T${i * 4 + 4}`, type: FARMER_SD, verifier: "reference-verifier" as const, tamper },
  ]),
  { id: "T17", type: FARMER_SD, verifier: "inji-verify", tamper: "self-signed-sdjwt", knownGap: "G11" },
  { id: "T18", type: FARMER_SD, verifier: "reference-verifier", tamper: "self-signed-sdjwt" },
];

const CLAIMS: Record<string, Record<string, unknown>> = {
  [FARMER]: { fullName: "Ramesh Kumar", farmerId: "KA-MND-20931", primaryCropType: "Ragi", landAreaAcres: 3.5, district: "Mandya" },
  [FARMER_SD]: { fullName: "Ramesh Kumar", farmerId: "KA-MND-20931", primaryCropType: "Ragi", landAreaAcres: 3.5, district: "Mandya" },
  [DEGREE]: { fullName: "Asha Rao", degree: "B.Tech", major: "Computer Science", graduationDate: "2025-06-30" },
  [EXPIRED]: { holderName: "Asha Rao", cardNumber: "LIB-0042" },
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
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
      description: "Hard-coded to have expired on 1 Jan 2025, to test how verifiers treat expired credentials.",
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

async function runOne(row: Row, types: CredentialType[]): Promise<Run> {
  const type = types.find((t) => t.configId === row.type);
  if (!type) throw new Error(`credential type ${row.type} not found`);
  const run = await api<Run>("/runs", {
    method: "POST",
    body: JSON.stringify({
      typeId: type.id,
      wallet: "reference-wallet",
      verifier: row.verifier,
      query: row.query ?? "presentation_exchange",
      mode: row.mode ?? "openid4vp-cross-device",
      tamper: row.tamper ?? "none",
      requestedClaims: row.requested ?? (row.type === EXPIRED ? [] : ["primaryCropType"]),
      claims: CLAIMS[row.type],
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
    if (i >= 90) throw new Error(`demo credential types were not seeded within 3 minutes (missing ${needed.filter((id) => !types.some((t) => t.configId === id)).join(", ")})`);
    if (i === 0) console.log("waiting for the demo credential types to be seeded…");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main() {
  let types = await seededTypes();
  await ensureExpiredType(types);
  types = await api<CredentialType[]>("/types");
  const results: { row: Row; run?: Run; error?: string }[] = [];
  for (const row of ROWS) {
    // Certify fetches W3C contexts over the internet (gap G16), so retry once on a transient issuance error.
    let attempt = 0;
    for (;;) {
      try {
        const run = await runOne(row, types);
        if (run.status === "failed" && run.steps[0]?.status === "failed" && attempt++ < 1) continue;
        results.push({ row, run });
        console.log(`${row.id.padEnd(4)} ${icon(run)} ${run.labels.format.padEnd(9)} ${row.verifier.padEnd(18)} ${(row.tamper ?? "none").padEnd(17)} ${run.result?.verifierOutcome ?? "-"} ${run.result?.errorCode ?? ""}`);
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
    "Stack: Inji Certify 0.14.0 · Inji Verify 0.18.2 · Reference Wallet / Reference Verifier (playground).",
    "",
    "**Verdict** means *the journey behaved as expected*: honest presentations are accepted; tampered or expired ones are rejected.",
    "Rows marked with a gap id are known upstream problems described in [gaps.md](gaps.md).",
    "",
    "| # | Credential | Format | Verifier | Query | Mode | Tamper | Expected | Verifier outcome | Status / error | Verdict | Run |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const { row, run, error } of results) {
    if (!run) {
      lines.push(`| ${row.id} | ${row.type} | | ${row.verifier} | | | ${row.tamper ?? "none"} | | | ${error} | ⚠️ | |`);
      continue;
    }
    const r = run.result;
    const q = row.mode === "direct-share" ? "—" : run.spec.query === "dcql" ? "DCQL" : "PE";
    const fmt = `${run.labels.format}${run.labels.dataModel ? ` (DM ${run.labels.dataModel})` : ""}`;
    lines.push(
      `| ${row.id} | ${run.labels.typeName} | ${fmt} | ${run.labels.verifier} | ${q} | ${row.mode === "direct-share" ? "direct share" : "OpenID4VP"} | ${row.tamper ?? "none"} | ${r?.expected === "PASS" ? "accept" : "reject"} | ${r?.verifierOutcome ?? "—"} | ${r?.errorCode ?? r?.credentialStatus ?? ""} | ${icon(run)}${row.knownGap ? ` ${row.knownGap}` : ""} | \`${run.id}\` |`,
    );
  }
  const unexpected = results.filter((x) => !x.run || (x.run.result?.verdict !== "PASS" && !x.row.knownGap));
  const gaps = results.filter((x) => x.run?.result?.verdict !== "PASS" && x.row.knownGap);
  lines.push("", `**${results.length - unexpected.length - gaps.length}/${results.length}** behaved as expected · **${gaps.length}** known gaps · **${unexpected.length}** unexpected.`, "");
  writeFileSync(REPORT, lines.join("\n"));
  console.log(`\nwrote ${REPORT}: ${unexpected.length} unexpected`);
  process.exit(unexpected.length ? 1 : 0);
}

void main();
