import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isFailedEvent, sniff, type EventSummary, type Sniffed } from "@playground/core";
import { api } from "../lib/api";
import { useLiveFeed } from "../lib/live";
import { Decoded, Inspector } from "../components/Inspector";
import { JsonView } from "../components/JsonView";
import { cx, Empty, Notice, PageHeader, Panel, Textarea } from "../components/ui";

const PHASES = [
  { id: "issuance", label: "Issuance" },
  { id: "presentation", label: "Presentation" },
  { id: "verification", label: "Verification" },
  { id: "setup", label: "Setup" },
] as const;
const KEEP = 500;

function LiveFeed() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["events", "all"], queryFn: () => api.events("?limit=200") });
  const [phases, setPhases] = useState<Set<string>>(new Set(PHASES.map((p) => p.id)));
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<EventSummary[] | null>(null);

  const onMessage = useCallback(
    (m: { type: string; event?: EventSummary }) => {
      if (m.type !== "event" || !m.event) return;
      const e = m.event;
      qc.setQueryData<EventSummary[]>(["events", "all"], (old = []) => (old.some((x) => x.id === e.id) ? old : [...old, e].slice(-KEEP)));
    },
    [qc],
  );
  const connected = useLiveFeed(null, onMessage);

  // Pausing freezes what is on screen; new messages keep arriving underneath.
  useEffect(() => setFrozen(paused ? (q.data ?? []) : null), [paused]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = frozen ?? q.data ?? [];
  const shown = useMemo(() => all.filter((e) => phases.has(e.phase) && (!failuresOnly || isFailedEvent(e))), [all, phases, failuresOnly]);
  const behind = frozen ? (q.data?.length ?? 0) - frozen.length : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-sm font-bold" aria-live="polite">
          <span className={cx("inline-block size-2.5 rounded-full", connected ? "bg-pass motion-safe:animate-pulse" : "bg-muted")} aria-hidden />
          {connected ? (paused ? "Paused" : "Live") : "Reconnecting…"}
        </span>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Show phases</legend>
          {PHASES.map((p) => {
            const on = phases.has(p.id);
            return (
              <label key={p.id} className={cx("cursor-pointer rounded-full border px-3 py-1 text-sm font-bold transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]", on ? (p.id === "issuance" || p.id === "setup" ? "border-issue bg-issue-soft text-issue" : "border-present bg-present-soft text-present-ink") : "border-hairline text-muted")}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() => {
                    const next = new Set(phases);
                    if (on) next.delete(p.id);
                    else next.add(p.id);
                    setPhases(next);
                  }}
                />
                {p.label}
              </label>
            );
          })}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
          Errors only
        </label>
        <button className="ml-auto rounded-md border border-hairline bg-surface px-3 py-1 text-sm font-bold hover:border-ink" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? (behind > 0 ? `Resume (${behind} new)` : "Resume") : "Pause"}
        </button>
      </div>
      {q.isLoading ? (
        // Hold the feed's eventual height, so the Decoder below does not jump when it arrives.
        <p className="min-h-[36rem] text-muted" aria-busy>
          Loading recent traffic…
        </p>
      ) : !all.length ? (
        <Empty title="No traffic yet">
          Every request that passes through the gateway shows up here as it happens. <Link to="/" className="text-issue underline">Start a run</Link> or point a wallet at an offer.
        </Empty>
      ) : !shown.length ? (
        <Empty title="Nothing matches these filters">Turn a phase back on, or clear Errors only.</Empty>
      ) : (
        <Inspector events={shown} newestFirst />
      )}
      <p className="text-sm text-muted">Showing the latest {Math.min(all.length, KEEP)} messages from every run and from wallets acting on their own. Open a run to see its messages alone.</p>
    </div>
  );
}

const KIND_LABEL: Record<Sniffed["kind"] | "pixelpass", string> = {
  "sd-jwt": "SD-JWT",
  jwt: "JWT",
  "credential-offer": "OpenID4VCI credential offer",
  "authorization-request": "OpenID4VP authorization request",
  json: "JSON",
  text: "Plain text",
  pixelpass: "PixelPass QR text",
};

const parseMaybe = (v: string) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

function DecodedInput({ s }: { s: Sniffed & { raw: string } }) {
  switch (s.kind) {
    case "sd-jwt":
    case "jwt":
      return <Decoded kind={s.kind} value={s.raw} path="$" />;
    case "credential-offer":
      return (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            {s.value.byReference ? (
              <>
                The offer is passed <strong>by reference</strong>: the QR code holds only a link, and the wallet downloads the offer from <code className="font-mono break-all">{s.value.credentialOfferUri}</code>.
              </>
            ) : (
              <>
                The offer is passed <strong>by value</strong>: the whole offer is inside the QR code.
              </>
            )}
          </p>
          {s.value.credentialOffer && <JsonView value={s.value.credentialOffer} highlight={(k) => k === "pre-authorized_code" || k === "tx_code"} />}
          <Link to={`/wallet?offer=${encodeURIComponent(s.raw)}`} className="font-bold text-issue underline">
            Collect it with the Reference Wallet
          </Link>
        </div>
      );
    case "authorization-request": {
      const params = Object.fromEntries(Object.entries(s.value).map(([k, v]) => [k, k === "presentation_definition" || k === "dcql_query" || k === "client_metadata" ? parseMaybe(v) : v]));
      return (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            {s.value.request_uri ? (
              <>
                The request is passed <strong>by reference</strong>. The wallet fetches the full request object from <code className="font-mono break-all">{s.value.request_uri}</code>
                {s.value.request_uri_method === "post" ? " with a POST." : "."}
              </>
            ) : (
              <>
                The request is passed <strong>by value</strong>, with the query in the link itself ({s.value.dcql_query ? "DCQL" : s.value.presentation_definition ? "Presentation Exchange" : "no query found"}).
              </>
            )}{" "}
            It comes from <code className="font-mono break-all">{s.value.client_id ?? "an unnamed verifier"}</code>.
          </p>
          <JsonView value={params} highlight={(k) => ["client_id", "request_uri", "nonce", "response_uri"].includes(k)} />
          <Link to={`/wallet?request=${encodeURIComponent(s.raw)}`} className="font-bold text-issue underline">
            Answer it with the Reference Wallet
          </Link>
        </div>
      );
    }
    case "json": {
      const o = s.value as Record<string, unknown> | null;
      const types = o && typeof o === "object" ? ([] as unknown[]).concat(o.type ?? []) : [];
      if (types.includes("VerifiablePresentation")) return <Decoded kind="vp" value={o} path="$" />;
      if (o && typeof o === "object" && o.credentialSubject && o.proof) return <Decoded kind="vc" value={o} path="$" />;
      return <JsonView value={s.value} />;
    }
    default:
      return <p className="text-sm text-muted">This does not look like a JWT, SD-JWT, offer, OpenID4VP request, JSON or PixelPass text.</p>;
  }
}

type Result = (Sniffed & { raw: string }) | { kind: "pixelpass"; raw: string; inner: Sniffed & { raw: string } };

function Decoder() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const text = input.trim();
    if (!text) return setResult(null);
    const mine = ++seq.current;
    const s = sniff(text);
    if (s.kind !== "text") return setResult({ ...s, raw: text });
    // Not recognised: it may be PixelPass (base45 + zlib) from a direct-share QR code.
    if (/^[0-9A-Z $%*+\-./:]+$/.test(text)) {
      import("@injistack/pixelpass")
        .then(({ decode }) => {
          const inner = decode(text);
          if (mine === seq.current) setResult({ kind: "pixelpass", raw: text, inner: { ...sniff(inner), raw: inner } });
        })
        .catch(() => mine === seq.current && setResult({ ...s, raw: text }));
    } else setResult({ ...s, raw: text });
  }, [input]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor="decode-input" className="text-sm font-bold">
          Paste a token, link or credential
        </label>
        <Textarea id="decode-input" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} placeholder="eyJhbGciOi…, openid-credential-offer://…, openid4vp://…, a credential's JSON, or PixelPass QR text" className="min-h-64" />
        <p className="text-sm text-muted">Decoding happens in your browser. Nothing you paste here is sent or stored.</p>
      </div>
      <div aria-live="polite" className="min-w-0">
        {!result ? (
          <Empty title="Decoded output appears here">The decoder recognises SD-JWTs, JWTs, credential offers, OpenID4VP requests, credentials, presentations and PixelPass QR text.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Recognised as <strong>{KIND_LABEL[result.kind]}</strong>
              {result.kind === "pixelpass" && <>, which unpacks to {KIND_LABEL[result.inner.kind]}</>}
              <span className="text-muted">, {result.raw.length.toLocaleString()} characters.</span>
            </p>
            {result.kind === "pixelpass" ? <DecodedInput s={result.inner} /> : <DecodedInput s={result} />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrafficPage() {
  return (
    <>
      <PageHeader title="Live traffic" lede="Every protocol message crossing the playground's gateway, from any run or any wallet, as it happens. Secrets stay masked unless you reveal them on this computer." />
      <div className="flex flex-col gap-6">
        <LiveFeed />
        <Panel title="Decoder">
          <Decoder />
        </Panel>
        <Notice>Paste only synthetic test data. Real credentials and tokens belong to real people, even in a playground.</Notice>
      </div>
    </>
  );
}
