import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TAMPER_PRESETS, type TamperPreset } from "@playground/core";
import { api, ApiError, type HeldSummary } from "../lib/api";
import { ago, formatLabel } from "../lib/format";
import { JsonView } from "../components/JsonView";
import { QrMeasureView } from "../components/QrLab";
import { Button, cx, Empty, Field, Input, Notice, PageHeader, Panel, Select, StatusMark, Textarea } from "../components/ui";

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function CollectOffer({ initial, onCollected }: { initial: string; onCollected: (h: HeldSummary) => void }) {
  const [offer, setOffer] = useState(initial);
  const [pin, setPin] = useState("");
  const m = useMutation({ mutationFn: () => api.receiveOffer(offer.trim(), pin || undefined), onSuccess: onCollected });
  return (
    <Panel title="Collect a credential" className="border-t-4 border-t-issue">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Credential offer" hint="An openid-credential-offer:// link from this playground's Issuer Studio, or from any other OpenID4VCI issuer.">
          {(id) => <Textarea id={id} value={offer} onChange={(e) => setOffer(e.target.value)} spellCheck={false} placeholder="openid-credential-offer://?credential_offer_uri=…" className="min-h-24" required />}
        </Field>
        <Field label="PIN (only if the issuer set one)">{(id) => <Input id={id} value={pin} onChange={(e) => setPin(e.target.value)} maxLength={8} autoComplete="off" className="max-w-40" />}</Field>
        {m.error && <Notice tone="error">{errorText(m.error, "The wallet could not collect this credential.")}</Notice>}
        {m.data && (
          <Notice>
            Collected <strong>{m.data.title}</strong>. It is now in the list below.
          </Notice>
        )}
        <Button tone="primary" type="submit" busy={m.isPending} disabled={!offer.trim()} className="self-start">
          Collect credential
        </Button>
      </form>
    </Panel>
  );
}

function AnswerRequest({ initial, held }: { initial: string; held: HeldSummary[] }) {
  const [uri, setUri] = useState(initial);
  const [heldId, setHeldId] = useState("");
  const [tamper, setTamper] = useState<TamperPreset>("none");
  const m = useMutation({ mutationFn: () => api.presentTo(uri.trim(), heldId || undefined, tamper === "none" ? undefined : tamper) });
  const r = m.data;
  return (
    <Panel title="Answer a verifier" className="border-t-4 border-t-present">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Presentation request" hint="An openid4vp:// link from Inji Verify, the Reference Verifier or any OpenID4VP verifier.">
          {(id) => <Textarea id={id} value={uri} onChange={(e) => setUri(e.target.value)} spellCheck={false} placeholder="openid4vp://authorize?client_id=…&request_uri=…" className="min-h-24" required />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Credential to present">
            {(id) => (
              <Select id={id} value={heldId} onChange={(e) => setHeldId(e.target.value)}>
                <option value="">Let the wallet choose a match</option>
                {held.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title}, {formatLabel(h.format)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Misbehave on purpose" hint={tamper === "none" ? undefined : TAMPER_PRESETS[tamper].explain}>
            {(id) => (
              <Select id={id} value={tamper} onChange={(e) => setTamper(e.target.value as TamperPreset)}>
                {Object.entries(TAMPER_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {m.error && <Notice tone="error">{errorText(m.error, "The wallet could not answer this request.")}</Notice>}
        <Button tone="primary" type="submit" busy={m.isPending} disabled={!uri.trim() || !held.length} className="self-start">
          Send presentation
        </Button>
        {!held.length && <p className="text-sm text-muted">Collect a credential first; the wallet has nothing to present.</p>}
      </form>
      {r && (
        <div className="mt-5 flex flex-col gap-3 border-t border-hairline pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusMark mark={r.status < 400 ? "pass" : "fail"}>Verifier answered {r.status}</StatusMark>
            <span className="text-sm text-muted">
              {r.request.language === "dcql" ? "DCQL" : "Presentation Exchange"} request from <code className="font-mono break-all">{r.request.clientId}</code>, {r.request.signed ? "signed" : "unsigned"}, by {r.request.transport}.
            </span>
          </div>
          {r.matches.map((x) => (
            <p key={x.queryId} className="text-sm">
              <span className="font-bold">{x.queryId}</span>: {x.explanation}
            </p>
          ))}
          {(r.disclosed || r.withheld) && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Disclosed</dt>
              <dd className="font-semibold">{r.disclosed?.join(", ") || "Nothing selectively disclosable"}</dd>
              <dt className="text-muted">Kept back</dt>
              <dd className="font-semibold">{r.withheld?.join(", ") || "Nothing"}</dd>
            </dl>
          )}
          <JsonView value={r.verifierResponse ?? "(empty response)"} maxHeight="14rem" />
          <p className="text-sm text-muted">
            The verifier decides the outcome on its own side; check its result screen, or find the exchange in <Link to="/traffic" className="text-issue underline">Live traffic</Link>.
          </p>
        </div>
      )}
    </Panel>
  );
}

function HeldDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const q = useQuery({ queryKey: ["held", id], queryFn: () => api.heldOne(id) });
  const qr = useQuery({ queryKey: ["qr-held", id], queryFn: () => api.qrLab({ heldId: id }), staleTime: Infinity });
  const del = useMutation({ mutationFn: () => api.deleteHeld(id), onSuccess: onDeleted });
  const [showRaw, setShowRaw] = useState(false);
  if (q.isLoading) return <p className="p-4 text-muted">Opening credential…</p>;
  if (!q.data) return <div className="p-4"><Notice tone="error">This credential could not be opened. It may have been removed.</Notice></div>;
  const h = q.data;
  const claims = Object.entries(h.claims).filter(([k]) => k !== "id");
  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl">{h.title}</h3>
          <p className="text-sm text-muted">
            {formatLabel(h.format)}, from <span className="break-all">{h.issuer}</span>. Collected {ago(h.createdAt)}
            {h.runId && (
              <>
                {" "}in{" "}
                <Link to={`/runs/${h.runId}`} className="text-issue underline">
                  run {h.runId}
                </Link>
              </>
            )}
            .
          </p>
        </div>
        <Button tone="danger" busy={del.isPending} onClick={() => confirm(`Remove "${h.title}" from the Reference Wallet?`) && del.mutate()}>
          Remove
        </Button>
      </div>
      {claims.length > 0 && (
        <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 rounded-md bg-sunken p-3 text-sm">
          {claims.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm">
        Bound to holder key <code className="font-mono break-all text-muted">{h.holder}</code>
      </p>
      <section aria-labelledby={`qr-${id}`}>
        <h4 id={`qr-${id}`} className="mb-3 text-base">
          As a direct-share QR code
        </h4>
        {qr.data ? <QrMeasureView m={qr.data} /> : qr.error ? <Notice tone="error">{errorText(qr.error, "The QR Lab could not measure this credential.")}</Notice> : <p className="text-sm text-muted">Measuring…</p>}
      </section>
      <div>
        <button className="text-sm font-bold text-issue underline" onClick={() => setShowRaw((v) => !v)} aria-expanded={showRaw}>
          {showRaw ? "Hide the credential" : "Show the credential as issued"}
        </button>
        {showRaw && (
          <div className="mt-2">
            <JsonView value={h.credential} />
          </div>
        )}
      </div>
    </div>
  );
}

function HeldList({ held, loading }: { held: HeldSummary[]; loading: boolean }) {
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const current = held.some((h) => h.id === selected) ? selected : (held[0]?.id ?? null);
  if (loading) return <p className="text-muted">Opening the wallet…</p>;
  if (!held.length) return <Empty title="The wallet is empty">Collect a credential above, or <Link to="/" className="text-issue underline">run a journey</Link>; the Reference Wallet keeps what it collects.</Empty>;
  return (
    <div className="grid overflow-hidden rounded-[10px] border border-hairline bg-surface lg:grid-cols-[minmax(16rem,22rem)_1fr]">
      <ul className="max-h-[40rem] divide-y divide-hairline overflow-y-auto border-b border-hairline lg:border-r lg:border-b-0" aria-label="Held credentials">
        <AnimatePresence initial={false}>
          {held.map((h) => (
            <motion.li key={h.id} layout={!reduce} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <button onClick={() => setSelected(h.id)} aria-current={h.id === current || undefined} className={cx("flex w-full flex-col gap-0.5 border-l-4 px-3 py-2.5 text-left transition-colors duration-150", h.format === "ldp_vc" ? "border-l-issue" : "border-l-present", h.id === current ? "bg-issue-soft" : "hover:bg-sunken")}>
                <span className="font-bold">{h.title}</span>
                <span className="text-sm text-muted">{formatLabel(h.format)}</span>
                <span className="text-xs text-muted">{ago(h.createdAt)}</span>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="min-w-0">{current && <HeldDetail key={current} id={current} onDeleted={() => void qc.invalidateQueries({ queryKey: ["held"] })} />}</div>
    </div>
  );
}

export default function WalletPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const held = useQuery({ queryKey: ["held"], queryFn: api.held });
  return (
    <>
      <PageHeader
        title="Reference Wallet"
        lede="The playground's own headless wallet, built on independent libraries. Collect a credential from any OpenID4VCI offer, answer any OpenID4VP request, and see how big each credential would be as a QR code."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <CollectOffer initial={params.get("offer") ?? ""} onCollected={() => void qc.invalidateQueries({ queryKey: ["held"] })} />
          <AnswerRequest initial={params.get("request") ?? ""} held={held.data ?? []} />
        </div>
        <section aria-labelledby="held-title">
          <h2 id="held-title" className="mb-3 text-xl">
            Held credentials
          </h2>
          <HeldList held={held.data ?? []} loading={held.isLoading} />
        </section>
      </div>
    </>
  );
}
