import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Capabilities } from "../lib/api";
import { PhotoSizeLab } from "../components/QrLab";
import { cx, Empty, PageHeader, Panel } from "../components/ui";

type Proven = Capabilities["proven"][number];
type State = "proven" | "failing" | "untested";

interface Item {
  label: string;
  note?: string;
  /** Advertised by the product, or only tested by the playground. */
  claimed: boolean;
  rows: Proven[];
}

const stateOf = (i: Item): State =>
  i.rows.some((r) => r.accepted > 0) ? "proven" : i.rows.length ? "failing" : "untested";

function Station({ item, last, lane }: { item: Item; last: boolean; lane: "issue" | "present" }) {
  const s = stateOf(item);
  const accepted = item.rows.reduce((n, r) => n + r.accepted, 0);
  const rejected = item.rows.reduce((n, r) => n + r.rejected, 0);
  const latest = item.rows[0]?.lastRun;
  return (
    <li className="relative pb-4 pl-9 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className={cx(
            "absolute top-3 bottom-0 left-[9px] border-l-4",
            s === "proven"
              ? lane === "issue"
                ? "border-issue"
                : "border-present"
              : s === "failing"
                ? "border-dotted border-fail"
                : "border-dashed border-hairline",
          )}
        />
      )}
      <span
        aria-hidden
        className={cx(
          "absolute top-1 left-0 grid size-[22px] place-items-center rounded-full border-[3px] bg-surface text-xs leading-none font-black",
          s === "proven"
            ? "border-ink"
            : s === "failing"
              ? "border-fail text-fail"
              : "border-dashed border-muted",
        )}
      >
        {s === "failing" ? "✕" : ""}
      </span>
      <p className="font-bold">
        {item.label}
        {!item.claimed && (
          <span className="ml-2 rounded bg-sunken px-1.5 py-px text-xs font-semibold text-muted">
            not advertised
          </span>
        )}
      </p>
      <p className="text-sm text-muted">
        <span className="sr-only">
          {s === "proven" ? "Proven. " : s === "failing" ? "Tested and failing. " : "Not tested yet. "}
        </span>
        {s === "untested"
          ? "Claimed, not tested by any run yet."
          : `${accepted} accepted, ${rejected} rejected in honest runs.`}{" "}
        {latest && (
          <Link to={`/runs/${latest}`} className="text-issue underline">
            Latest run
          </Link>
        )}
      </p>
      {item.note && <p className="text-sm text-muted">{item.note}</p>}
    </li>
  );
}

function Line({ title, items, lane }: { title: string; items: Item[]; lane: "issue" | "present" }) {
  return (
    <div>
      <h3 className="mb-3 text-base">{title}</h3>
      <ol>
        {items.map((it, i) => (
          <Station key={it.label} item={it} last={i === items.length - 1} lane={lane} />
        ))}
      </ol>
    </div>
  );
}

function Legend() {
  const sample = (cls: string) => (
    <span aria-hidden className={cx("inline-block h-4 border-l-4 align-middle", cls)} />
  );
  return (
    <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
      <span className="flex items-center gap-2">{sample("border-ink")} Proven: a run was accepted</span>
      <span className="flex items-center gap-2">
        {sample("border-dotted border-fail")} Tested, never accepted
      </span>
      <span className="flex items-center gap-2">
        {sample("border-dashed border-muted")} Claimed, not tested yet
      </span>
    </p>
  );
}

function issuerLines(c: Capabilities) {
  const rows = c.proven;
  const by = (f: (r: Proven) => boolean) => rows.filter(f);
  const formats: Item[] = [
    {
      label: "W3C JSON-LD, VCDM 1.1",
      claimed: c.claimed.issuer.formats.includes("ldp_vc"),
      rows: by((r) => r.format.includes("DM 1.1")),
    },
    {
      label: "W3C JSON-LD, VCDM 2.0",
      claimed: c.claimed.issuer.formats.includes("ldp_vc"),
      rows: by((r) => r.format.includes("DM 2.0")),
    },
    {
      label: "IETF SD-JWT VC",
      claimed: c.claimed.issuer.formats.includes("vc+sd-jwt"),
      rows: by((r) => r.format.startsWith("vc+sd-jwt")),
    },
  ];
  const signatures: Item[] = [
    ...c.claimed.issuer.signingAlgorithms.map((s) => ({
      label: s.suite,
      note: `JSON-LD, ${s.alg} key`,
      claimed: true,
      rows: by((r) => r.proof === s.suite),
    })),
    ...c.claimed.issuer.sdJwtAlgorithms.map((a) => ({
      label: `SD-JWT signed ${a}`,
      claimed: true,
      rows: by((r) => r.proof === `SD-JWT ${a}`),
    })),
  ];
  return { formats, signatures };
}

function verifierLines(c: Capabilities) {
  // Only the bundled Inji Verify: a hosted one (MOSIP Collab's 1.0) has its own panel below.
  const inji = c.proven.filter((r) => r.verifier === c.claimed.verifier.name);
  const formats: Item[] = [
    { label: "W3C JSON-LD, VCDM 1.1", claimed: true, rows: inji.filter((r) => r.format.includes("DM 1.1")) },
    { label: "W3C JSON-LD, VCDM 2.0", claimed: true, rows: inji.filter((r) => r.format.includes("DM 2.0")) },
    { label: "IETF SD-JWT VC", claimed: true, rows: inji.filter((r) => r.format.startsWith("vc+sd-jwt")) },
  ];
  const presentation: Item[] = [
    {
      label: "OpenID4VP with Presentation Exchange",
      claimed: true,
      rows: inji.filter((r) => r.mode !== "direct-share" && r.query === "presentation_exchange"),
    },
    {
      label: "OpenID4VP with DCQL",
      note: "OpenID4VP 1.0 query language. Arrives in the Inji Verify 1.0 line.",
      claimed: c.claimed.verifier.queryLanguages.some((q) => /dcql/i.test(q)),
      rows: inji.filter((r) => r.query === "dcql"),
    },
    {
      label: "Direct share as a PixelPass QR",
      claimed: true,
      rows: inji.filter((r) => r.mode === "direct-share"),
    },
  ];
  const suites: Item[] = c.claimed.verifier.signatureSuites.map((s) => ({
    label: s,
    claimed: true,
    rows: inji.filter((r) => r.proof === s),
  }));
  return { formats, presentation, suites };
}

/** A hosted Inji (MOSIP Collab): what its verifier and issuers advertise, against what runs here proved. */
function HostedPanel({ h, proven }: { h: Capabilities["hosted"][number]; proven: Proven[] }) {
  const v = h.verifier;
  const items: Item[] = v
    ? [
        {
          label: "W3C JSON-LD, VCDM 1.1",
          claimed: v.formats.includes("ldp_vc"),
          rows: proven.filter((r) => r.format.includes("DM 1.1")),
        },
        {
          label: "W3C JSON-LD, VCDM 2.0",
          claimed: v.formats.includes("ldp_vc"),
          rows: proven.filter((r) => r.format.includes("DM 2.0")),
        },
        {
          label: "IETF SD-JWT VC (vc+sd-jwt and dc+sd-jwt)",
          claimed: v.formats.some((f) => f.includes("sd-jwt")),
          rows: proven.filter((r) => r.format.includes("sd-jwt")),
        },
        {
          label: "OpenID4VP with DCQL",
          claimed: v.queryLanguages.includes("DCQL"),
          rows: proven.filter((r) => r.mode !== "direct-share" && r.query === "dcql"),
        },
        {
          label: "OpenID4VP with Presentation Exchange",
          note: "The 1.0 line dropped it: Inji's policy is no fallback.",
          claimed: v.queryLanguages.includes("Presentation Exchange"),
          rows: proven.filter((r) => r.mode !== "direct-share" && r.query === "presentation_exchange"),
        },
        {
          label: "Direct share (v2 vc-verification)",
          claimed: true,
          rows: proven.filter((r) => r.mode === "direct-share"),
        },
      ]
    : [];
  return (
    <Panel title={`${h.name}${h.version ? `, Inji ${h.version}` : ""} (hosted)`}>
      <div className="grid gap-6 lg:grid-cols-2">
        {v && <Line title={`${v.name} verifies`} items={items} lane="present" />}
        <div>
          <h3 className="mb-3 text-base">Its issuers advertise</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {h.issuers.map((i) => (
              <li key={i.name} className="rounded-md border border-hairline px-3 py-2">
                <span className="font-bold">{i.name}</span>
                <span className="block text-muted">
                  OpenID4VCI {i.protocol}, {i.types} type{i.types === 1 ? "" : "s"}:{" "}
                  {i.formats.join(", ") || "none read"}
                  {i.error ? `. Metadata unreadable: ${i.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

function ProvenTable({ rows }: { rows: Proven[] }) {
  if (!rows.length)
    return <Empty title="Nothing proven yet">Every honest run that completes adds a row here.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="text-muted">
          <tr>
            {["Verifier", "Format", "Signature", "Presentation", "Accepted", "Rejected", ""].map((h) => (
              <th key={h} className="px-2 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={[r.verifier, r.format, r.proof, r.mode, r.query].join("|")}
              className="border-t border-hairline"
            >
              <td className="px-2 py-1.5 font-bold">{r.verifier}</td>
              <td className="px-2 py-1.5">{r.format}</td>
              <td className="px-2 py-1.5">{r.proof}</td>
              <td className="px-2 py-1.5">
                {r.mode === "direct-share"
                  ? "Direct share"
                  : r.query === "dcql"
                    ? "OpenID4VP, DCQL"
                    : "OpenID4VP, PE"}
              </td>
              <td className={cx("tabular px-2 py-1.5 font-bold", r.accepted ? "text-pass" : "text-muted")}>
                {r.accepted}
              </td>
              <td className={cx("tabular px-2 py-1.5 font-bold", r.rejected ? "text-fail" : "text-muted")}>
                {r.rejected}
              </td>
              <td className="px-2 py-1.5">
                <Link to={`/runs/${r.lastRun}`} className="text-issue underline">
                  Latest run
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CapabilitiesPage() {
  const q = useQuery({ queryKey: ["capabilities"], queryFn: api.capabilities, refetchInterval: 30_000 });
  const c = q.data;
  return (
    <>
      <PageHeader
        title="Claimed and proven"
        lede="What Inji Certify and Inji Verify say they support, set against what runs in this playground have actually shown. Only honest runs count; tamper runs are excluded."
      />
      {q.isLoading ? (
        <p className="text-muted">Reading issuer metadata and runs…</p>
      ) : !c ? (
        <Empty title="Capabilities could not be loaded">
          Check that the playground API is running, then reload.
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <Legend />
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={c.claimed.issuer.name}>
              <div className="flex flex-col gap-6">
                <Line title="Issues these formats" items={issuerLines(c).formats} lane="issue" />
                <Line title="Signs with" items={issuerLines(c).signatures} lane="issue" />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-hairline pt-4 text-sm">
                  <dt className="text-muted">Protocol</dt>
                  <dd>{c.claimed.issuer.protocol}</dd>
                  <dt className="text-muted">Grant types</dt>
                  <dd className="break-all">{c.claimed.issuer.grantTypes.join(", ") || "None advertised"}</dd>
                  <dt className="text-muted">Holder binding</dt>
                  <dd>{c.claimed.issuer.bindingMethods.join(", ") || "None advertised"}</dd>
                  <dt className="text-muted">Proof of possession</dt>
                  <dd>{c.claimed.issuer.proofTypes.join(", ") || "None advertised"}</dd>
                  <dt className="text-muted">Configurations</dt>
                  <dd className="tabular">{c.claimed.issuer.configurations} advertised in issuer metadata</dd>
                </dl>
              </div>
            </Panel>
            <Panel title={c.claimed.verifier.name}>
              <div className="flex flex-col gap-6">
                <Line title="Verifies these formats" items={verifierLines(c).formats} lane="present" />
                <Line
                  title="Receives presentations by"
                  items={verifierLines(c).presentation}
                  lane="present"
                />
                <Line
                  title="Checks these JSON-LD signatures"
                  items={verifierLines(c).suites}
                  lane="present"
                />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-hairline pt-4 text-sm">
                  <dt className="text-muted">Issuer keys from</dt>
                  <dd>{c.claimed.verifier.didMethods.join(", ")}</dd>
                  <dt className="text-muted">QR codes</dt>
                  <dd>{c.claimed.verifier.qr}</dd>
                </dl>
              </div>
            </Panel>
          </div>

          {c.hosted.map((h) => (
            <HostedPanel
              key={h.id}
              h={h}
              proven={c.proven.filter((r) => h.verifier && r.verifier === h.verifier.name)}
            />
          ))}

          <Panel title="QR Lab: will a photo fit?">
            <p className="mb-5 max-w-[68ch] text-sm text-muted">
              Direct share puts the whole credential in one QR code. Slide the photo size to see where the
              code stops being scannable by Inji Verify. The line marks QR versions 1 to 40; the stations are
              the documented limits.
            </p>
            <PhotoSizeLab />
          </Panel>

          <Panel title="Every proven combination">
            <ProvenTable rows={c.proven} />
          </Panel>
        </div>
      )}
    </>
  );
}
