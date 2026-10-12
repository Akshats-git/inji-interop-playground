import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  TAMPER_PRESETS,
  VERIFIERS,
  WALLETS,
  type CatalogType,
  type PresentMode,
  type QueryLanguage,
  type Run,
  type TamperPreset,
  type VerifierInfo,
  type WalletInfo,
} from "@playground/core";
import { api, ApiError } from "../lib/api";
import { ago, formatLabel } from "../lib/format";
import {
  Button,
  Choice,
  Empty,
  Field,
  Input,
  Notice,
  PageHeader,
  Panel,
  Select,
  StatusMark,
  Tag,
} from "../components/ui";

/** Synthetic, obviously fictional sample values so nobody is tempted to type real data. */
const SAMPLES: Record<string, string> = {
  fullName: "Ramesh Kumar",
  holderName: "Asha Rao",
  farmerId: "KA-MND-20931",
  district: "Mandya",
  landAreaAcres: "3.5",
  major: "Computer Science",
  graduationDate: "2025-06-30",
  cardNumber: "LIB-0042",
};

type SampleField = {
  name: string;
  label: string;
  kind: string;
  options?: string[];
  example?: string;
  sample?: string | number | boolean;
};

export function sampleClaims(t: { fields: SampleField[] }): Record<string, string> {
  return Object.fromEntries(
    t.fields.map((f) => [
      f.name,
      f.sample !== undefined
        ? String(f.sample)
        : (SAMPLES[f.name] ??
          f.example ??
          (f.kind === "choice"
            ? (f.options?.[1] ?? f.options?.[0] ?? "")
            : f.kind === "date"
              ? "2026-01-15"
              : f.kind === "number"
                ? "1"
                : f.kind === "boolean"
                  ? "true"
                  : `Sample ${f.label.toLowerCase()}`)),
    ]),
  );
}

interface Preset {
  title: string;
  note: string;
  match: (t: CatalogType) => boolean;
  wallet?: string;
  verifier: string;
  mode: PresentMode;
  query: QueryLanguage;
  tamper: TamperPreset;
}

const studio = (t: CatalogType) => t.origin === "studio";

/** The built-in parties, shown before /api/parties answers so the form does not jump when the list arrives. */
const BUILTIN_WALLETS: WalletInfo[] = (["reference-wallet", "inji-wallet", "external-wallet"] as const).map(
  (id) => ({
    id,
    label: WALLETS[id].label,
    origin: "builtin",
    kind: id === "reference-wallet" ? "headless" : "mobile",
    interactive: WALLETS[id].interactive,
    supportsTamper: id === "reference-wallet",
    supportsDirectShare: id !== "external-wallet",
    runnable: true,
    note:
      id === "reference-wallet"
        ? "Automatic, no phone needed."
        : id === "inji-wallet"
          ? "Scan with the Inji app; needs a public URL."
          : "Any OpenID4VCI wallet that scans offers.",
  }),
);
const BUILTIN_VERIFIERS: VerifierInfo[] = (["inji-verify", "reference-verifier"] as const).map((id) => ({
  id,
  label: VERIFIERS[id].label,
  origin: "builtin",
  accepts: [...VERIFIERS[id].accepts],
  ownQuery: false,
  formats: ["ldp_vc", "vc+sd-jwt"],
  note: VERIFIERS[id].note,
  supportsDirectShare: id === "inji-verify",
}));
const PRESETS: Preset[] = [
  {
    title: "Farmer card, verified by Inji Verify",
    note: "W3C JSON-LD (VCDM 2.0), OpenID4VP with Presentation Exchange.",
    match: (t) => studio(t) && t.format === "ldp_vc" && t.typeName === "KarnatakaFarmerCard",
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "none",
  },
  {
    title: "Selective disclosure with SD-JWT",
    note: "The shop asks only for the crop; name and land area stay hidden.",
    match: (t) => studio(t) && t.format === "vc+sd-jwt",
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "none",
  },
  {
    title: "Same question in DCQL",
    note: "OpenID4VP 1.0 query language, answered to the Reference Verifier.",
    match: (t) => studio(t) && t.format === "vc+sd-jwt",
    verifier: "reference-verifier",
    mode: "openid4vp-cross-device",
    query: "dcql",
    tamper: "none",
  },
  {
    title: "External issuer, Inji Verify",
    note: "A credential from a non-Inji issuer in the parties file, verified by Inji Verify.",
    match: (t) => t.origin === "external" && t.canIssue,
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "none",
  },
  {
    title: "Forged issuer signature",
    note: "An SD-JWT re-signed by an attacker with a self-signed certificate.",
    match: (t) => studio(t) && t.format === "vc+sd-jwt",
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "self-signed-sdjwt",
  },
];

export function RunBuilderPage() {
  const nav = useNavigate();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });
  const parties = useQuery({ queryKey: ["parties"], queryFn: api.parties, refetchInterval: 30_000 });
  const runs = useQuery({
    queryKey: ["runs", "recent"],
    queryFn: () => api.runs("?limit=12"),
    refetchInterval: 5000,
  });

  const [typeId, setTypeId] = useState("");
  const [wallet, setWallet] = useState("reference-wallet");
  const [verifier, setVerifier] = useState("inji-verify");
  const [mode, setMode] = useState<PresentMode>("openid4vp-cross-device");
  const [query, setQuery] = useState<QueryLanguage>("presentation_exchange");
  const [tamper, setTamper] = useState<TamperPreset>("none");
  const [requested, setRequested] = useState<string[]>([]);
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [txCode, setTxCode] = useState("");

  const type = catalog.data?.find((t) => t.id === typeId);
  const wallets = parties.data ? parties.data.wallets.filter((w) => w.runnable) : BUILTIN_WALLETS;
  const verifiers = parties.data?.verifiers ?? BUILTIN_VERIFIERS;
  const walletInfo = wallets.find((w) => w.id === wallet);
  const verifierInfo = verifiers.find((v) => v.id === verifier);
  const health = parties.data?.health ?? {};
  const down = (key: string) => health[key] && !health[key]!.ok;

  useEffect(() => {
    if (!typeId && catalog.data?.length) setTypeId(catalog.data[0]!.id);
  }, [catalog.data, typeId]);
  useEffect(() => {
    if (!type) return;
    setClaims(sampleClaims(type));
    setRequested(
      type.fields.some((f) => f.name === "primaryCropType")
        ? ["primaryCropType"]
        : type.fields.slice(0, 1).map((f) => f.name),
    );
  }, [type?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the form consistent when a choice makes another impossible.
  useEffect(() => {
    if (walletInfo && !walletInfo.supportsTamper && tamper !== "none") setTamper("none");
    if (
      mode === "direct-share" &&
      ((walletInfo && !walletInfo.supportsDirectShare) || (verifierInfo && !verifierInfo.supportsDirectShare))
    )
      setMode("openid4vp-cross-device");
  }, [walletInfo, verifierInfo, mode, tamper]);

  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; external: boolean; types: CatalogType[] }>();
    for (const t of catalog.data ?? []) {
      const g = m.get(t.issuerId) ?? { name: t.issuerName, external: t.origin === "external", types: [] };
      g.types.push(t);
      m.set(t.issuerId, g);
    }
    return [...m.entries()];
  }, [catalog.data]);

  const start = useMutation({
    mutationFn: () =>
      api.startRun({
        typeId,
        wallet,
        verifier,
        mode,
        query,
        tamper: walletInfo?.supportsTamper ? tamper : "none",
        requestedClaims: requested,
        claims,
        txCode: txCode || undefined,
      }),
    onSuccess: (run) => nav(`/runs/${run.id}`),
  });

  const applyPreset = (p: Preset) => {
    const t = catalog.data?.find(p.match);
    if (!t) return;
    setTypeId(t.id);
    setWallet(p.wallet ?? "reference-wallet");
    setVerifier(p.verifier);
    setMode(p.mode);
    setQuery(p.query);
    setTamper(p.tamper);
  };

  const dcqlToInji = verifier === "inji-verify" && query === "dcql" && mode !== "direct-share";
  const formatMismatch =
    verifierInfo?.origin === "external" && type && !verifierInfo.formats.includes(type.format);
  const directShareOk =
    (walletInfo?.supportsDirectShare ?? true) && (verifierInfo?.supportsDirectShare ?? true);
  const presets = catalog.data
    ? PRESETS.filter((p) => catalog.data.some(p.match))
    : PRESETS.filter((p) => p.title !== "External issuer, Inji Verify");

  return (
    <>
      <PageHeader
        title="Run a credential journey"
        lede="Pick an issuer's credential, a wallet and a verifier. The playground issues the credential, presents it and verifies it, recording every protocol message on the way."
      />

      {catalog.isLoading || parties.isLoading ? (
        <p className="min-h-[100svh] text-muted">Loading credential types and parties…</p>
      ) : (
        <>
          <section aria-labelledby="presets" className="mb-8">
            <h2 id="presets" className="mb-3 text-lg">
              Start from a known journey
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {presets.map((p) => (
                <button
                  key={p.title}
                  onClick={() => applyPreset(p)}
                  className="rounded-md border border-hairline bg-surface px-3 py-3 text-left transition-colors duration-150 hover:border-ink"
                >
                  <span className="block font-bold">{p.title}</span>
                  <span className="mt-1 block text-sm text-muted">{p.note}</span>
                </button>
              ))}
            </div>
          </section>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
            <form
              className="flex min-w-0 flex-col gap-6"
              onSubmit={(e) => {
                e.preventDefault();
                start.mutate();
              }}
            >
              <Panel title="1. Credential">
                {!catalog.data?.length ? (
                  <Empty title="No credential types yet">
                    Design one in the{" "}
                    <Link className="text-issue underline" to="/studio">
                      Issuer Studio
                    </Link>
                    , or declare an external issuer in <code className="font-mono">infra/parties.yaml</code>.
                    If you just started the stack, the demo types appear once Inji Certify is ready.
                  </Empty>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Credential type"
                      hint={
                        type
                          ? `${formatLabel(type.format, type.dataModel)}, ${type.proof}${type.origin === "external" ? `. From ${type.issuerName}, declared in the parties file.` : ""}`
                          : undefined
                      }
                    >
                      {(id) => (
                        <Select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                          {grouped.map(([issuerId, g]) => (
                            <optgroup key={issuerId} label={g.external ? `${g.name} (external)` : g.name}>
                              {g.types.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.displayName}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field
                      label="PIN for the offer (optional)"
                      hint={
                        type?.origin === "external"
                          ? "Passed to the external issuer's offer step as ${txCode}."
                          : "4–8 letters or digits. The wallet must enter it to collect the credential (tx_code)."
                      }
                    >
                      {(id) => (
                        <Input
                          id={id}
                          value={txCode}
                          onChange={(e) => setTxCode(e.target.value)}
                          maxLength={8}
                          autoComplete="off"
                          placeholder="e.g. 4821"
                        />
                      )}
                    </Field>
                    {type?.origin === "external" && down(`issuer:${type.issuerId}`) && (
                      <div className="md:col-span-2">
                        <Notice tone="warn">
                          {type.issuerName} is not reachable right now (
                          {health[`issuer:${type.issuerId}`]!.detail}). Start the external lab with{" "}
                          <code className="font-mono">./playground.sh up --external</code>.
                        </Notice>
                      </div>
                    )}
                    {type?.origin === "external" && !type.canIssue && (
                      <div className="md:col-span-2">
                        <Notice>
                          This issuer has no offer API in the parties file. The run will ask you to get an
                          offer from it
                          {type.offerPage ? (
                            <>
                              {" "}
                              at{" "}
                              <a className="underline" href={type.offerPage}>
                                {type.offerPage}
                              </a>
                            </>
                          ) : (
                            ""
                          )}{" "}
                          and paste it in.
                        </Notice>
                      </div>
                    )}
                    {type && (
                      <fieldset className="md:col-span-2">
                        <legend className="mb-2 text-sm font-bold">Claim values (synthetic)</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {type.fields.map((f) => (
                            <Field key={f.name} label={f.label}>
                              {(id) =>
                                f.kind === "choice" ? (
                                  <Select
                                    id={id}
                                    value={claims[f.name] ?? ""}
                                    onChange={(e) => setClaims({ ...claims, [f.name]: e.target.value })}
                                  >
                                    {f.options?.map((o) => (
                                      <option key={o}>{o}</option>
                                    ))}
                                  </Select>
                                ) : (
                                  <Input
                                    id={id}
                                    type={
                                      f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"
                                    }
                                    step="any"
                                    value={claims[f.name] ?? ""}
                                    onChange={(e) => setClaims({ ...claims, [f.name]: e.target.value })}
                                  />
                                )
                              }
                            </Field>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}
              </Panel>

              <Panel
                title="2. Wallet"
                action={
                  <Link className="text-sm font-bold text-issue underline" to="/parties">
                    All wallets
                  </Link>
                }
              >
                <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Wallet">
                  {wallets.map((w) => (
                    <Choice
                      key={w.id}
                      name="wallet"
                      value={w.id}
                      current={wallet}
                      onChange={setWallet}
                      title={w.origin === "external" ? `${w.label} (external)` : w.label}
                      note={down(`wallet:${w.id}`) ? "Not reachable: start the external lab." : w.note}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="3. Presentation and verifier">
                <div className="flex flex-col gap-5">
                  <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="Verifier">
                    {verifiers.map((v) => (
                      <Choice
                        key={v.id}
                        name="verifier"
                        value={v.id}
                        current={verifier}
                        onChange={setVerifier}
                        title={v.origin === "external" ? `${v.label} (external)` : v.label}
                        note={down(`verifier:${v.id}`) ? "Not reachable: start the external lab." : v.note}
                        accent="present"
                      />
                    ))}
                  </div>
                  <div
                    className="grid gap-2 md:grid-cols-2"
                    role="radiogroup"
                    aria-label="How the holder presents"
                  >
                    <Choice
                      name="mode"
                      value={"openid4vp-cross-device" as PresentMode}
                      current={mode}
                      onChange={setMode}
                      title="OpenID4VP request"
                      note="The verifier asks; the wallet answers with only what was asked for."
                      accent="present"
                    />
                    <Choice
                      name="mode"
                      value={"direct-share" as PresentMode}
                      current={mode}
                      onChange={setMode}
                      disabled={!directShareOk}
                      title="Direct share"
                      note={
                        directShareOk
                          ? "The holder shows the whole credential as a PixelPass QR code."
                          : "Needs Inji Verify and a wallet that can show a credential's QR code."
                      }
                      accent="present"
                    />
                  </div>
                  {mode !== "direct-share" && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {verifierInfo?.ownQuery ? (
                        <p className="text-sm text-muted">
                          {verifierInfo.label} writes its own request (its query language is its choice, shown
                          in the inspector). The parties file tells it which credential to ask for.
                        </p>
                      ) : (
                        <div role="radiogroup" aria-label="Query language" className="flex flex-col gap-2">
                          <span className="text-sm font-bold">Query language</span>
                          <Choice
                            name="query"
                            value={"presentation_exchange" as QueryLanguage}
                            current={query}
                            onChange={setQuery}
                            title="Presentation Exchange"
                            note="OpenID4VP drafts 21–23, Inji 0.x."
                            accent="present"
                          />
                          <Choice
                            name="query"
                            value={"dcql" as QueryLanguage}
                            current={query}
                            onChange={setQuery}
                            title="DCQL"
                            note="OpenID4VP 1.0, Inji 1.0 line."
                            accent="present"
                          />
                        </div>
                      )}
                      {type && !verifierInfo?.ownQuery && (
                        <fieldset>
                          <legend className="mb-2 text-sm font-bold">Ask only for</legend>
                          <div className="flex flex-col gap-1.5">
                            {type.fields.map((f) => (
                              <label key={f.name} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={requested.includes(f.name)}
                                  onChange={(e) =>
                                    setRequested(
                                      e.target.checked
                                        ? [...requested, f.name]
                                        : requested.filter((x) => x !== f.name),
                                    )
                                  }
                                />
                                {f.label}
                                {type.format === "vc+sd-jwt" && !f.selectivelyDisclosable && (
                                  <Tag>always visible</Tag>
                                )}
                              </label>
                            ))}
                          </div>
                          <p className="mt-2 text-sm text-muted">
                            {type.format === "vc+sd-jwt"
                              ? "SD-JWT reveals only these claims."
                              : "JSON-LD credentials are shared whole; the request still names the claims it needs."}
                          </p>
                        </fieldset>
                      )}
                    </div>
                  )}
                  {dcqlToInji && (
                    <Notice tone="warn">
                      Inji Verify 0.18.2 only understands Presentation Exchange. The run will send the DCQL
                      request anyway and record how the verifier answers, which is the point of testing it.
                    </Notice>
                  )}
                  {formatMismatch && (
                    <Notice tone="warn">
                      {verifierInfo!.label} is configured for {verifierInfo!.formats.join(", ")} only; this
                      credential is {type!.format}.
                    </Notice>
                  )}
                </div>
              </Panel>

              {walletInfo?.supportsTamper && (
                <Panel title="4. Tamper (optional)">
                  <Field
                    label="Make the wallet misbehave"
                    hint={
                      TAMPER_PRESETS[tamper].explain +
                      (tamper !== "none" ? " A correct verifier rejects this." : "")
                    }
                  >
                    {(id) => (
                      <Select
                        id={id}
                        value={tamper}
                        onChange={(e) => setTamper(e.target.value as TamperPreset)}
                      >
                        {Object.entries(TAMPER_PRESETS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </Panel>
              )}

              {start.error && (
                <Notice tone="error">
                  {start.error instanceof ApiError ? start.error.message : "The run could not start."}
                </Notice>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  tone="primary"
                  type="submit"
                  busy={start.isPending}
                  disabled={!typeId || Boolean(formatMismatch)}
                  className="min-h-12 px-6 text-base"
                >
                  Start run
                </Button>
                <span className="text-sm text-muted">
                  {walletInfo?.interactive
                    ? "You will be shown QR codes to scan."
                    : "Runs on its own in a few seconds."}
                </span>
              </div>
            </form>

            <aside aria-labelledby="recent">
              <h2 id="recent" className="mb-3 text-lg">
                Recent runs
              </h2>
              {runs.data?.length ? (
                <ul className="flex flex-col divide-y divide-hairline rounded-[10px] border border-hairline bg-surface">
                  {runs.data.map((r) => (
                    <RecentRun key={r.id} run={r} />
                  ))}
                </ul>
              ) : (
                <Empty title="No runs yet">Your journeys will be listed here.</Empty>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}

export function verdictMark(r: Run) {
  if (r.status === "running") return <StatusMark mark="running">Running</StatusMark>;
  if (r.status === "waiting") return <StatusMark mark="waiting">Waiting</StatusMark>;
  if (!r.result) return <StatusMark mark="pending">{r.status}</StatusMark>;
  return r.result.verdict === "PASS" ? (
    <StatusMark mark="pass">As expected</StatusMark>
  ) : (
    <StatusMark mark="fail">Unexpected</StatusMark>
  );
}

function RecentRun({ run }: { run: Run }) {
  return (
    <li>
      <Link to={`/runs/${run.id}`} className="flex flex-col gap-1 px-3 py-2.5 hover:bg-sunken">
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-bold">{run.labels.typeName}</span>
          {verdictMark(run)}
        </span>
        <span className="text-sm text-muted">
          {run.labels.wallet} to {run.labels.verifier}
          {run.spec.tamper !== "none"
            ? `, tamper: ${TAMPER_PRESETS[run.spec.tamper].label.toLowerCase()}`
            : ""}
        </span>
        <span className="text-xs text-muted">{ago(run.createdAt)}</span>
      </Link>
    </li>
  );
}
