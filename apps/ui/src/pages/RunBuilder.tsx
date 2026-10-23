import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  KNOWN_GAPS,
  knownGapOf,
  TAMPER_PRESETS,
  VERIFIERS,
  WALLETS,
  type CatalogType,
  type PresentMode,
  type QueryLanguage,
  type Run,
  type TamperPreset,
  type VerifierInfo,
  type VerifyRequestStyle,
  type WalletInfo,
} from "@playground/core";
import { api, ApiError } from "../lib/api";
import { ago, formatLabel, hostOf } from "../lib/format";
import { TestData } from "../components/TestData";
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
  cx,
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
  dcqlPaths?: "spec" | "inji";
  requested?: string[];
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
    title: "All Inji: Certify → Inji Wallet → Inji Verify",
    note: "The three Inji modules end to end. Needs Inji Wallet on a phone and ./playground.sh tunnel.",
    match: (t) => studio(t) && t.format === "ldp_vc" && t.typeName === "KarnatakaFarmerCard",
    wallet: "inji-wallet",
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "none",
  },
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
  {
    title: "MOSIP Collab, end to end",
    note: "Collab's mock issuer (sign-in at eSignet) to Collab's Inji Verify 1.0, in DCQL. No local Inji needed.",
    match: (t) => t.origin === "hosted" && t.configurationId === "MockVerifiableCredential_SD_JWT",
    verifier: "collab-verify",
    mode: "openid4vp-cross-device",
    query: "dcql",
    tamper: "none",
  },
  {
    title: "Collab credential, bundled Inji Verify 0.18",
    note: "A credential from Inji's 1.0 line on Collab, checked by the 0.x verifier in this bundle (Presentation Exchange).",
    match: (t) => t.origin === "hosted" && t.configurationId === "MockVerifiableCredential",
    verifier: "inji-verify",
    mode: "openid4vp-cross-device",
    query: "presentation_exchange",
    tamper: "none",
  },
  {
    title: "Bundled SD-JWT, Collab Inji Verify 1.0",
    note: "The bundled Certify 0.14's SD-JWT, asked for in DCQL by Inji Verify 1.0 on Collab.",
    match: (t) => studio(t) && t.format === "vc+sd-jwt",
    verifier: "collab-verify",
    mode: "openid4vp-cross-device",
    query: "dcql",
    tamper: "none",
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
  const [verifyRequest, setVerifyRequest] = useState<VerifyRequestStyle>("signed");
  const [loginMode, setLoginMode] = useState<"auto" | "interactive">("auto");
  const [identity, setIdentity] = useState("");
  const [dcqlPaths, setDcqlPaths] = useState<"spec" | "inji">("spec");
  const hostedEnvs = useQuery({ queryKey: ["hosted"], queryFn: api.hosted, staleTime: 5 * 60_000 });

  const type = catalog.data?.find((t) => t.id === typeId);
  const hosted = type?.hosted;
  const env = hosted ? hostedEnvs.data?.environments.find((e) => e.id === hosted.environmentId) : undefined;
  const identities = env?.testData.identities ?? [];
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
    const m = new Map<string, { name: string; origin: CatalogType["origin"]; env?: string; types: CatalogType[] }>();
    for (const t of catalog.data ?? []) {
      const key = `${t.origin}:${t.issuerId}`;
      const g = m.get(key) ?? { name: t.issuerName, origin: t.origin, env: t.hosted?.environmentName, types: [] };
      g.types.push(t);
      m.set(key, g);
    }
    const rank = { studio: 0, external: 1, hosted: 2 } as const;
    return [...m.entries()].sort((a, b) => rank[a[1].origin] - rank[b[1].origin]);
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
        verifyRequest,
        dcqlPaths,
        ...(type?.hosted ? { login: { mode: loginMode, individualId: identity || undefined } } : {}),
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
    setDcqlPaths(p.dcqlPaths ?? "spec");
  };

  // A verifier asked in a query language it does not speak: the run sends it anyway, and the refusal is the finding.
  const queryUnsupported = mode !== "direct-share" && verifierInfo && !verifierInfo.ownQuery && !verifierInfo.accepts.includes(query);
  const canAutoLogin = Boolean(hosted?.autoLogin);
  const walletCannotCollect = hosted && wallet === "reference-wallet" && !canAutoLogin;
  const formatMismatch =
    verifierInfo?.origin === "external" && type && !verifierInfo.formats.includes(type.format);
  const directShareOk =
    (walletInfo?.supportsDirectShare ?? true) && (verifierInfo?.supportsDirectShare ?? true);
  const presets = catalog.data ? PRESETS.filter((p) => catalog.data.some(p.match) && (!p.verifier.endsWith("-verify") || p.verifier === "inji-verify" || verifiers.some((v) => v.id === p.verifier))) : [];

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
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <form
            className="flex min-w-0 flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              start.mutate();
            }}
          >
            {/* The journey as three columns: Issuer → Wallet → Verifier. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
              <Column step={1} title="Issuer" accent="issue" arrow>
                {!catalog.data?.length ? (
                  <Empty title="No credential types yet">
                    Design one in the{" "}
                    <Link className="text-issue underline" to="/studio">
                      Issuer Studio
                    </Link>
                    , or declare an external issuer in <code className="font-mono">infra/parties.yaml</code>. If you just
                    started the stack, the demo types appear once Inji Certify is ready.
                  </Empty>
                ) : (
                  <div className="flex flex-col gap-4">
                    <Field
                      label="Issuer and credential type"
                      hint={
                        type
                          ? hosted
                            ? `${type.issuerName}: Inji Certify on ${hosted.environmentName} (OpenID4VCI ${hosted.protocol}, authorization code). ${formatLabel(type.format, type.dataModel)}, ${type.proof}.`
                            : `${type.issuerName}${type.origin === "external" ? " (external, from the parties file)" : ", issued by the bundled Inji Certify 0.14 (pre-authorized code)"}. ${formatLabel(type.format, type.dataModel)}, ${type.proof}.`
                          : undefined
                      }
                    >
                      {(id) => (
                        <Select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                          {grouped.map(([issuerId, g]) => (
                            <optgroup key={issuerId} label={g.origin === "external" ? `${g.name} (external)` : g.origin === "hosted" ? `${g.name} (${g.env}, hosted)` : g.name}>
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
                    {hosted ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-sm">
                          The holder signs in at <strong>{hostOf(hosted.authorizationServer)}</strong> (eSignet) and the claims come from that identity.
                        </p>
                        {wallet === "reference-wallet" &&
                          (canAutoLogin ? (
                            <>
                              <div role="radiogroup" aria-label="How the Reference Wallet signs in" className="grid gap-2">
                                <Choice name="login" value={"auto" as const} current={loginMode} onChange={setLoginMode} title="Automatically" note={`As a demo identity with ${env?.name ?? "the environment"}'s test OTP. No person needed.`} />
                                <Choice name="login" value={"interactive" as const} current={loginMode} onChange={setLoginMode} title="I'll sign in myself" note="eSignet's own page opens in a tab; it sends you back here." />
                              </div>
                              {loginMode === "auto" && identities.length > 0 && (
                                <Field label="Demo identity">
                                  {(id) => (
                                    <Select id={id} value={identity} onChange={(e) => setIdentity(e.target.value)}>
                                      {identities.map((i, n) => (
                                        <option key={i.id} value={n === 0 ? "" : i.id}>
                                          {i.id}, {i.label}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </Field>
                              )}
                            </>
                          ) : (
                            <Notice tone="warn">
                              The Reference Wallet has no OAuth client at {hostOf(hosted.authorizationServer)}, so it cannot collect this one. Choose <strong>Inji Wallet (mobile)</strong>: it signs in through {hosted.environmentName}'s Mimoto.
                            </Notice>
                          ))}
                      </div>
                    ) : (
                      <Field
                        label="PIN for the offer (optional)"
                        hint={
                          type?.origin === "external"
                            ? "Passed to the external issuer's offer step as ${txCode}."
                            : "4–8 letters or digits. The wallet must enter it to collect the credential (tx_code)."
                        }
                      >
                        {(id) => <Input id={id} value={txCode} onChange={(e) => setTxCode(e.target.value)} maxLength={8} autoComplete="off" placeholder="e.g. 4821" />}
                      </Field>
                    )}
                    {type?.origin === "external" && down(`issuer:${type.issuerId}`) && (
                      <Notice tone="warn">
                        {type.issuerName} is not reachable right now ({health[`issuer:${type.issuerId}`]!.detail}). Start the external lab with{" "}
                        <code className="font-mono">./playground.sh up --external</code>.
                      </Notice>
                    )}
                    {type?.origin === "external" && !type.canIssue && (
                      <Notice>
                        This issuer has no offer API in the parties file. The run will ask you to get an offer from it
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
                    )}
                    <Link className="self-start text-sm font-bold text-issue underline" to="/studio">
                      Design your own issuer or type
                    </Link>
                  </div>
                )}
              </Column>

              <Column
                step={2}
                title="Wallet"
                arrow
                action={
                  <Link className="text-sm font-bold text-issue underline" to="/parties">
                    All wallets
                  </Link>
                }
              >
                <div className="grid gap-2" role="radiogroup" aria-label="Wallet">
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
              </Column>

              <Column step={3} title="Verifier" accent="present">
                <div className="flex flex-col gap-5">
                  <div className="grid gap-2" role="radiogroup" aria-label="Verifier">
                    {verifiers.map((v) => (
                      <Choice
                        key={v.id}
                        name="verifier"
                        value={v.id}
                        current={verifier}
                        onChange={setVerifier}
                        title={v.origin === "external" ? `${v.label} (external)` : v.label}
                        note={down(v.origin === "hosted" ? `hosted:${v.environmentId}:verify` : `verifier:${v.id}`) ? (v.origin === "hosted" ? "Not reachable right now: check the internet connection." : "Not reachable: start the external lab.") : v.note}
                        accent="present"
                      />
                    ))}
                  </div>
                  <div className="grid gap-2" role="radiogroup" aria-label="How the holder presents">
                    <span className="text-sm font-bold">How the holder presents</span>
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
                      note={directShareOk ? "The holder shows the whole credential as a PixelPass QR code." : "Needs Inji Verify and a wallet that can show a credential's QR code."}
                      accent="present"
                    />
                  </div>
                  {mode !== "direct-share" &&
                    (verifierInfo?.ownQuery ? (
                      <p className="text-sm text-muted">
                        {verifierInfo.label} writes its own request (its query language is its choice, shown in the inspector). The parties file tells it which
                        credential to ask for.
                      </p>
                    ) : (
                      <div role="radiogroup" aria-label="Query language" className="grid gap-2">
                        <span className="text-sm font-bold">Query language</span>
                        <Choice name="query" value={"presentation_exchange" as QueryLanguage} current={query} onChange={setQuery} title="Presentation Exchange" note="OpenID4VP drafts 21–23, Inji 0.x." accent="present" />
                        <Choice name="query" value={"dcql" as QueryLanguage} current={query} onChange={setQuery} title="DCQL" note="OpenID4VP 1.0, Inji 1.0 line." accent="present" />
                      </div>
                    ))}
                  {verifier === "inji-verify" && mode !== "direct-share" && query === "presentation_exchange" && (
                    <div role="radiogroup" aria-label="How Inji Verify sends its request" className="grid gap-2">
                      <span className="text-sm font-bold">How Inji Verify sends its request</span>
                      <Choice
                        name="verifyRequest"
                        value={"signed" as VerifyRequestStyle}
                        current={verifyRequest}
                        onChange={setVerifyRequest}
                        title="Signed, by reference"
                        note="client_id is Verify's did:web; the wallet fetches a signed request object. Small QR. Best for phones."
                        accent="present"
                      />
                      <Choice
                        name="verifyRequest"
                        value={"by-value" as VerifyRequestStyle}
                        current={verifyRequest}
                        onChange={setVerifyRequest}
                        title="Unsigned, by value"
                        note="A pre-registered client id with the whole request in the QR, as the SDK does by default (gap G25)."
                        accent="present"
                      />
                    </div>
                  )}
                  {mode !== "direct-share" && !verifierInfo?.ownQuery && query === "dcql" && type?.format === "ldp_vc" && (
                    <div role="radiogroup" aria-label="DCQL claim paths" className="grid gap-2">
                      <span className="text-sm font-bold">DCQL claim paths</span>
                      <Choice name="dcqlPaths" value={"spec" as const} current={dcqlPaths} onChange={setDcqlPaths} title="From the credential" note={'["credentialSubject", "x"], as OpenID4VP 1.0 says.'} accent="present" />
                      <Choice name="dcqlPaths" value={"inji" as const} current={dcqlPaths} onChange={setDcqlPaths} title="From credentialSubject" note={'["x"], as Inji\'s guide and Inji Verify 1.0 expect (gap G36).'} accent="present" />
                    </div>
                  )}
                  {queryUnsupported && verifierInfo && (
                    <Notice tone="warn">
                      {verifierInfo.label} only understands {verifierInfo.accepts.map((a) => (a === "dcql" ? "DCQL" : "Presentation Exchange")).join(" and ")}. The run will send the{" "}
                      {query === "dcql" ? "DCQL" : "Presentation Exchange"} request anyway and record how the verifier answers, which is the point of testing it.
                    </Notice>
                  )}
                  {formatMismatch && (
                    <Notice tone="warn">
                      {verifierInfo!.label} is configured for {verifierInfo!.formats.join(", ")} only; this credential is {type!.format}.
                    </Notice>
                  )}
                </div>
              </Column>
            </div>

            {type && (
              <Panel title="Claims and request">
                <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
                  {hosted ? (
                    <div className="flex min-w-0 flex-col gap-3">
                      <p className="text-sm">
                        <strong>{type.issuerName}</strong> fills the claims from its own records for the person who signs in, so there is nothing to type here. It
                        advertises {type.fields.length} claim{type.fields.length === 1 ? "" : "s"}: {type.fields.map((f) => f.label).join(", ") || "none listed"}.
                      </p>
                      {(wallet !== "reference-wallet" || loginMode === "interactive") && <TestData environment={hosted.environmentId} issuerId={type.issuerId} />}
                    </div>
                  ) : (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">Claim values the issuer signs (synthetic)</legend>
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
                              <Input
                                id={id}
                                type={f.kind === "date" ? "date" : f.kind === "number" ? "number" : "text"}
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
                  {mode !== "direct-share" && !verifierInfo?.ownQuery && (
                    <fieldset>
                      <legend className="mb-2 text-sm font-bold">The verifier asks only for</legend>
                      <div className="flex flex-col gap-1.5">
                        {type.fields.map((f) => (
                          <label key={f.name} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={requested.includes(f.name)}
                              onChange={(e) => setRequested(e.target.checked ? [...requested, f.name] : requested.filter((x) => x !== f.name))}
                            />
                            {f.label}
                            {type.format === "vc+sd-jwt" && !f.selectivelyDisclosable && <Tag>always visible</Tag>}
                          </label>
                        ))}
                      </div>
                      <p className="mt-2 text-sm text-muted">
                        {type.format === "vc+sd-jwt" ? "SD-JWT reveals only these claims." : "JSON-LD credentials are shared whole; the request still names the claims it needs."}
                      </p>
                    </fieldset>
                  )}
                </div>
              </Panel>
            )}

            {walletInfo?.supportsTamper && (
              <Panel title="Tamper (optional)">
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
              <Button tone="primary" type="submit" busy={start.isPending} disabled={!typeId || Boolean(formatMismatch) || Boolean(walletCannotCollect)} className="min-h-12 px-6 text-base">
                Start run
              </Button>
              <span className="text-sm text-muted">
                {type && walletInfo && verifierInfo ? `${type.issuerName} → ${walletInfo.label} → ${verifierInfo.label}. ` : ""}
                {walletInfo?.interactive ? "You will be shown QR codes to scan." : hosted && loginMode === "interactive" ? "You will sign in at eSignet in a new tab." : "Runs on its own in a few seconds."}
              </span>
            </div>
          </form>

          <section aria-labelledby="recent" className="mt-10">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="recent" className="text-lg">
                Recent runs
              </h2>
              <Link className="text-sm font-bold text-issue underline" to="/results">
                All results
              </Link>
            </div>
            {runs.data?.length ? (
              <ul className="grid overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-2 xl:grid-cols-4" style={{ gap: 1 }}>
                {runs.data.slice(0, 8).map((r) => (
                  <RecentRun key={r.id} run={r} />
                ))}
              </ul>
            ) : (
              <Empty title="No runs yet">Your journeys will be listed here.</Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}

/** One column of the Issuer → Wallet → Verifier selector, with an arrow to the next on wide screens. */
function Column({ step, title, accent, arrow, action, children }: { step: number; title: string; accent?: "issue" | "present"; arrow?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`col-${step}`} className="relative flex min-w-0 flex-col rounded-[10px] border border-hairline bg-surface">
      <div className={cx("h-1.5 rounded-t-[10px]", accent === "issue" ? "bg-issue" : accent === "present" ? "bg-present" : "bg-ink")} aria-hidden />
      <div className="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-3">
        <h2 id={`col-${step}`} className="text-lg">
          <span className="text-muted">{step}.</span> {title}
        </h2>
        {action}
      </div>
      <div className="flex-1 p-4">{children}</div>
      {arrow && (
        <span aria-hidden className="absolute top-7 -right-[1.15rem] z-10 hidden size-8 place-items-center rounded-full border border-hairline bg-surface text-lg font-black lg:grid">
          →
        </span>
      )}
    </section>
  );
}

export function verdictMark(r: Run) {
  if (r.status === "running") return <StatusMark mark="running">Running</StatusMark>;
  if (r.status === "waiting") return <StatusMark mark="waiting">Waiting</StatusMark>;
  if (!r.result) return <StatusMark mark="pending">{r.status}</StatusMark>;
  if (r.result.verdict === "PASS") return <StatusMark mark="pass">As expected</StatusMark>;
  const gap = knownGapOf(r);
  return gap ? (
    <span title={KNOWN_GAPS[gap]}>
      <StatusMark mark="warn">Known gap {gap}</StatusMark>
    </span>
  ) : (
    <StatusMark mark="fail">Unexpected</StatusMark>
  );
}

function RecentRun({ run }: { run: Run }) {
  return (
    <li>
      <Link to={`/runs/${run.id}`} className="flex h-full flex-col gap-1 bg-surface px-3 py-2.5 hover:bg-sunken">
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
