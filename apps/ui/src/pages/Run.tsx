import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import {
  credentialStatusLabel,
  isFailedEvent,
  KNOWN_GAPS,
  knownGapOf,
  TAMPER_PRESETS,
  type EventSummary,
  type Run,
  type RunStep,
} from "@playground/core";
import { api, ApiError, reportUrl } from "../lib/api";
import { useLiveFeed } from "../lib/live";
import { formatLabel, stationOf } from "../lib/format";
import { TransitLine, type Pulse } from "../components/TransitLine";
import { Inspector } from "../components/Inspector";
import { SequenceDiagram } from "../components/SequenceDiagram";
import { QrCode } from "../components/QrCode";
import { TestData } from "../components/TestData";
import { Button, cx, Field, Notice, Panel, StatusMark, Tag, Textarea, type Mark } from "../components/ui";

const STEP_LABEL: Record<RunStep["name"], string> = {
  issue: "Issue",
  request: "Request",
  present: "Present",
  verify: "Verify",
};
const STEP_MARK: Record<RunStep["status"], Mark> = {
  pending: "pending",
  running: "running",
  waiting: "waiting",
  passed: "pass",
  failed: "fail",
  skipped: "skipped",
};

function Steps({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((s, i) => (
        <li
          key={s.name}
          className={cx(
            "min-w-0 rounded-md border px-3 py-2.5",
            s.status === "failed"
              ? "border-fail/50"
              : s.status === "waiting"
                ? "border-present"
                : "border-hairline",
            "bg-surface",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">
              {i + 1}. {STEP_LABEL[s.name]}
            </span>
            <StatusMark mark={STEP_MARK[s.status]}>{s.status}</StatusMark>
          </div>
          {s.note && <p className="mt-1.5 text-sm [overflow-wrap:anywhere] text-muted">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
}

const ACTION_TITLE: Record<NonNullable<RunStep["action"]>["kind"], string> = {
  "scan-offer": "Scan to collect the credential",
  "scan-request": "Scan to answer the verifier",
  "upload-vc": "Share the credential",
  "paste-offer": "Paste a credential offer",
  "open-link": "Collect the credential",
  confirm: "Your turn",
  login: "Sign in at eSignet",
};

function ActionPanel({ run, step }: { run: Run; step: RunStep }) {
  const a = step.action!;
  const [offer, setOffer] = useState("");
  const send = useMutation({
    mutationFn: (body: { offerUri?: string; confirm?: boolean }) => api.runInput(run.id, body),
  });
  const qr = a.uri && (a.kind === "scan-offer" || a.kind === "scan-request");
  const issuerId = run.labels.issuer;
  return (
    <Panel title={ACTION_TITLE[a.kind]} className="border-present">
      <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
        {qr && (
          <QrCode
            value={a.uri!}
            label={a.kind === "scan-offer" ? "Credential offer QR code" : "Presentation request QR code"}
          />
        )}
        <div className="flex w-full max-w-[60ch] flex-col gap-3">
          <p className="text-[1.05rem] font-bold">{a.hint}</p>
          {a.kind === "login" && a.uri && (
            <a
              className="inline-flex min-h-12 items-center self-start rounded-full bg-issue px-6 font-bold text-on-issue shadow-card transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-lift"
              href={a.uri}
              target="_blank"
              rel="noreferrer"
            >
              Open eSignet in a new tab
            </a>
          )}
          {a.uri && !qr && a.kind !== "login" && (
            <a
              className="font-bold break-all text-issue underline"
              href={a.uri}
              target="_blank"
              rel="noreferrer"
            >
              {a.uri}
            </a>
          )}
          {a.environment && <TestData environment={a.environment} issuerId={issuerId} />}
          {a.kind === "paste-offer" && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate({ offerUri: offer.trim() });
              }}
            >
              <Field
                label="Credential offer"
                hint="An openid-credential-offer:// link from the external issuer."
              >
                {(id) => (
                  <Textarea
                    id={id}
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    spellCheck={false}
                    placeholder="openid-credential-offer://?credential_offer_uri=…"
                    className="min-h-20"
                    required
                  />
                )}
              </Field>
              <Button
                tone="primary"
                type="submit"
                busy={send.isPending}
                disabled={!offer.trim()}
                className="self-start"
              >
                Give it to the wallet
              </Button>
            </form>
          )}
          {a.needsConfirm && (
            <Button
              tone="primary"
              busy={send.isPending}
              onClick={() => send.mutate({ confirm: true })}
              className="self-start"
            >
              Continue
            </Button>
          )}
          {send.error && (
            <Notice tone="error">
              {send.error instanceof ApiError ? send.error.message : "That did not reach the run."}
            </Notice>
          )}
          {a.kind === "login" && (
            <p className="text-sm text-muted">
              eSignet sends your browser back to{" "}
              <code className="font-mono">http://localhost:3004/redirect</code>, where the playground picks up
              the authorization code. The run then carries on by itself.
            </p>
          )}
          {!a.needsConfirm && a.kind !== "paste-offer" && a.kind !== "login" && (
            <p className="text-sm text-muted">
              The step moves on by itself as soon as the{" "}
              {run.labels.hosted?.verifier
                ? "hosted verifier receives the answer"
                : "gateway sees the wallet's traffic"}
              .
              {run.labels.hosted?.verifier ? (
                ""
              ) : (
                <>
                  {" "}
                  Phones need the playground on a public HTTPS URL; start it with{" "}
                  <code className="font-mono">./playground.sh tunnel</code>.
                </>
              )}
            </p>
          )}
          {a.kind === "upload-vc" && (
            <Link to="/verify" className="font-bold text-issue underline">
              Open the Verifier desk to scan or upload
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

function ResultPanel({ run }: { run: Run }) {
  const r = run.result!;
  const asExpected = r.verdict === "PASS";
  const gap = knownGapOf(run);
  const status = r.verifierOutcome === "NOT_REACHED" ? undefined : credentialStatusLabel(r.credentialStatus);
  return (
    <section
      aria-labelledby="result"
      className={cx(
        "rounded-[10px] border-2 bg-surface p-4 sm:p-5",
        asExpected ? "border-pass" : gap ? "border-present" : "border-fail",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="result" className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xl">
          {r.verifierOutcome === "ACCEPTED"
            ? "Verifier accepted"
            : r.verifierOutcome === "REJECTED"
              ? "Verifier rejected"
              : r.verifierOutcome === "NOT_REACHED"
                ? "Journey stopped early"
                : "Verifier error"}
          {status && (
            <span
              className={cx(
                "rounded-md px-2 py-0.5 text-base font-black tracking-wide uppercase",
                r.credentialStatus === "SUCCESS"
                  ? "bg-pass-soft text-pass"
                  : r.credentialStatus === "EXPIRED"
                    ? "bg-present-soft text-present-ink"
                    : "bg-fail-soft text-fail",
              )}
            >
              {status}
            </span>
          )}
        </h2>
        <StatusMark mark={asExpected ? "pass" : gap ? "warn" : "fail"}>
          {asExpected ? "Behaved as expected" : gap ? `Known gap ${gap}` : "Did not behave as expected"}
        </StatusMark>
      </div>
      {gap && (
        <p className="mt-2 max-w-[75ch] text-sm">
          <strong>Known upstream gap {gap}:</strong> {KNOWN_GAPS[gap]}. It is written up with evidence in{" "}
          <code className="font-mono">docs/gaps.md</code>; this run reproduces it.
        </p>
      )}
      <p className="mt-2 max-w-[75ch] text-[1.02rem]">{r.explanation}</p>
      <p className="mt-1 text-sm text-muted">
        Expected: {r.expected === "PASS" ? "accept" : "reject"}.
        {r.errorCode ? ` Error code: ${r.errorCode}.` : ""}
      </p>
      {r.checks.length > 0 && (
        <ul className="mt-4 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
          {r.checks.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span
                className={cx("font-black", c.ok ? "text-pass" : "text-fail")}
                aria-label={c.ok ? "passed" : "failed"}
              >
                {c.ok ? "✓" : "✕"}
              </span>
              <span>
                <span className="font-semibold">{c.name}</span>
                {c.detail && <span className="block break-all text-muted">{c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RunPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const run = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.run(id),
    refetchInterval: (q) =>
      q.state.data && ["running", "waiting"].includes(q.state.data.status) ? 4000 : false,
  });
  const events = useQuery({ queryKey: ["run-events", id], queryFn: () => api.runEvents(id) });
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [showDiagram, setShowDiagram] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const announce = useRef<HTMLParagraphElement>(null);

  const onMessage = useCallback(
    (m: { type: string; event?: EventSummary; run?: Run }) => {
      if (m.type === "event" && m.event) {
        const e = m.event;
        qc.setQueryData<EventSummary[]>(["run-events", id], (old = []) =>
          old.some((x) => x.id === e.id) ? old : [...old, e].sort((a, b) => a.at.localeCompare(b.at)),
        );
        setPulses((p) => [
          ...p.slice(-6),
          { id: e.id, from: stationOf(e.from), to: stationOf(e.to), ok: !isFailedEvent(e), title: e.title },
        ]);
        if (announce.current)
          announce.current.textContent = `${e.title}: ${!isFailedEvent(e) ? "ok" : `failed with ${e.status}`}`;
      }
      if (m.type === "run" && m.run) qc.setQueryData(["run", id], m.run);
    },
    [id, qc],
  );
  useLiveFeed(id, onMessage);

  // With reduced motion there is no animation to end each pulse, so clear them on a timer.
  useEffect(() => {
    if (!reduce || !pulses.length) return;
    const t = setTimeout(() => setPulses([]), 700);
    return () => clearTimeout(t);
  }, [pulses, reduce]);

  if (run.isLoading) return <p className="text-muted">Loading run…</p>;
  if (!run.data)
    return (
      <Notice tone="error">
        Run {id} was not found. It may have been purged after the retention period.
      </Notice>
    );
  const r = run.data;
  const waiting = r.steps.find((s) => s.status === "waiting" && s.action);
  const live = r.status === "running" || r.status === "waiting";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted">{r.id}</p>
          <h1 className="text-2xl sm:text-3xl">{r.labels.typeName}</h1>
          <p className="mt-1 text-muted">
            {formatLabel(r.labels.format, r.labels.dataModel)}, {r.labels.proofType}.{" "}
            {r.spec.mode === "direct-share"
              ? "Direct share"
              : r.spec.query === "dcql"
                ? `OpenID4VP with DCQL${r.labels.format === "ldp_vc" && r.spec.dcqlPaths === "inji" ? " (Inji-style claim paths)" : ""}`
                : "OpenID4VP with Presentation Exchange"}
            {r.spec.tamper !== "none" && (
              <span className="font-bold text-present-ink">
                . Tamper: {TAMPER_PRESETS[r.spec.tamper].label.toLowerCase()}
              </span>
            )}
            .
          </p>
          {(r.labels.external || r.labels.hosted) && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {r.labels.hosted?.issuer && (
                <Tag tone="issue">
                  Hosted issuer on {r.labels.hosted.issuer}: {r.labels.issuerName}
                </Tag>
              )}
              {r.labels.hosted?.verifier && (
                <Tag tone="present">Hosted verifier on {r.labels.hosted.verifier}</Tag>
              )}
              {r.labels.external?.issuer && <Tag tone="issue">External issuer: {r.labels.issuerName}</Tag>}
              {r.labels.external?.wallet && <Tag>External wallet: {r.labels.wallet}</Tag>}
              {r.labels.external?.verifier && (
                <Tag tone="present">External verifier: {r.labels.verifier}</Tag>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {live && (
            <Button tone="danger" onClick={() => void api.cancelRun(r.id)}>
              Cancel run
            </Button>
          )}
          <a
            className="inline-flex min-h-10 items-center rounded-md border border-hairline bg-surface px-4 text-sm font-bold hover:border-ink"
            href={reportUrl(r.id, "md")}
          >
            Report (Markdown)
          </a>
          <a
            className="inline-flex min-h-10 items-center rounded-md border border-hairline bg-surface px-4 text-sm font-bold hover:border-ink"
            href={reportUrl(r.id, "json")}
          >
            Report (JSON)
          </a>
        </div>
      </div>

      <div className="rounded-[10px] border border-hairline bg-surface px-4 pt-5 pb-2 sm:px-8">
        <TransitLine
          names={{ issuer: r.labels.issuerName, wallet: r.labels.wallet, verifier: r.labels.verifier }}
          steps={r.steps}
          pulses={pulses}
          onPulseDone={(pid) => setPulses((p) => p.filter((x) => x.id !== pid))}
        />
      </div>
      <p ref={announce} className="sr-only" aria-live="polite" />

      <Steps steps={r.steps} />
      {waiting && <ActionPanel run={r} step={waiting} />}
      {r.result && <ResultPanel run={r} />}

      <section aria-labelledby="inspector" ref={inspectorRef} className="scroll-mt-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="inspector" className="text-xl">
            Protocol inspector
          </h2>
          <span className="text-sm text-muted">{events.data?.length ?? 0} messages, secrets masked</span>
        </div>
        <Inspector
          events={events.data ?? []}
          emptyHint={live ? "Waiting for the first message…" : undefined}
          selected={selected}
          onSelect={setSelected}
        />
      </section>

      {(events.data?.length ?? 0) > 1 && (
        <section aria-labelledby="sequence">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="sequence" className="text-xl">
              Sequence diagram
            </h2>
            <button
              className="text-sm font-bold text-issue underline"
              onClick={() => setShowDiagram((v) => !v)}
              aria-expanded={showDiagram}
            >
              {showDiagram ? "Hide" : "Show"}
            </button>
          </div>
          {showDiagram && (
            <>
              <p className="mb-2 text-sm text-muted">
                Select an arrow to open that message in the inspector.
              </p>
              <SequenceDiagram
                events={events.data ?? []}
                selected={selected}
                onSelect={(eid) => {
                  setSelected(eid);
                  inspectorRef.current?.scrollIntoView({
                    behavior: reduce ? "auto" : "smooth",
                    block: "start",
                  });
                }}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
