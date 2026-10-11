import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CredentialType, FieldDef, FieldKind } from "@playground/core";
import { api, ApiError, type IssuerWithTypes } from "../lib/api";
import { formatLabel } from "../lib/format";
import { JsonView } from "../components/JsonView";
import { QrCode } from "../components/QrCode";
import { Button, Choice, cx, Empty, Field, Input, Notice, PageHeader, Panel, Select, Tag } from "../components/ui";
import { sampleClaims } from "./RunBuilder";

type Draft = {
  issuerSlug: string;
  displayName: string;
  typeName: string;
  description: string;
  format: "ldp_vc" | "vc+sd-jwt";
  dataModel: "1.1" | "2.0";
  ldpSuite: string;
  sdJwtAlg: string;
  issuerForm: "string" | "object";
  revocable: boolean;
  expiresAt: string;
  fields: (Pick<FieldDef, "name" | "label" | "kind" | "required" | "selectivelyDisclosable"> & { options: string })[];
};

const pascal = (s: string) =>
  s
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("")
    .replace(/^[^A-Z]+/, "");
const camel = (s: string) => {
  const p = pascal(s);
  return p ? p[0]!.toLowerCase() + p.slice(1) : "";
};

const EMPTY_DRAFT: Draft = {
  issuerSlug: "",
  displayName: "",
  typeName: "",
  description: "",
  format: "ldp_vc",
  dataModel: "2.0",
  ldpSuite: "Ed25519Signature2020",
  sdJwtAlg: "ES256",
  issuerForm: "string",
  revocable: false,
  expiresAt: "",
  fields: [
    { name: "fullName", label: "Full name", kind: "text", required: true, selectivelyDisclosable: true, options: "" },
    { name: "memberId", label: "Member ID", kind: "text", required: true, selectivelyDisclosable: true, options: "" },
  ],
};

function toPayload(d: Draft) {
  return {
    ...d,
    expiresAt: d.expiresAt ? new Date(d.expiresAt).toISOString() : "",
    fields: d.fields.map((f) => ({ ...f, options: f.kind === "choice" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined })),
  };
}

/** What the credential will look like in a wallet: issuer branding plus the claim labels. */
function CardPreview({ issuer, d }: { issuer?: IssuerWithTypes; d: Draft }) {
  return (
    <div className="aspect-[1.586] w-full max-w-[22rem] rounded-xl p-4 shadow-[0_1px_0_rgba(0,0,0,0.05)]" style={{ background: issuer?.backgroundColor ?? "#1F4D3A", color: issuer?.textColor ?? "#fff" }}>
      <div className="flex h-full flex-col justify-between">
        <div>
          <p className="text-xs font-bold opacity-80">{issuer?.name ?? "Choose an issuer"}</p>
          <p className="text-xl leading-tight font-black">{d.displayName || "Credential name"}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {d.fields.slice(0, 4).map((f) => (
            <div key={f.name}>
              <dt className="opacity-75">{f.label || f.name}</dt>
              <dd className="font-bold">{f.kind === "choice" ? f.options.split(",")[0] : "…"}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[0.7rem] opacity-75">{formatLabel(d.format, d.format === "ldp_vc" ? d.dataModel : undefined)}</p>
      </div>
    </div>
  );
}

function IssuerForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", slug: "", description: "", backgroundColor: "#2B2D6E", textColor: "#F5F1FF", logoUrl: "" });
  const create = useMutation({
    mutationFn: () => api.createIssuer(f),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["issuers"] });
      onDone();
    },
  });
  const err = create.error instanceof ApiError ? create.error : undefined;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Issuer name">{(id) => <Input id={id} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) })} placeholder="e.g. Veridonia Transport Authority" />}</Field>
      <Field label="Short id" hint="Used in URLs and Certify config ids.">{(id) => <Input id={id} required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} pattern="[a-z][a-z0-9-]{1,30}[a-z0-9]" />}</Field>
      <Field label="What it issues">{(id) => <Input id={id} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Card colour">{(id) => <Input id={id} type="color" value={f.backgroundColor} onChange={(e) => setF({ ...f, backgroundColor: e.target.value.toUpperCase() })} className="p-1" />}</Field>
        <Field label="Text colour">{(id) => <Input id={id} type="color" value={f.textColor} onChange={(e) => setF({ ...f, textColor: e.target.value.toUpperCase() })} className="p-1" />}</Field>
      </div>
      {err && <Notice tone="error">{err.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") || err.message}</Notice>}
      <div className="flex gap-2">
        <Button tone="primary" type="submit" busy={create.isPending}>
          Create issuer
        </Button>
        <Button type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function FieldRow({ f, i, d, set, sd }: { f: Draft["fields"][number]; i: number; d: Draft; set: (d: Draft) => void; sd: boolean }) {
  const update = (patch: Partial<Draft["fields"][number]>) => set({ ...d, fields: d.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <li className="grid grid-cols-2 gap-2 rounded-md border border-hairline p-2 sm:grid-cols-[1.2fr_1fr_8rem_auto]">
      <Input aria-label={`Field ${i + 1} label`} value={f.label} placeholder="Label" onChange={(e) => update({ label: e.target.value, name: f.name === camel(f.label) || !f.name ? camel(e.target.value) : f.name })} />
      <Input aria-label={`Field ${i + 1} name`} value={f.name} placeholder="claimName" className="font-mono text-sm" onChange={(e) => update({ name: e.target.value })} />
      <Select aria-label={`Field ${i + 1} type`} value={f.kind} onChange={(e) => update({ kind: e.target.value as FieldKind })}>
        <option value="text">Text</option>
        <option value="number">Number</option>
        <option value="date">Date</option>
        <option value="boolean">Yes / no</option>
        <option value="choice">Choice</option>
      </Select>
      <button type="button" className="rounded-md px-2 text-sm font-bold text-fail hover:bg-fail-soft" onClick={() => set({ ...d, fields: d.fields.filter((_, j) => j !== i) })} aria-label={`Remove field ${f.label || i + 1}`}>
        Remove
      </button>
      {f.kind === "choice" && <Input aria-label={`Field ${i + 1} options`} className="col-span-full" value={f.options} placeholder="Options, comma separated" onChange={(e) => update({ options: e.target.value })} />}
      <div className="col-span-full flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.required} onChange={(e) => update({ required: e.target.checked })} /> Required
        </label>
        {sd && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={f.selectivelyDisclosable} onChange={(e) => update({ selectivelyDisclosable: e.target.checked })} /> Holder can hide it
          </label>
        )}
      </div>
    </li>
  );
}

function TypeDesigner({ issuers, initialIssuer }: { issuers: IssuerWithTypes[]; initialIssuer?: string }) {
  const qc = useQueryClient();
  const opts = useQuery({ queryKey: ["studio-options"], queryFn: api.studioOptions });
  const [d, setD] = useState<Draft>({ ...EMPTY_DRAFT, issuerSlug: initialIssuer ?? issuers[0]?.slug ?? "" });
  const [preview, setPreview] = useState<"config" | "template" | "context">("config");
  const [created, setCreated] = useState<{ type: CredentialType; advertised: boolean }>();
  useEffect(() => {
    if (initialIssuer) setD((x) => ({ ...x, issuerSlug: initialIssuer }));
  }, [initialIssuer]);

  const payload = useMemo(() => toPayload(d), [d]);
  const [debounced, setDebounced] = useState(payload);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(payload), 350);
    return () => clearTimeout(t);
  }, [payload]);
  const pv = useQuery({ queryKey: ["type-preview", debounced], queryFn: () => api.previewType(debounced), enabled: Boolean(debounced.issuerSlug && debounced.typeName && debounced.displayName), retry: false });
  const save = useMutation({
    mutationFn: () => api.createType(payload),
    onSuccess: (r) => {
      setCreated(r);
      void qc.invalidateQueries({ queryKey: ["issuers"] });
      void qc.invalidateQueries({ queryKey: ["types"] });
    },
  });
  const issuer = issuers.find((i) => i.slug === d.issuerSlug);
  const err = save.error instanceof ApiError ? save.error : undefined;
  const pvErr = pv.error instanceof ApiError ? pv.error : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issuer">
            {(id) => (
              <Select id={id} value={d.issuerSlug} onChange={(e) => setD({ ...d, issuerSlug: e.target.value })}>
                {issuers.map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {i.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Credential name" hint="Shown in wallets.">
            {(id) => <Input id={id} required value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value, typeName: d.typeName === pascal(d.displayName) || !d.typeName ? pascal(e.target.value) : d.typeName })} placeholder="e.g. Driving Licence" />}
          </Field>
          <Field label="Type name" hint="The VC type (JSON-LD) or vct (SD-JWT).">
            {(id) => <Input id={id} required value={d.typeName} className="font-mono" onChange={(e) => setD({ ...d, typeName: e.target.value })} />}
          </Field>
          <Field label="Description">{(id) => <Input id={id} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />}</Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">Format</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice name="format" value={"ldp_vc" as const} current={d.format} onChange={(v) => setD({ ...d, format: v })} title="W3C JSON-LD" note="Linked-data proof; shared whole." />
            <Choice name="format" value={"vc+sd-jwt" as const} current={d.format} onChange={(v) => setD({ ...d, format: v })} title="IETF SD-JWT VC" note="The holder chooses which claims to reveal." />
          </div>
        </fieldset>

        {d.format === "ldp_vc" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data model">
              {(id) => (
                <Select id={id} value={d.dataModel} onChange={(e) => setD({ ...d, dataModel: e.target.value as Draft["dataModel"] })}>
                  <option value="2.0">VCDM 2.0 (validFrom / validUntil)</option>
                  <option value="1.1">VCDM 1.1 (issuanceDate / expirationDate)</option>
                </Select>
              )}
            </Field>
            <Field label="Signature suite" hint="Offered from what Certify advertises.">
              {(id) => (
                <Select id={id} value={d.ldpSuite} onChange={(e) => setD({ ...d, ldpSuite: e.target.value })}>
                  {(opts.data?.ldpSuites ?? [{ suite: "Ed25519Signature2020", alg: "EdDSA" }]).map((s) => (
                    <option key={s.suite} value={s.suite}>
                      {s.suite} ({s.alg})
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Issuer field" hint="Inji Verify 0.18.2 rejects the object form (gap G1).">
              {(id) => (
                <Select id={id} value={d.issuerForm} onChange={(e) => setD({ ...d, issuerForm: e.target.value as Draft["issuerForm"] })}>
                  <option value="string">URL string</option>
                  <option value="object">Object with id and name</option>
                </Select>
              )}
            </Field>
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={d.revocable} disabled={d.dataModel !== "2.0"} onChange={(e) => setD({ ...d, revocable: e.target.checked })} />
              Revocable (status list; VCDM 2.0 only)
            </label>
          </div>
        ) : (
          <Field label="Signing algorithm">
            {(id) => (
              <Select id={id} value={d.sdJwtAlg} onChange={(e) => setD({ ...d, sdJwtAlg: e.target.value })}>
                {(opts.data?.sdJwtAlgs ?? ["ES256"]).map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Expires on (optional)" hint="Leave empty for Certify's default of two years. A past date makes an expired credential for testing.">
          {(id) => <Input id={id} type="date" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} />}
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Claims</legend>
          <ul className="flex flex-col gap-2">
            {d.fields.map((f, i) => (
              <FieldRow key={i} f={f} i={i} d={d} set={setD} sd={d.format === "vc+sd-jwt"} />
            ))}
          </ul>
          <Button type="button" className="mt-2" onClick={() => setD({ ...d, fields: [...d.fields, { name: "", label: "", kind: "text", required: false, selectivelyDisclosable: true, options: "" }] })}>
            Add claim
          </Button>
        </fieldset>

        {err && <Notice tone="error">{err.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") || err.message}</Notice>}
        {created && (
          <Notice tone={created.advertised ? "info" : "warn"}>
            {created.advertised ? (
              <>
                Saved. Inji Certify now advertises <code className="font-mono">{created.type.configId}</code> in its issuer metadata.{" "}
                <Link to="/" className="font-bold underline">
                  Run a journey with it
                </Link>
                .
              </>
            ) : (
              "Saved, but Certify does not list the type yet. It can take up to a minute for its cache to refresh."
            )}
          </Notice>
        )}
        <div>
          <Button tone="primary" type="submit" busy={save.isPending} disabled={!d.issuerSlug}>
            Save to Inji Certify
          </Button>
        </div>
      </form>

      <div className="flex min-w-0 flex-col gap-4">
        <CardPreview issuer={issuer} d={d} />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg">What Certify receives</h3>
          <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto rounded-md bg-sunken p-1">
            {(["config", "template", "context"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={preview === t} onClick={() => setPreview(t)} className={cx("rounded px-2.5 py-1 text-sm font-bold", preview === t ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}>
                {t === "config" ? "Configuration" : t === "template" ? "Template" : "Context"}
              </button>
            ))}
          </div>
        </div>
        {pvErr ? (
          <Notice tone="warn">{pvErr.issues?.map((i) => `${i.path}: ${i.message}`).join("; ") || pvErr.message}</Notice>
        ) : !pv.data ? (
          <Empty title="Name the credential to see the preview" />
        ) : preview === "config" ? (
          <JsonView value={pv.data.certifyConfiguration} maxHeight="32rem" />
        ) : preview === "template" ? (
          <>
            <p className="text-sm text-muted">The Velocity template Certify fills at issuance (base64 in the configuration). Claim values are escaped so they cannot break out of the JSON.</p>
            <JsonView value={pv.data.template} maxHeight="28rem" />
          </>
        ) : pv.data.context ? (
          <>
            <p className="text-sm text-muted">The playground hosts this JSON-LD context so every claim has a defined meaning.</p>
            <JsonView value={pv.data.context} maxHeight="28rem" />
          </>
        ) : (
          <p className="text-sm text-muted">SD-JWT credentials have no JSON-LD context.</p>
        )}
      </div>
    </div>
  );
}

function IssuePanel({ type }: { type: CredentialType }) {
  const [claims, setClaims] = useState<Record<string, string>>(() => sampleClaims(type));
  const [txCode, setTxCode] = useState("");
  const offer = useMutation({ mutationFn: () => api.createOffer(type.id, { claims, txCode: txCode || undefined }) });
  const err = offer.error instanceof ApiError ? offer.error : undefined;
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_auto]">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          offer.mutate();
        }}
      >
        {type.fields.map((f) => (
          <Field key={f.name} label={f.label}>
            {(id) =>
              f.kind === "choice" ? (
                <Select id={id} value={claims[f.name]} onChange={(e) => setClaims({ ...claims, [f.name]: e.target.value })}>
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
        <Field label="PIN (optional)">{(id) => <Input id={id} value={txCode} onChange={(e) => setTxCode(e.target.value)} maxLength={8} />}</Field>
        {err && (
          <div className="sm:col-span-2">
            <Notice tone="error">{err.message}</Notice>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button tone="primary" type="submit" busy={offer.isPending}>
            Create credential offer
          </Button>
        </div>
      </form>
      {offer.data && (
        <div className="flex flex-col items-center gap-2">
          <QrCode value={offer.data.offerUri} label={`Credential offer for ${type.displayName}`} />
          <p className="max-w-[18rem] text-center text-sm text-muted">Scan with Inji Wallet (public URL needed) or paste the link into the Wallet page.</p>
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  const qc = useQueryClient();
  const issuers = useQuery({ queryKey: ["issuers"], queryFn: api.issuers });
  const [newIssuer, setNewIssuer] = useState(false);
  const [issuing, setIssuing] = useState<CredentialType>();
  const [designFor, setDesignFor] = useState<string>();
  const remove = useMutation({ mutationFn: (id: string) => api.deleteType(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ["issuers"] }) });

  return (
    <>
      <PageHeader title="Issuer Studio" lede="Create issuers and design their credential types. Saving pushes the design to Inji Certify through its credential-configuration API, and Certify starts issuing it straight away." />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="flex flex-col gap-4" aria-label="Issuers">
          {issuers.data?.map((i) => (
            <section key={i.slug} className="overflow-hidden rounded-[10px] border border-hairline bg-surface">
              <div className="flex items-center gap-3 px-3 py-3" style={{ borderTop: `6px solid ${i.backgroundColor}` }}>
                <div className="min-w-0">
                  <h2 className="truncate text-base">{i.name}</h2>
                  <p className="truncate text-sm text-muted">{i.description || i.slug}</p>
                </div>
              </div>
              <ul className="divide-y divide-hairline border-t border-hairline">
                {i.types.map((t) => (
                  <li key={t.id} className="flex flex-col gap-1.5 px-3 py-2">
                    <span className="font-bold">{t.displayName}</span>
                    <span className="flex flex-wrap gap-1">
                      <Tag tone="issue">{t.format === "ldp_vc" ? `JSON-LD ${t.dataModel}` : "SD-JWT"}</Tag>
                      {t.revocable && <Tag>revocable</Tag>}
                      {t.expiresAt && <Tag>expires {t.expiresAt.slice(0, 10)}</Tag>}
                    </span>
                    <span className="flex gap-3 text-sm">
                      <button className="font-bold text-issue underline" onClick={() => setIssuing(t)}>
                        Issue
                      </button>
                      <button className="font-bold text-fail underline" onClick={() => confirm(`Delete ${t.displayName} from Certify?`) && remove.mutate(t.id)}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
                <li className="px-3 py-2">
                  <button className="text-sm font-bold text-issue underline" onClick={() => setDesignFor(i.slug)}>
                    New type for this issuer
                  </button>
                </li>
              </ul>
            </section>
          ))}
          {newIssuer ? (
            <Panel title="New issuer">
              <IssuerForm onDone={() => setNewIssuer(false)} />
            </Panel>
          ) : (
            <Button onClick={() => setNewIssuer(true)}>New issuer</Button>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {issuing && (
            <Panel title={`Issue: ${issuing.displayName}`} action={<Button onClick={() => setIssuing(undefined)}>Close</Button>}>
              <IssuePanel key={issuing.id} type={issuing} />
            </Panel>
          )}
          <Panel title="Design a credential type">{issuers.data?.length ? <TypeDesigner issuers={issuers.data} initialIssuer={designFor} /> : <Empty title="Create an issuer first" />}</Panel>
        </div>
      </div>
    </>
  );
}
