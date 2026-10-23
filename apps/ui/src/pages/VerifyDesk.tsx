import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { OpenID4VPVerification, QRCodeVerification } from "@injistack/react-inji-verify-sdk";
import { explainMapping, toDcql, toPresentationDefinition, validateDcql, type CatalogType, type DcqlPathStyle, type PeDialect, type QuerySpec } from "@playground/core";
import { api } from "../lib/api";
import { formatLabel } from "../lib/format";
import { JsonView } from "../components/JsonView";
import { Button, cx, Empty, Field, Notice, PageHeader, Panel, Select, StatusMark, Tag } from "../components/ui";

/** The SDK talks to Inji Verify through the playground's recording gateway, so every call shows up in Live traffic. */
const VERIFY_SERVICE_URL = "/pub/verify/v1/verify";
const CLIENT_ID = "inji-playground";
/** The SDK's same-device flow opens openid4vp:// on this device; on a desktop it would need a web wallet. */
const IS_PHONE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function specFor(t: CatalogType, claims: string[]): QuerySpec {
  return {
    id: `${t.issuerId}-${t.typeName ?? t.configurationId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    purpose: `Show your ${t.displayName}`,
    format: t.format,
    typeName: t.typeName,
    typeIri: t.typeIri,
    vct: t.vct,
    claims,
    requireHolderBinding: true,
  };
}

type SdkResult = { vc: unknown; verificationResponse: Record<string, unknown> };

/** Normalise the SDK's three result shapes (V2 checks, summarised VC, summarised VP) into one status per credential. */
function statusOf(r: SdkResult): string {
  const v = r.verificationResponse;
  if (typeof v.verificationStatus === "string") return v.verificationStatus;
  if (typeof v.vcStatus === "string") return v.vcStatus;
  if (typeof v.allChecksSuccessful === "boolean") return v.allChecksSuccessful ? "SUCCESS" : "INVALID";
  if (typeof v.vpResultStatus === "string") return v.vpResultStatus;
  return "UNKNOWN";
}

function Results({ results }: { results: SdkResult[] }) {
  return (
    <div className="flex flex-col gap-3">
      {results.map((r, i) => {
        const s = statusOf(r);
        const vc = (typeof r.vc === "string" ? { raw: r.vc } : r.vc) as Record<string, unknown>;
        const types = ([] as unknown[]).concat(vc?.type ?? []).filter((t) => t !== "VerifiableCredential");
        return (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-hairline p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{String(types[0] ?? vc?.vct ?? "Credential")}</span>
              <StatusMark mark={s === "SUCCESS" ? "pass" : s === "EXPIRED" ? "warn" : "fail"}>{s === "SUCCESS" ? "Valid" : s.toLowerCase()}</StatusMark>
            </div>
            <JsonView value={r.verificationResponse} maxHeight="12rem" />
          </div>
        );
      })}
    </div>
  );
}

function RequestBuilder({ types, type, setTypeId, claims, setClaims }: { types: CatalogType[]; type?: CatalogType; setTypeId: (id: string) => void; claims: string[]; setClaims: (c: string[]) => void }) {
  const groups = [...new Set(types.map((t) => t.issuerId))].map((issuerId) => types.filter((t) => t.issuerId === issuerId));
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_1fr]">
      <Field label="Ask for" hint={type ? `${formatLabel(type.format, type.dataModel)}${type.origin === "external" ? `, issued by ${type.issuerName} (external)` : ""}` : undefined}>
        {(id) => (
          <Select id={id} value={type?.id ?? ""} onChange={(e) => setTypeId(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g[0]!.issuerId} label={g[0]!.origin === "external" ? `${g[0]!.issuerName} (external)` : g[0]!.issuerName}>
                {g.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      {type && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Claims the verifier needs</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {type.fields.map((f) => (
              <label key={f.name} className="flex items-center gap-2">
                <input type="checkbox" checked={claims.includes(f.name)} onChange={(e) => setClaims(e.target.checked ? [...claims, f.name] : claims.filter((x) => x !== f.name))} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function LiveRequest({ spec }: { spec: QuerySpec }) {
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<SdkResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const pd = useMemo(() => toPresentationDefinition(spec, "inji"), [spec]);
  const status = useQuery({ queryKey: ["status"], queryFn: api.status });
  const [style, setStyle] = useState<"signed" | "by-value">("signed");
  const didClientId = status.data?.verifyClientIds.signed ?? null;
  const clientId = style === "signed" && didClientId ? didClientId : CLIENT_ID;
  const restart = () => {
    setResults(null);
    setError(null);
    setExpired(false);
    setAttempt((n) => n + 1);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        This uses MOSIP's own <code className="font-mono">@injistack/react-inji-verify-sdk</code> against the bundled Inji Verify, exactly as a relying party's website would. Scan the QR code with Inji Wallet, or copy the request into the <Link to="/wallet" className="text-issue underline">Reference Wallet</Link>.
      </p>
      <div role="radiogroup" aria-label="How Inji Verify sends its request" className="flex flex-wrap gap-1 self-start rounded-md bg-sunken p-1 text-sm">
        {(
          [
            ["signed", "Signed, by reference"],
            ["by-value", "Unsigned, by value"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={style === v} disabled={v === "signed" && !didClientId} onClick={() => setStyle(v)} className={cx("rounded px-2.5 py-0.5 font-bold disabled:opacity-50", style === v ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-sm text-muted">
        {style === "signed" && didClientId
          ? `client_id is Inji Verify's DID, so it signs the request and the QR only carries a request_uri: small enough for any phone camera.`
          : `client_id "${CLIENT_ID}" is not a DID, so Inji Verify puts the whole request in the QR, unsigned and dense (gap G25).`}
        {IS_PHONE ? " On this phone, the SDK's same-device button opens your wallet app directly." : ""}
      </p>
      <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-md bg-sunken p-4 [&_button]:cursor-pointer">
        <OpenID4VPVerification
          key={`${attempt}-${pd.id}-${spec.claims.join(",")}-${clientId}`}
          verifyServiceUrl={VERIFY_SERVICE_URL}
          clientId={clientId}
          presentationDefinition={pd as never}
          isSameDeviceFlowEnabled={IS_PHONE}
          qrCodeStyles={{ size: 220, level: "M", fgColor: "#16233F", bgColor: "#FFFFFF", margin: 8, borderRadius: 8 }}
          triggerElement={<Button tone="primary">Create presentation request</Button>}
          onVPProcessed={(r) => setResults(r as unknown as SdkResult[])}
          onQrCodeExpired={() => setExpired(true)}
          onError={(e) => setError(`${e.errorMessage}${e.errorCode ? ` (${e.errorCode})` : ""}`)}
        />
      </div>
      {expired && (
        <Notice tone="warn">
          The request expired before a wallet answered.{" "}
          <button className="font-bold underline" onClick={restart}>
            Create a new one
          </button>
        </Notice>
      )}
      {error && (
        <Notice tone="error">
          Inji Verify reported: {error}.{" "}
          <button className="font-bold underline" onClick={restart}>
            Try again
          </button>
        </Notice>
      )}
      {results && (
        <>
          <Results results={results} />
          <Button onClick={restart} className="self-start">
            Verify another
          </Button>
        </>
      )}
    </div>
  );
}

type Check = { name: string; ok: boolean; detail?: string };

/** Inji Verify's v2 answer, check by check (the SDK only passes on the first error's message). */
function checksOf(body: Record<string, unknown>): Check[] {
  const err = (e: unknown) => (e && typeof e === "object" ? `${String((e as Record<string, unknown>).errorCode ?? "")}: ${String((e as Record<string, unknown>).errorMessage ?? "")}` : undefined);
  const sig = body.schemaAndSignatureCheck as { valid?: boolean; error?: unknown } | undefined;
  const exp = body.expiryCheck as { valid?: boolean } | null | undefined;
  const status = (body.statusCheck as { purpose?: string; valid?: boolean; error?: unknown }[] | undefined) ?? [];
  return [
    ...(sig ? [{ name: "Issuer signature and schema", ok: Boolean(sig.valid), detail: sig.error ? err(sig.error) : undefined }] : []),
    ...(exp ? [{ name: "Not expired", ok: Boolean(exp.valid) }] : []),
    ...status.map((st) => ({ name: `Status (${st.purpose ?? "revocation"})`, ok: Boolean(st.valid), detail: st.error ? err(st.error) : undefined })),
  ];
}

/**
 * When the SDK reports an error, Inji Verify has often still answered with a full result (for example: signature
 * valid, but the status list could not be fetched). The gateway recorded that answer, so show it check by check.
 */
function DirectShareError({ message }: { message: string }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const recent = await api.events("?limit=20").catch(() => []);
      const hit = recent.find((e) => e.title.startsWith("Verify credential") && Date.now() - new Date(e.at).getTime() < 60_000);
      if (!hit) return;
      const ev = await api.event(hit.id).catch(() => undefined);
      const body = ev?.response?.body;
      if (live && body && typeof body === "object") setChecks(checksOf(body as Record<string, unknown>));
    })();
    return () => {
      live = false;
    };
  }, [message]);
  return (
    <Notice tone="error">
      <span className="block">The SDK reported: {message}</span>
      {checks?.length ? (
        <>
          <span className="mt-2 block font-bold">Inji Verify's own answer, check by check:</span>
          <ul className="mt-1 flex flex-col gap-1">
            {checks.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={cx("font-black", c.ok ? "text-pass" : "text-fail")} aria-label={c.ok ? "passed" : "failed"}>
                  {c.ok ? "✓" : "✕"}
                </span>
                <span>
                  {c.name}
                  {c.detail && <span className="block break-all text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Notice>
  );
}

function DirectShare() {
  const [results, setResults] = useState<SdkResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The camera starts only when asked for, so opening the page never triggers a permission prompt.
  const [camera, setCamera] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Scan or upload a credential's own QR code (PixelPass). No OpenID4VP exchange: the verifier checks the issuer's signature, expiry and status directly. Inji Verify reads up to QR version 27 by camera and 32 by upload.</p>
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-md bg-sunken p-4">
        <QRCodeVerification
          key={`${attempt}-${camera}`}
          verifyServiceUrl={VERIFY_SERVICE_URL}
          clientId={CLIENT_ID}
          isEnableZoom
          isEnableScan={camera}
          scannerActive={camera}
          onClose={() => setCamera(false)}
          triggerElement={<Button tone="primary">Upload a QR code image</Button>}
          onVCProcessed={(r) => {
            setError(null);
            setResults(r as unknown as SdkResult[]);
          }}
          onError={(e) => setError(e.message)}
        />
        <Button onClick={() => setCamera((c) => !c)} aria-pressed={camera}>
          {camera ? "Stop the camera" : "Scan with the camera"}
        </Button>
      </div>
      {error && <DirectShareError message={error} />}
      {results && (
        <>
          <Results results={results} />
          <Button
            onClick={() => {
              setResults(null);
              setAttempt((n) => n + 1);
            }}
            className="self-start"
          >
            Verify another
          </Button>
        </>
      )}
    </div>
  );
}

function QueryCompare({ spec }: { spec: QuerySpec }) {
  const [dialect, setDialect] = useState<PeDialect>("inji");
  const [paths, setPaths] = useState<DcqlPathStyle>("spec");
  const pe = useMemo(() => toPresentationDefinition(spec, dialect), [spec, dialect]);
  const dcql = useMemo(() => toDcql(spec, { pathStyle: paths }), [spec, paths]);
  const problems = validateDcql(dcql);
  const mapping = explainMapping(spec);
  const hl = (k: string) => ["path", "filter", "type_values", "vct_values", "require_cryptographic_holder_binding", "limit_disclosure"].includes(k);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="pe-title" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="pe-title" className="text-base">
              Presentation Exchange <Tag tone="present">Inji 0.x, OpenID4VP drafts</Tag>
            </h3>
            <div role="radiogroup" aria-label="Type filter style" className="flex gap-1 rounded-md bg-sunken p-1 text-sm">
              {(
                [
                  ["inji", "Inji style"],
                  ["spec", "Spec style"],
                ] as const
              ).map(([d, l]) => (
                <button key={d} role="radio" aria-checked={dialect === d} onClick={() => setDialect(d)} className={cx("rounded px-2.5 py-0.5 font-bold", dialect === d ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="text-sm text-muted">{dialect === "inji" ? "Inji writes the type filter as a regex pattern on $.type. It works with Inji's wallets, but it is not valid JSON Schema for an array." : "The PE spec's examples write it as an array that contains the type. Some Inji components do not match this form."}</p>
          <JsonView value={pe} highlight={hl} maxHeight="30rem" openDepth={10} />
        </section>
        <section aria-labelledby="dcql-title" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="dcql-title" className="text-base">
              DCQL <Tag tone="present">OpenID4VP 1.0, Inji 1.0 line</Tag>
            </h3>
            {spec.format === "ldp_vc" && (
              <div role="radiogroup" aria-label="Claim path style" className="flex gap-1 rounded-md bg-sunken p-1 text-sm">
                {(
                  [
                    ["spec", "Spec style"],
                    ["inji", "Inji 1.0 style"],
                  ] as const
                ).map(([d, l]) => (
                  <button key={d} role="radio" aria-checked={paths === d} onClick={() => setPaths(d)} className={cx("rounded px-2.5 py-0.5 font-bold", paths === d ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-muted">
            The same question in DCQL. Paths become arrays, and the type is matched by {spec.format === "ldp_vc" ? "expanded JSON-LD type IRIs" : "an exact vct string"}.
            {spec.format === "ldp_vc" &&
              (paths === "spec"
                ? " OpenID4VP 1.0 reads claim paths from the credential's root, so they start with credentialSubject."
                : " Inji's PEX-to-DCQL guide drops credentialSubject, and Inji Verify 1.0 only accepts that form (gap G36).")}
          </p>
          <JsonView value={dcql} highlight={hl} maxHeight="30rem" openDepth={10} />
          {problems.length > 0 && (
            <Notice tone="warn">
              {problems.map((p) => (
                <span key={p.code + p.message} className="block">
                  <strong>{p.code}</strong>: {p.message}
                </span>
              ))}
            </Notice>
          )}
        </section>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="mb-2 text-left font-bold">Field by field</caption>
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3 font-semibold">Presentation Exchange</th>
              <th className="py-1 pr-3 font-semibold">DCQL</th>
              <th className="py-1 font-semibold">What changes</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((m) => (
              <tr key={m.pe + m.dcql} className="border-t border-hairline align-top">
                <td className="py-1.5 pr-3 font-mono text-xs break-all">{m.pe}</td>
                <td className="py-1.5 pr-3 font-mono text-xs break-all">{m.dcql}</td>
                <td className="py-1.5">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function VerifyDeskPage() {
  const types = useQuery({ queryKey: ["catalog"], queryFn: api.catalog });
  const [typeId, setTypeId] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  const type = types.data?.find((t) => t.id === typeId);
  useEffect(() => {
    if (!typeId && types.data?.length) setTypeId(types.data[0]!.id);
  }, [types.data, typeId]);
  useEffect(() => {
    if (type) setClaims(type.fields.some((f) => f.name === "primaryCropType") ? ["primaryCropType"] : type.fields.slice(0, 1).map((f) => f.name));
  }, [type?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const spec = useMemo(() => (type ? specFor(type, claims) : null), [type, claims]);

  return (
    <>
      <PageHeader title="Verifier desk" lede="Stand where a relying party stands: ask a wallet for a credential with Inji Verify's own SDK, check a credential's QR code directly, and see the same request written in both query languages." />
      {types.isLoading ? (
        <p className="text-muted">Loading credential types…</p>
      ) : !types.data?.length || !spec ? (
        <Empty title="No credential types to ask for">Design one in the Issuer Studio, or declare an external issuer in infra/parties.yaml; the verifier needs to know what it is asking for.</Empty>
      ) : (
        <div className="flex flex-col gap-6">
          <Panel title="What the verifier asks for">
            <RequestBuilder types={types.data} type={type} setTypeId={setTypeId} claims={claims} setClaims={setClaims} />
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Ask a wallet (OpenID4VP)" className="border-t-4 border-t-present">
              <LiveRequest spec={spec} />
            </Panel>
            <Panel title="Check a credential's QR code" className="border-t-4 border-t-present">
              <DirectShare />
            </Panel>
          </div>
          <Panel title="One question, two query languages">
            <QueryCompare spec={spec} />
          </Panel>
        </div>
      )}
    </>
  );
}
