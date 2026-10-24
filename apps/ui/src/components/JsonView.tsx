/** Readable, collapsible JSON with copy. Long strings fold so a 40 KB credential stays navigable. */
import { useState } from "react";
import { copy } from "../lib/format";
import { cx } from "./ui";

function Str({ v }: { v: string }) {
  const [open, setOpen] = useState(false);
  if (v.length <= 120 || open)
    return (
      <span className="break-all text-pass">
        "{v}"
        {v.length > 120 && (
          <button className="ml-1 text-xs text-issue underline" onClick={() => setOpen(false)}>
            fold
          </button>
        )}
      </span>
    );
  return (
    <span className="break-all text-pass">
      "{v.slice(0, 72)}…"
      <button className="ml-1 text-xs text-issue underline" onClick={() => setOpen(true)}>
        {v.length.toLocaleString()} chars
      </button>
    </span>
  );
}

function Node({
  k,
  v,
  depth,
  highlight,
  openDepth,
}: {
  k?: string;
  v: unknown;
  depth: number;
  highlight?: (k: string) => boolean;
  openDepth: number;
}) {
  const key = k !== undefined && (
    <span
      className={cx(
        "text-issue",
        highlight?.(k) && "rounded bg-present-soft px-0.5 font-semibold text-present-ink",
      )}
    >
      {/^\d+$/.test(k) ? "" : `"${k}": `}
    </span>
  );
  if (v === null || typeof v !== "object") {
    return (
      <div className="pl-4 -indent-4">
        {key}
        {typeof v === "string" ? <Str v={v} /> : <span className="text-present-ink">{String(v)}</span>}
      </div>
    );
  }
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
  const [o, c] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
  if (!entries.length)
    return (
      <div>
        {key}
        {o + c}
      </div>
    );
  return (
    <details open={depth < openDepth} className="group">
      <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <span
          className="mr-1 inline-block w-3 text-muted transition-transform group-open:rotate-90"
          aria-hidden
        >
          ›
        </span>
        {key}
        {o}
        <span className="text-muted group-open:hidden">
          {" "}
          {entries.length} {Array.isArray(v) ? "items" : "keys"} {c}
        </span>
      </summary>
      <div className="ml-[5px] border-l border-hairline pl-3">
        {entries.map(([ek, ev]) => (
          <Node key={ek} k={ek} v={ev} depth={depth + 1} highlight={highlight} openDepth={openDepth} />
        ))}
      </div>
      <div className="pl-3">{c}</div>
    </details>
  );
}

export function JsonView({
  value,
  highlight,
  maxHeight = "28rem",
  openDepth = 3,
}: {
  value: unknown;
  highlight?: (k: string) => boolean;
  maxHeight?: string;
  openDepth?: number;
}) {
  const [copied, setCopied] = useState(false);
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="relative rounded-md border border-hairline bg-sunken">
      <button
        className="absolute top-1.5 right-1.5 z-10 rounded border border-hairline bg-surface px-2 py-0.5 text-xs font-bold hover:border-ink"
        onClick={() => {
          void copy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <div className="overflow-auto p-3 pr-16 font-mono text-[0.8rem] leading-relaxed" style={{ maxHeight }}>
        {typeof value === "string" ? (
          <span className="break-all whitespace-pre-wrap">{value}</span>
        ) : (
          <Node v={value} depth={0} highlight={highlight} openDepth={openDepth} />
        )}
      </div>
    </div>
  );
}
