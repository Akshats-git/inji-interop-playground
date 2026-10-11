import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TAMPER_PRESETS, VERIFIERS, WALLETS, type CredentialType, type PresentMode, type QueryLanguage, type Run, type TamperPreset, type VerifierId, type WalletId } from "@playground/core";
import { api, ApiError } from "../lib/api";
import { ago, formatLabel } from "../lib/format";
import { Button, Choice, Empty, Field, Input, Notice, PageHeader, Panel, Select, StatusMark, Tag } from "../components/ui";

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

export function sampleClaims(t: CredentialType): Record<string, string> {
  return Object.fromEntries(
    t.fields.map((f) => [f.name, SAMPLES[f.name] ?? f.example ?? (f.kind === "choice" ? (f.options?.[1] ?? f.options?.[0] ?? "") : f.kind === "date" ? "2026-01-15" : f.kind === "number" ? "1" : f.kind === "boolean" ? "true" : `Sample ${f.label.toLowerCase()}`)]),
  );
}

interface Preset {
  title: string;
  note: string;
  match: (t: CredentialType) => boolean;
  verifier: VerifierId;
  mode: PresentMode;
  query: QueryLanguage;
  tamper: TamperPreset;
}

const PRESETS: Preset[] = [
  { title: "Farmer card, verified by Inji Verify", note: "W3C JSON-LD (VCDM 2.0), OpenID4VP with Presentation Exchange.", match: (t) => t.format === "ldp_vc" && t.typeName === "KarnatakaFarmerCard", verifier: "inji-verify", mode: "openid4vp-cross-device", query: "presentation_exchange", tamper: "none" },
  { title: "Selective disclosure with SD-JWT", note: "The shop asks only for the crop; name and land area stay hidden.", match: (t) => t.format === "vc+sd-jwt", verifier: "inji-verify", mode: "openid4vp-cross-device", query: "presentation_exchange", tamper: "none" },
  { title: "Same question in DCQL", note: "OpenID4VP 1.0 query language, answered to the Reference Verifier.", match: (t) => t.format === "vc+sd-jwt", verifier: "reference-verifier", mode: "openid4vp-cross-device", query: "dcql", tamper: "none" },
  { title: "Replay an old answer (SD-JWT)", note: "A stale nonce. Does the verifier notice?", match: (t) => t.format === "vc+sd-jwt", verifier: "inji-verify", mode: "openid4vp-cross-device", query: "presentation_exchange", tamper: "wrong-nonce" },
  { title: "Forged issuer signature", note: "An SD-JWT re-signed by an attacker with a self-signed certificate.", match: (t) => t.format === "vc+sd-jwt", verifier: "inji-verify", mode: "openid4vp-cross-device", query: "presentation_exchange", tamper: "self-signed-sdjwt" },
];

export function RunBuilderPage() {
  const nav = useNavigate();
  const types = useQuery({ queryKey: ["types"], queryFn: api.types });
  const issuers = useQuery({ queryKey: ["issuers"], queryFn: api.issuers });
  const runs = useQuery({ queryKey: ["runs", "recent"], queryFn: () => api.runs("?limit=12"), refetchInterval: 5000 });

  const [typeId, setTypeId] = useState("");
  const [wallet, setWallet] = useState<WalletId>("reference-wallet");
  const [verifier, setVerifier] = useState<VerifierId>("inji-verify");
  const [mode, setMode] = useState<PresentMode>("openid4vp-cross-device");
  const [query, setQuery] = useState<QueryLanguage>("presentation_exchange");
  const [tamper, setTamper] = useState<TamperPreset>("none");
  const [requested, setRequested] = useState<string[]>([]);
  const [claims, setClaims] = useState<Record<string, string>>({});
  const [txCode, setTxCode] = useState("");

  const type = types.data?.find((t) => t.id === typeId);
  useEffect(() => {
    if (!typeId && types.data?.length) setTypeId(types.data[0]!.id);
  }, [types.data, typeId]);
  useEffect(() => {
    if (!type) return;
    setClaims(sampleClaims(type));
    setRequested(type.fields.some((f) => f.name === "primaryCropType") ? ["primaryCropType"] : type.fields.slice(0, 1).map((f) => f.name));
  }, [type?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const issuerName = (slug: string) => issuers.data?.find((i) => i.slug === slug)?.name ?? slug;
  const grouped = useMemo(() => {
    const m = new Map<string, CredentialType[]>();
    for (const t of types.data ?? []) m.set(t.issuerSlug, [...(m.get(t.issuerSlug) ?? []), t]);
    return [...m.entries()];
  }, [types.data]);

  const start = useMutation({
    mutationFn: () => api.startRun({ typeId, wallet, verifier, mode, query, tamper: wallet === "reference-wallet" ? tamper : "none", requestedClaims: requested, claims, txCode: txCode || undefined }),
    onSuccess: (run) => nav(`/runs/${run.id}`),
  });

  const applyPreset = (p: Preset) => {
    const t = types.data?.find(p.match);
    if (!t) return;
    setTypeId(t.id);
    setWallet("reference-wallet");
    setVerifier(p.verifier);
    setMode(p.mode);
    setQuery(p.query);
    setTamper(p.tamper);
  };

  const dcqlToInji = verifier === "inji-verify" && query === "dcql" && mode !== "direct-share";

  return (
    <>
      <PageHeader
        title="Run a credential journey"
        lede="Pick an issuer's credential, a wallet and a verifier. The playground issues the credential, presents it and verifies it, recording every protocol message on the way."
      />

      <section aria-labelledby="presets" className="mb-8">
        <h2 id="presets" className="mb-3 text-lg">
          Start from a known journey
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {PRESETS.map((p) => (
            <button key={p.title} onClick={() => applyPreset(p)} className="rounded-md border border-hairline bg-surface px-3 py-3 text-left transition-colors duration-150 hover:border-ink">
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
            {types.isLoading ? (
              <p className="text-muted">Loading credential types…</p>
            ) : !types.data?.length ? (
              <Empty title="No credential types yet">
                Design one in the <Link className="text-issue underline" to="/studio">Issuer Studio</Link>. If you just started the stack, the demo types appear once Inji Certify is ready.
              </Empty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Credential type" hint={type ? `${formatLabel(type.format, type.format === "ldp_vc" ? type.dataModel : undefined)}, ${type.format === "ldp_vc" ? type.ldpSuite : `signed ${type.sdJwtAlg}`}` : undefined}>
                  {(id) => (
                    <Select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                      {grouped.map(([slug, list]) => (
                        <optgroup key={slug} label={issuerName(slug)}>
                          {list.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.displayName}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="PIN for the offer (optional)" hint="4–8 letters or digits. The wallet must enter it to collect the credential (tx_code).">
                  {(id) => <Input id={id} value={txCode} onChange={(e) => setTxCode(e.target.value)} maxLength={8} autoComplete="off" placeholder="e.g. 4821" />}
                </Field>
                {type && (
                  <fieldset className="md:col-span-2">
                    <legend className="mb-2 text-sm font-bold">Claim values (synthetic)</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {type.fields.map((f) => (
                        <Field key={f.name} label={f.label}>
                          {(id) =>
                            f.kind === "choice" ? (
                              <Select id={id} value={claims[f.name] ?? ""} onChange={(e) => setClaims({ ...claims, [f.name]: e.target.value })}>
                                {f.options?.map((o) => (
                                  <option key={o}>{o}</option>
                                ))}
                              </Select>
                            ) : (
                              <Input id={id} type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"} step="any" value={claims[f.name] ?? ""} onChange={(e) => setClaims({ ...claims, [f.name]: e.target.value })} />
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

          <Panel title="2. Wallet">
            <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Wallet">
              {(["reference-wallet", "inji-wallet", "external-wallet"] as WalletId[]).map((w) => (
                <Choice key={w} name="wallet" value={w} current={wallet} onChange={setWallet} title={WALLETS[w].label} note={w === "reference-wallet" ? "Automatic, no phone needed." : w === "inji-wallet" ? "Scan with the Inji app; needs a public URL." : "Any OpenID4VCI wallet that scans offers."} />
              ))}
            </div>
          </Panel>

          <Panel title="3. Presentation and verifier">
            <div className="flex flex-col gap-5">
              <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="Verifier">
                {(["inji-verify", "reference-verifier"] as VerifierId[]).map((v) => (
                  <Choice key={v} name="verifier" value={v} current={verifier} onChange={setVerifier} title={VERIFIERS[v].label} note={VERIFIERS[v].note} accent="present" />
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-2" role="radiogroup" aria-label="How the holder presents">
                <Choice name="mode" value={"openid4vp-cross-device" as PresentMode} current={mode} onChange={setMode} title="OpenID4VP request" note="The verifier asks; the wallet answers with only what was asked for." accent="present" />
                <Choice name="mode" value={"direct-share" as PresentMode} current={mode} onChange={setMode} title="Direct share" note="The holder shows the whole credential as a PixelPass QR code." accent="present" />
              </div>
              {mode !== "direct-share" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div role="radiogroup" aria-label="Query language" className="flex flex-col gap-2">
                    <span className="text-sm font-bold">Query language</span>
                    <Choice name="query" value={"presentation_exchange" as QueryLanguage} current={query} onChange={setQuery} title="Presentation Exchange" note="OpenID4VP drafts 21–23, Inji 0.x." accent="present" />
                    <Choice name="query" value={"dcql" as QueryLanguage} current={query} onChange={setQuery} title="DCQL" note="OpenID4VP 1.0, Inji 1.0 line." accent="present" />
                  </div>
                  {type && (
                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">Ask only for</legend>
                      <div className="flex flex-col gap-1.5">
                        {type.fields.map((f) => (
                          <label key={f.name} className="flex items-center gap-2">
                            <input type="checkbox" checked={requested.includes(f.name)} onChange={(e) => setRequested(e.target.checked ? [...requested, f.name] : requested.filter((x) => x !== f.name))} />
                            {f.label}
                            {type.format === "vc+sd-jwt" && !f.selectivelyDisclosable && <Tag>always visible</Tag>}
                          </label>
                        ))}
                      </div>
                      <p className="mt-2 text-sm text-muted">{type.format === "vc+sd-jwt" ? "SD-JWT reveals only these claims." : "JSON-LD credentials are shared whole; the request still names the claims it needs."}</p>
                    </fieldset>
                  )}
                </div>
              )}
              {dcqlToInji && <Notice tone="warn">Inji Verify 0.18.2 only understands Presentation Exchange. The run will send the DCQL request anyway and record how the verifier answers, which is the point of testing it.</Notice>}
            </div>
          </Panel>

          {wallet === "reference-wallet" && (
            <Panel title="4. Tamper (optional)">
              <Field label="Make the wallet misbehave" hint={TAMPER_PRESETS[tamper].explain + (tamper !== "none" ? " A correct verifier rejects this." : "")}>
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
            </Panel>
          )}

          {start.error && <Notice tone="error">{start.error instanceof ApiError ? start.error.message : "The run could not start."}</Notice>}
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="primary" type="submit" busy={start.isPending} disabled={!typeId} className="min-h-12 px-6 text-base">
              Start run
            </Button>
            <span className="text-sm text-muted">{WALLETS[wallet].interactive ? "You will be shown QR codes to scan." : "Runs on its own in a few seconds."}</span>
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
  );
}

export function verdictMark(r: Run) {
  if (r.status === "running") return <StatusMark mark="running">Running</StatusMark>;
  if (r.status === "waiting") return <StatusMark mark="waiting">Waiting</StatusMark>;
  if (!r.result) return <StatusMark mark="pending">{r.status}</StatusMark>;
  return r.result.verdict === "PASS" ? <StatusMark mark="pass">As expected</StatusMark> : <StatusMark mark="fail">Unexpected</StatusMark>;
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
          {run.spec.tamper !== "none" ? `, tamper: ${TAMPER_PRESETS[run.spec.tamper].label.toLowerCase()}` : ""}
        </span>
        <span className="text-xs text-muted">{ago(run.createdAt)}</span>
      </Link>
    </li>
  );
}
