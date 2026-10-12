import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Parties } from "../lib/api";
import { formatLabel } from "../lib/format";
import { cx, Empty, Notice, PageHeader, Tag } from "../components/ui";

const KIND: Record<string, string> = {
  mobile: "Phone app",
  web: "Web wallet",
  headless: "Runs without a person",
};

/** The station marker from the wordmark: a stretch of line in the station's colour with its stop. */
function StationHead({
  id,
  title,
  line,
  children,
}: {
  id: string;
  title: string;
  line: "issue" | "present";
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2.5 text-xl">
        <svg width="34" height="14" viewBox="0 0 34 14" aria-hidden>
          <path d="M2 7h22" stroke={`var(--${line})`} strokeWidth="4" strokeLinecap="round" />
          <circle cx="26" cy="7" r="4.5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="2.5" />
        </svg>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Where a party comes from: shipped with the playground, or declared in the parties file. */
function Origin({ external }: { external: boolean }) {
  return external ? <Tag tone="issue">From parties.yaml</Tag> : <Tag>Built in</Tag>;
}

function Reach({ h }: { h?: { ok: boolean; detail: string } }) {
  if (!h) return null;
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 text-sm", h.ok ? "text-pass" : "text-fail")}
      title={h.detail}
    >
      <span className={cx("inline-block size-2 rounded-full", h.ok ? "bg-pass" : "bg-fail")} aria-hidden />
      {h.ok ? "Reachable" : "Not reachable"}
    </span>
  );
}

function Row({
  title,
  origin,
  meta,
  children,
  aside,
}: {
  title: string;
  origin: boolean;
  meta?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base">{title}</h3>
          <Origin external={origin} />
        </div>
        {meta && (
          <p className="mt-0.5 text-sm text-muted">
            {typeof meta === "string" ? meta.charAt(0).toUpperCase() + meta.slice(1) : meta}
          </p>
        )}
        {children && <div className="mt-2 flex flex-col gap-2 text-sm">{children}</div>}
      </div>
      {aside && <div className="flex flex-col gap-1.5 text-sm md:items-end md:text-right">{aside}</div>}
    </li>
  );
}

function Chips({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded bg-sunken px-2 py-0.5 text-xs font-semibold">
          {i}
        </span>
      ))}
    </span>
  );
}

const link = "font-bold text-issue underline";

function Wallets({ p }: { p: Parties }) {
  return (
    <section aria-labelledby="wallets">
      <StationHead id="wallets" title="Wallets" line="issue">
        <span className="text-sm text-muted">{p.wallets.length} wallets</span>
      </StationHead>
      <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
        {p.wallets.map((w) => (
          <Row
            key={w.id}
            title={w.label}
            origin={w.origin === "external"}
            meta={[
              KIND[w.kind],
              w.software,
              w.automated
                ? "the playground drives it through its API"
                : w.interactive
                  ? "you scan the QR codes"
                  : undefined,
            ]
              .filter(Boolean)
              .join(", ")}
            aside={
              <>
                {w.automated && <Reach h={p.health[`wallet:${w.id}`]} />}
                {w.install?.android && (
                  <a className={link} href={w.install.android} target="_blank" rel="noreferrer">
                    Get it for Android
                  </a>
                )}
                {w.install?.ios && (
                  <a className={link} href={w.install.ios} target="_blank" rel="noreferrer">
                    Get it for iPhone
                  </a>
                )}
                {w.install?.web && (
                  <a className={link} href={w.install.web} target="_blank" rel="noreferrer">
                    Open it
                  </a>
                )}
                {w.homepage && (
                  <a className="text-muted underline" href={w.homepage} target="_blank" rel="noreferrer">
                    About it
                  </a>
                )}
                {!w.runnable && <span className="text-muted">Not part of runs</span>}
              </>
            }
          >
            {w.description && <p className="max-w-[72ch]">{w.description}</p>}
            <Chips items={[...(w.formats ?? []).map((f) => formatLabel(f)), ...(w.protocols ?? [])]} />
          </Row>
        ))}
      </ul>
    </section>
  );
}

function Issuers({ p, studioTypes }: { p: Parties; studioTypes: number }) {
  return (
    <section aria-labelledby="issuers">
      <StationHead id="issuers" title="Issuers" line="issue" />
      <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
        <Row
          title="Inji Certify, through the Issuer Studio"
          origin={false}
          meta="Inji Certify 0.14.0 (MOSIP), running in this bundle"
          aside={
            <Link className={link} to="/studio">
              Design a credential type
            </Link>
          }
        >
          <p>
            {studioTypes} credential {studioTypes === 1 ? "type" : "types"}, each with its own issuer profile.
            JSON-LD (VCDM 1.1 and 2.0) and SD-JWT VC.
          </p>
        </Row>
        {p.issuers.map((i) => (
          <Row
            key={i.id}
            title={i.name}
            origin
            meta={[i.software, i.credentialIssuer].filter(Boolean).join(", ")}
            aside={
              <>
                <Reach h={p.health[`issuer:${i.id}`]} />
                {i.offerPage && (
                  <a className={link} href={i.offerPage} target="_blank" rel="noreferrer">
                    Get an offer by hand
                  </a>
                )}
                {i.homepage && (
                  <a className="text-muted underline" href={i.homepage} target="_blank" rel="noreferrer">
                    About it
                  </a>
                )}
              </>
            }
          >
            {i.description && <p className="max-w-[72ch]">{i.description}</p>}
            <ul className="flex flex-col gap-1">
              {i.types.map((t) => (
                <li key={t.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{t.displayName}</span>
                  <span className="text-muted">
                    {formatLabel(t.format, t.dataModel)}, {t.proof}
                    {t.canIssue ? "" : ", offers by hand only"}
                  </span>
                  <code className="font-mono text-xs break-all text-muted">{t.vct ?? t.typeName}</code>
                </li>
              ))}
            </ul>
            <p className="text-muted">
              Trusted by the Reference Verifier through{" "}
              {i.trust.certificates + i.trust.jwks
                ? `${i.trust.certificates} certificate(s) and ${i.trust.jwks} key(s)`
                : "no keys"}
              {i.trust.jwksUri ? " plus a JWKS URL" : ""}. Inji Verify checks the certificate in the
              credential itself.
            </p>
          </Row>
        ))}
      </ul>
    </section>
  );
}

function Verifiers({ p }: { p: Parties }) {
  return (
    <section aria-labelledby="verifiers">
      <StationHead id="verifiers" title="Verifiers" line="present" />
      <ul className="divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
        {p.verifiers.map((v) => (
          <Row
            key={v.id}
            title={v.label}
            origin={v.origin === "external"}
            meta={[
              v.software,
              v.ownQuery
                ? "writes its own request"
                : `asks in ${v.accepts.map((a) => (a === "dcql" ? "DCQL" : "Presentation Exchange")).join(" or ")}`,
            ]
              .filter(Boolean)
              .join(", ")}
            aside={
              <>
                {v.origin === "external" && <Reach h={p.health[`verifier:${v.id}`]} />}
                {v.supportsDirectShare && (
                  <span className="text-muted">Also checks a credential's own QR code</span>
                )}
                {v.homepage && (
                  <a className="text-muted underline" href={v.homepage} target="_blank" rel="noreferrer">
                    About it
                  </a>
                )}
              </>
            }
          >
            <p className="max-w-[72ch]">{v.description ?? v.note}</p>
            <Chips items={v.formats.map((f) => formatLabel(f))} />
          </Row>
        ))}
      </ul>
    </section>
  );
}

const EXAMPLE = `issuers:
  - id: my-issuer
    name: My issuer
    credentialIssuer: https://issuer.example.org
    offerPage: https://issuer.example.org/demo   # or "offer:" steps for an API
    types:
      - id: badge
        name: Badge
        configurationId: Badge_vc+sd-jwt
        format: vc+sd-jwt
        vct: https://issuer.example.org/badge
        claims: [{ name: holderName, label: Holder }]`;

export default function PartiesPage() {
  const q = useQuery({ queryKey: ["parties"], queryFn: api.parties, refetchInterval: 30_000 });
  const types = useQuery({ queryKey: ["types"], queryFn: api.types });
  const p = q.data;
  return (
    <>
      <PageHeader
        title="Parties"
        lede="Every issuer, wallet and verifier the playground can use. The built-in ones ship with the bundle. The rest come from a config file you can edit: add an entry, restart, and it shows up here and in the Run builder."
      />
      {q.isLoading ? (
        <p className="min-h-[100svh] text-muted">Loading parties…</p>
      ) : !p ? (
        <Empty title="The parties list did not load">
          Check that the playground is running with ./playground.sh doctor.
        </Empty>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="config" className="rounded-[10px] border border-hairline bg-surface p-4">
            <h2 id="config" className="text-lg">
              Adding a party
            </h2>
            <p className="mt-1 max-w-[75ch]">
              External parties are declared in <code className="font-mono">infra/parties.yaml</code>
              {p.file ? (
                <>
                  {" "}
                  (read from <code className="font-mono">{p.file}</code> at{" "}
                  {new Date(p.loadedAt).toLocaleTimeString()})
                </>
              ) : (
                ", which this playground was started without"
              )}
              . Edit the file, then run <code className="font-mono">./playground.sh restart</code>. No code
              changes: the file says where each party is and which HTTP calls make it issue, ask for or
              present a credential.
            </p>
            {p.errors.length > 0 && (
              <div className="mt-3">
                <Notice tone="error">
                  <span className="block font-bold">
                    The file has {p.errors.length === 1 ? "a problem" : `${p.errors.length} problems`}. Those
                    entries were skipped:
                  </span>
                  <ul className="mt-1 list-disc pl-5">
                    {p.errors.map((e) => (
                      <li key={e} className="break-words">
                        {e}
                      </li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer font-bold text-issue">See a minimal issuer entry</summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-sunken p-3 font-mono text-xs leading-relaxed">
                {EXAMPLE}
              </pre>
              <p className="mt-2 text-sm text-muted">
                The shipped file has complete, commented examples for an issuer with an offer API, a verifier
                and an API-driven wallet (the walt.id lab, started by ./playground.sh up --external).
              </p>
            </details>
          </section>
          <Wallets p={p} />
          <Issuers p={p} studioTypes={types.data?.length ?? 0} />
          <Verifiers p={p} />
        </div>
      )}
    </>
  );
}
