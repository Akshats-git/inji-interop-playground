import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TAMPER_PRESETS, type Run, type TamperPreset } from "@playground/core";
import { api } from "../lib/api";
import { ago, formatLabel } from "../lib/format";
import { verdictMark } from "./RunBuilder";
import { cx, Empty, Field, PageHeader, Panel, Select } from "../components/ui";

/** Matrix columns: who verified, and how the holder presented. */
const COLUMNS = [
  { key: "inji-verify|pe", verifier: "Inji Verify", how: "OpenID4VP, PE" },
  { key: "inji-verify|dcql", verifier: "Inji Verify", how: "OpenID4VP, DCQL" },
  { key: "inji-verify|direct", verifier: "Inji Verify", how: "Direct share" },
  { key: "reference-verifier|pe", verifier: "Reference Verifier", how: "OpenID4VP, PE" },
  { key: "reference-verifier|dcql", verifier: "Reference Verifier", how: "OpenID4VP, DCQL" },
];

const columnOf = (r: Run) => `${r.spec.verifier}|${r.spec.mode === "direct-share" ? "direct" : r.spec.query === "dcql" ? "dcql" : "pe"}`;

function Cell({ run }: { run?: Run }) {
  if (!run) return <span className="text-sm text-muted">Not run</span>;
  const res = run.result;
  const outcome = res?.verifierOutcome === "ACCEPTED" ? "accepted" : res?.verifierOutcome === "REJECTED" ? "rejected" : res?.verifierOutcome === "NOT_REACHED" ? "stopped early" : "error";
  return (
    <Link to={`/runs/${run.id}`} className="group flex flex-col items-start gap-1 rounded px-1 py-0.5 hover:bg-sunken" title={res?.explanation}>
      {verdictMark(run)}
      <span className="text-xs text-muted group-hover:text-ink">Verifier {outcome}</span>
    </Link>
  );
}

function Matrix() {
  const q = useQuery({ queryKey: ["matrix"], queryFn: api.matrix, refetchInterval: 10_000 });
  const rows = useMemo(() => {
    const m = new Map<string, { typeName: string; format: string; tamper: TamperPreset; cells: Map<string, Run> }>();
    for (const { run } of q.data ?? []) {
      const key = [run.labels.typeName, run.labels.format, run.labels.dataModel, run.spec.tamper].join("|");
      const row = m.get(key) ?? { typeName: run.labels.typeName, format: formatLabel(run.labels.format, run.labels.dataModel), tamper: run.spec.tamper, cells: new Map() };
      const col = columnOf(run);
      const prev = row.cells.get(col);
      if (!prev || prev.createdAt < run.createdAt) row.cells.set(col, run);
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => a.typeName.localeCompare(b.typeName) || a.format.localeCompare(b.format) || (a.tamper === "none" ? -1 : b.tamper === "none" ? 1 : a.tamper.localeCompare(b.tamper)));
  }, [q.data]);

  const passed = rows.reduce((n, r) => n + [...r.cells.values()].filter((x) => x.result?.verdict === "PASS").length, 0);
  const total = rows.reduce((n, r) => n + r.cells.size, 0);

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
        <strong className="tabular text-ink">{passed}</strong> of <strong className="tabular text-ink">{total}</strong> combinations behaved as expected. A tamper row passes when the verifier rejects it.
      </p>
      <div className="overflow-x-auto rounded-[10px] border border-hairline bg-surface">
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline align-bottom">
              <th scope="col" className="px-3 py-2.5 text-sm font-bold">
                Credential and fault
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="border-l border-hairline px-3 py-2.5 text-sm">
                  <span className="block font-bold">{c.verifier}</span>
                  <span className="block font-medium text-muted">{c.how}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.typeName + r.format + r.tamper} className={cx("border-b border-hairline last:border-b-0", r.tamper !== "none" && "bg-present-soft/40")}>
                <th scope="row" className="px-3 py-2 align-top font-normal">
                  <span className="block font-bold">{r.typeName}</span>
                  <span className="block text-sm text-muted">{r.format}</span>
                  {r.tamper !== "none" && <span className="mt-0.5 block text-sm font-semibold text-present-ink">{TAMPER_PRESETS[r.tamper].label}</span>}
                </th>
                {COLUMNS.map((c) => (
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
  verifier: { label: "Verifier", options: [["", "Any"], ["inji-verify", "Inji Verify"], ["reference-verifier", "Reference Verifier"]] },
  format: { label: "Format", options: [["", "Any"], ["ldp_vc", "W3C JSON-LD"], ["vc+sd-jwt", "SD-JWT VC"]] },
  wallet: { label: "Wallet", options: [["", "Any"], ["reference-wallet", "Reference Wallet"], ["inji-wallet", "Inji Wallet"], ["external-wallet", "Other wallet"]] },
  status: { label: "Status", options: [["", "Any"], ["completed", "Completed"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["waiting", "Waiting"]] },
} as const;

function History() {
  const [params, setParams] = useSearchParams();
  const qs = new URLSearchParams([...params].filter(([k, v]) => k in FILTERS && v));
  qs.set("limit", "200");
  const q = useQuery({ queryKey: ["runs", "history", qs.toString()], queryFn: () => api.runs(`?${qs}`), refetchInterval: 10_000 });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Object.entries(FILTERS).map(([key, f]) => (
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
                {f.options.map(([v, l]) => (
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
        lede="The matrix shows the latest run for every combination of credential, verifier and presentation style. History lists every run, newest first."
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
