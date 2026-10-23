import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { credentialStatusLabel, knownGapOf, TAMPER_PRESETS, type Run, type TamperPreset } from "@playground/core";
import { api } from "../lib/api";
import { ago, formatLabel } from "../lib/format";
import { verdictMark } from "./RunBuilder";
import { cx, Empty, Field, PageHeader, Panel, Select } from "../components/ui";

/** Built-in matrix columns: who verified, and how the holder presented. External verifiers add their own. */
const BASE_COLUMNS = [
  { key: "inji-verify|pe", verifier: "Inji Verify", how: "OpenID4VP, PE" },
  { key: "inji-verify|dcql", verifier: "Inji Verify", how: "OpenID4VP, DCQL" },
  { key: "inji-verify|direct", verifier: "Inji Verify", how: "Direct share" },
  { key: "reference-verifier|pe", verifier: "Reference Verifier", how: "OpenID4VP, PE" },
  { key: "reference-verifier|dcql", verifier: "Reference Verifier", how: "OpenID4VP, DCQL" },
];
/** Verifiers the playground writes requests for (built-in and hosted Inji Verify), split by how the holder presents. */
const how = (r: Run) => (r.spec.mode === "direct-share" ? "direct" : r.spec.query === "dcql" ? "dcql" : "pe");
const HOW_LABEL = { direct: "Direct share", dcql: "OpenID4VP, DCQL", pe: "OpenID4VP, PE" } as const;
const ownRequest = (r: Run) => Boolean(r.labels.external?.verifier);
const columnOf = (r: Run) => (ownRequest(r) ? `${r.spec.verifier}|own` : `${r.spec.verifier}|${how(r)}`);

function Cell({ run }: { run?: Run }) {
  if (!run) return <span className="text-sm text-muted">Not run</span>;
  const res = run.result;
  const outcome = res?.verifierOutcome === "ACCEPTED" ? "accepted" : res?.verifierOutcome === "REJECTED" ? "rejected" : res?.verifierOutcome === "NOT_REACHED" ? "stopped early" : "error";
  const status = res?.verifierOutcome === "NOT_REACHED" ? undefined : credentialStatusLabel(res?.credentialStatus);
  return (
    <Link to={`/runs/${run.id}`} className="group flex flex-col items-start gap-1 rounded px-1 py-0.5 hover:bg-sunken" title={res?.explanation}>
      {verdictMark(run)}
      <span className="text-xs text-muted group-hover:text-ink">
        Verifier {outcome}
        {status ? ` (${status.toLowerCase()})` : ""}
      </span>
    </Link>
  );
}

function Matrix() {
  const q = useQuery({ queryKey: ["matrix"], queryFn: api.matrix, refetchInterval: 10_000 });
  const { rows, columns } = useMemo(() => {
    const m = new Map<string, { typeName: string; format: string; tamper: TamperPreset; wallet: string; externalWallet: boolean; cells: Map<string, Run> }>();
    const extraColumns = new Map<string, { key: string; verifier: string; how: string }>();
    for (const { run } of q.data ?? []) {
      // One row per credential, fault and wallet: two wallets must never share (and overwrite) a cell.
      const key = [run.labels.typeName, run.labels.format, run.labels.dataModel, run.spec.tamper, run.spec.wallet].join("|");
      const row = m.get(key) ?? { typeName: run.labels.typeName, format: formatLabel(run.labels.format, run.labels.dataModel), tamper: run.spec.tamper, wallet: run.labels.wallet, externalWallet: Boolean(run.labels.external?.wallet), cells: new Map() };
      const col = columnOf(run);
      if (col.endsWith("|own")) extraColumns.set(col, { key: col, verifier: run.labels.verifier, how: "OpenID4VP, its own request" });
      else if (!BASE_COLUMNS.some((c) => c.key === col)) extraColumns.set(col, { key: col, verifier: run.labels.verifier, how: HOW_LABEL[how(run)] });
      const prev = row.cells.get(col);
      if (!prev || prev.createdAt < run.createdAt) row.cells.set(col, run);
      m.set(key, row);
    }
    const sorted = [...m.values()].sort(
      (a, b) =>
        a.typeName.localeCompare(b.typeName) ||
        a.format.localeCompare(b.format) ||
        Number(a.externalWallet) - Number(b.externalWallet) ||
        a.wallet.localeCompare(b.wallet) ||
        (a.tamper === "none" ? -1 : b.tamper === "none" ? 1 : a.tamper.localeCompare(b.tamper)),
    );
    return { rows: sorted, columns: [...BASE_COLUMNS, ...[...extraColumns.values()].sort((a, b) => a.key.localeCompare(b.key))] };
  }, [q.data]);

  const cells = rows.flatMap((r) => [...r.cells.values()]);
  const passed = cells.filter((x) => x.result?.verdict === "PASS").length;
  const gaps = cells.filter((x) => x.result?.verdict === "FAIL" && knownGapOf(x)).length;
  const unexpected = cells.length - passed - gaps;

  if (q.isLoading) return <p className="text-muted">Loading the matrix…</p>;
  if (!rows.length)
    return (
      <Empty title="No finished runs yet">
        <Link to="/" className="text-issue underline">Start a run</Link>, or fill the whole matrix from a terminal with <code className="font-mono">npx tsx scripts/matrix.ts</code> in apps/bff.
      </Empty>
    );

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Of <strong className="tabular text-ink">{cells.length}</strong> combinations, <strong className="tabular text-ink">{passed}</strong> behaved as expected,{" "}
        <strong className="tabular text-ink">{gaps}</strong> reproduce a known gap (docs/gaps.md) and <strong className="tabular text-ink">{unexpected}</strong> are unexpected. A tamper row passes when the verifier rejects it.
      </p>
      <div className="overflow-x-auto rounded-[10px] border border-hairline bg-surface">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline align-bottom">
              <th scope="col" className="px-3 py-2.5 text-sm font-bold">
                Credential, wallet and fault
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="border-l border-hairline px-3 py-2.5 text-sm">
                  <span className="block font-bold">{c.verifier}</span>
                  <span className="block font-medium text-muted">{c.how}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.typeName + r.format + r.tamper + r.wallet} className={cx("border-b border-hairline last:border-b-0", r.tamper !== "none" && "bg-present-soft/40")}>
                <th scope="row" className="px-3 py-2 align-top font-normal">
                  <span className="block font-bold">{r.typeName}</span>
                  <span className="block text-sm text-muted">{r.format}</span>
                  <span className="block text-sm text-muted">
                    Wallet: <span className={cx(r.externalWallet && "font-semibold text-ink")}>{r.wallet}</span>
                  </span>
                  {r.tamper !== "none" && <span className="mt-0.5 block text-sm font-semibold text-present-ink">{TAMPER_PRESETS[r.tamper].label}</span>}
                </th>
                {columns.map((c) => (
                  <td key={c.key} className="border-l border-hairline px-2 py-2 align-top">
                    <Cell run={r.cells.get(c.key)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const FILTERS = {
  verdict: { label: "Outcome", options: [["", "Any"], ["PASS", "As expected"], ["FAIL", "Unexpected"]] },
  verifier: { label: "Verifier", options: [["", "Any"]] },
  format: { label: "Format", options: [["", "Any"], ["ldp_vc", "W3C JSON-LD"], ["vc+sd-jwt", "SD-JWT VC"]] },
  wallet: { label: "Wallet", options: [["", "Any"]] },
  status: { label: "Status", options: [["", "Any"], ["completed", "Completed"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["waiting", "Waiting"]] },
} as const satisfies Record<string, { label: string; options: readonly (readonly [string, string])[] }>;

function History() {
  const [params, setParams] = useSearchParams();
  // Wallets and verifiers come from the registry, so external ones from the parties file can be filtered too.
  const parties = useQuery({ queryKey: ["parties"], queryFn: api.parties });
  const optionsFor = (key: keyof typeof FILTERS): readonly (readonly [string, string])[] =>
    key === "wallet"
      ? [["", "Any"], ...(parties.data?.wallets ?? []).filter((w) => w.runnable).map((w) => [w.id, w.label] as const)]
      : key === "verifier"
        ? [["", "Any"], ...(parties.data?.verifiers ?? []).map((v) => [v.id, v.label] as const)]
        : FILTERS[key].options;
  const qs = new URLSearchParams([...params].filter(([k, v]) => k in FILTERS && v));
  qs.set("limit", "200");
  const q = useQuery({ queryKey: ["runs", "history", qs.toString()], queryFn: () => api.runs(`?${qs}`), refetchInterval: 10_000 });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {(Object.entries(FILTERS) as [keyof typeof FILTERS, (typeof FILTERS)[keyof typeof FILTERS]][]).map(([key, f]) => (
          <Field key={key} label={f.label}>
            {(id) => (
              <Select
                id={id}
                value={params.get(key) ?? ""}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set(key, e.target.value);
                  else next.delete(key);
                  setParams(next, { replace: true });
                }}
              >
                {optionsFor(key).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-muted">Loading runs…</p>
      ) : !q.data?.length ? (
        <Empty title="No runs match these filters">Clear a filter, or start a new run.</Empty>
      ) : (
        <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
          {q.data.map((r) => (
            <li key={r.id}>
              <Link to={`/runs/${r.id}`} className="grid gap-x-4 gap-y-1 px-3 py-2.5 hover:bg-sunken sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block font-bold">{r.labels.typeName}</span>
                  <span className="block text-sm text-muted">
                    {formatLabel(r.labels.format, r.labels.dataModel)}, {r.labels.wallet} to {r.labels.verifier}
                    {r.spec.mode === "direct-share" ? ", direct share" : r.spec.query === "dcql" ? ", DCQL" : ", PE"}
                    {r.spec.tamper !== "none" && <span className="font-semibold text-present-ink">. Tamper: {TAMPER_PRESETS[r.spec.tamper].label.toLowerCase()}</span>}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs whitespace-nowrap text-muted">{ago(r.createdAt)}</span>
                  {verdictMark(r)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const [tab, setTab] = useState<"matrix" | "history">("matrix");
  return (
    <>
      <PageHeader
        title="Results"
        lede="The matrix shows the latest run for every combination of credential, wallet, verifier and presentation style. History lists every run, newest first."
        action={
          <div role="tablist" aria-label="Results view" className="flex gap-1 rounded-md bg-sunken p-1">
            {(["matrix", "history"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("rounded px-4 py-1.5 text-sm font-bold capitalize", tab === t ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}>
                {t}
              </button>
            ))}
          </div>
        }
      />
      <Panel>{tab === "matrix" ? <Matrix /> : <History />}</Panel>
    </>
  );
}
