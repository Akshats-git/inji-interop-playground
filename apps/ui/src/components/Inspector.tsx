/**
 * Protocol inspector: the list of recorded messages for a run (or all traffic) and a detail pane that
 * decodes what each one carries and says, in plain words, what it is for.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  decodeJwt,
  decodeSdJwt,
  isFailedEvent,
  looksLikeJwt,
  looksLikeSdJwt,
  type EventSummary,
  type ProtocolEvent,
} from "@playground/core";
import { api } from "../lib/api";
import { party, stationOf, time } from "../lib/format";
import { JsonView } from "./JsonView";
import { cx, Empty, Notice, Tag } from "./ui";

/** What each step is for, for someone meeting OpenID4VCI / OpenID4VP for the first time. */
const MEANING: [RegExp, string][] = [
  [
    /^Register credential type|^Update credential type/,
    "The Issuer Studio pushes your credential design to Inji Certify's admin API. This call stays on the internal Docker network. The gateway never exposes admin APIs publicly.",
  ],
  [
    /^Create credential offer/,
    "The issuer stores the claims and returns a credential offer holding a one-time pre-authorized code. The QR code the holder scans carries only a link to this offer, which keeps the QR small.",
  ],
  [
    /^Fetch credential offer/,
    "The wallet follows the link from the QR code and downloads the offer: which issuer, which credential, and the pre-authorized code it can exchange.",
  ],
  [
    /^Issuer metadata/,
    "The wallet reads the issuer's metadata, its menu: the credentials it issues, their formats and signing algorithms, and the endpoint that issues them.",
  ],
  [
    /^Authorization server metadata/,
    "The wallet discovers where to exchange its code for an access token (the token endpoint) and which grant types are supported.",
  ],
  [
    /^Token request/,
    "The wallet swaps the pre-authorized code for an access token. Certify also returns a c_nonce: the wallet must sign over it next, which proves the request is fresh and cannot be replayed.",
  ],
  [
    /^Credential request/,
    "The wallet signs a proof JWT over the c_nonce with a fresh key and asks for the credential. The issuer binds the credential to that key, so only this wallet can present it later.",
  ],
  [
    /^Create authorization request/,
    "The verifier says what it wants to see, as a Presentation Exchange definition or a DCQL query. It also says where to send the answer, and gives a nonce that the answer must be signed over.",
  ],
  [
    /^Fetch request object/,
    "The wallet downloads the verifier's full request by reference (request_uri). A signed request lets the wallet check who is asking.",
  ],
  [
    /^Submit presentation/,
    "The wallet posts its answer (vp_token) straight to the verifier (response_mode direct_post). For JSON-LD, the answer is a signed Verifiable Presentation. For SD-JWT, it is the credential with only the chosen disclosures, plus a key-binding JWT.",
  ],
  [/^Status:/, "The verifier's front end long-polls until the wallet has answered."],
  [
    /^Verification result/,
    "The verifier reports its checks: issuer signature, expiry, revocation status and holder binding.",
  ],
  [
    /^Verify credential/,
    "Direct share: the holder shows the credential itself as a QR code (PixelPass-compressed) and the verifier checks it, with no OpenID4VP exchange.",
  ],
  [
    /^Status list/,
    "The verifier downloads the issuer's status list to see whether this credential has been revoked.",
  ],
  [
    /^Issuer DID document|^Issuer JWKS/,
    "Someone is resolving the issuer's public keys to check a signature.",
  ],
  [
    /^eSignet: CSRF/,
    "eSignet's login page starts with a CSRF token. The wallet sends it back on every call, as a browser would.",
  ],
  [
    /^eSignet: start login/,
    "The authorization request of the authorization code flow. It says which client asks and for which scope. It says where to send the person back (redirect_uri). It also has a PKCE challenge, so only this wallet can redeem the code.",
  ],
  [
    /^eSignet: send OTP/,
    "eSignet sends a one-time password to the identity's registered email or phone. On MOSIP Collab the demo identities use a static test OTP instead.",
  ],
  [
    /^eSignet: sign in with the OTP/,
    "The holder proves who they are with the OTP. This is the step a person does on eSignet's page. The playground can do it for a demo identity.",
  ],
  [
    /^eSignet: authorization code/,
    "eSignet issues a short-lived authorization code and would redirect the browser to the redirect_uri with it. The wallet swaps it for an access token next.",
  ],
  [
    /^Nonce request/,
    "OpenID4VCI 1.0 moved the c_nonce out of the token response into its own endpoint. The wallet fetches a fresh nonce and signs its proof of possession over it.",
  ],
];
const meaningOf = (title: string) => MEANING.find(([re]) => re.test(title))?.[1];

export function EventRow({
  e,
  selected,
  onSelect,
}: {
  e: EventSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const lane = e.phase === "presentation" || e.phase === "verification" ? "present" : "issue";
  const bad = isFailedEvent(e);
  return (
    <li>
      <button
        onClick={onSelect}
        aria-current={selected || undefined}
        className={cx(
          "grid w-full grid-cols-[2.25rem_1fr_auto] items-start gap-x-3 border-l-4 px-3 py-2.5 text-left transition-colors duration-150",
          lane === "issue" ? "border-l-issue" : "border-l-present",
          selected ? "bg-issue-soft" : "hover:bg-sunken",
        )}
      >
        <span className="tabular pt-0.5 font-mono text-sm text-muted">{e.seq}</span>
        <span className="min-w-0">
          <span className="block font-bold">{e.title}</span>
          <span className="block text-sm text-muted">
            {party(e.from)} → {party(e.to)}
            {e.actor ? `, as ${e.actor}` : ""}
          </span>
          <span className="mt-1 flex flex-wrap gap-1">
            {e.labels.slice(0, 5).map((l) => (
              <Tag key={l} tone={lane === "issue" ? "issue" : "present"}>
                {l}
              </Tag>
            ))}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={cx("tabular font-mono text-sm font-semibold", bad ? "text-fail" : "text-pass")}>
            {e.status}
          </span>
          <span className="tabular text-xs text-muted">{time(e.at)}</span>
        </span>
      </button>
    </li>
  );
}

/** Find every JWT / SD-JWT / embedded credential in a payload, with the JSON path it was found at. */
function findTokens(
  v: unknown,
  path = "$",
  out: { path: string; kind: "jwt" | "sd-jwt" | "vc" | "vp"; value: unknown }[] = [],
) {
  if (typeof v === "string") {
    if (looksLikeSdJwt(v)) out.push({ path, kind: "sd-jwt", value: v });
    else if (looksLikeJwt(v)) out.push({ path, kind: "jwt", value: v });
    else if (/^[[{]/.test(String(v).trim())) {
      try {
        findTokens(JSON.parse(String(v)), path, out);
      } catch {
        /* not JSON */
      }
    }
  } else if (Array.isArray(v)) v.forEach((x, i) => findTokens(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o.type ?? []);
    if (types.includes("VerifiablePresentation")) out.push({ path, kind: "vp", value: v });
    else if (o.credentialSubject && o.proof) out.push({ path, kind: "vc", value: v });
    for (const [k, x] of Object.entries(o)) findTokens(x, `${path}.${k}`, out);
  }
  return out;
}

function Claims({ claims }: { claims: Record<string, unknown> }) {
  const rows = Object.entries(claims).filter(([k]) => k !== "id");
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-semibold break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Decoded({ kind, value, path }: { kind: string; value: unknown; path: string }) {
  if (kind === "sd-jwt") {
    const d = decodeSdJwt(String(value))!;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          <strong>SD-JWT</strong> at <code className="font-mono">{path}</code>: an issuer-signed JWT,{" "}
          {d.disclosures.length} disclosure{d.disclosures.length === 1 ? "" : "s"}
          {d.keyBinding ? ", and a key-binding JWT proving the holder's key." : ", and no key-binding JWT."}
        </p>
        <h4 className="text-sm font-bold">Issuer JWT header</h4>
        <JsonView
          value={{
            ...d.issuerJwt.header,
            ...(Array.isArray(d.issuerJwt.header.x5c)
              ? { x5c: [`${String((d.issuerJwt.header.x5c as string[])[0]).slice(0, 40)}… (certificate)`] }
              : {}),
          }}
          maxHeight="10rem"
        />
        <h4 className="text-sm font-bold">Issuer JWT payload</h4>
        <JsonView value={d.issuerJwt.payload} maxHeight="14rem" />
        <h4 className="text-sm font-bold">Disclosures revealed</h4>
        {d.disclosures.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-semibold">Claim</th>
                <th className="py-1 font-semibold">Value</th>
                <th className="py-1 font-semibold">Salt</th>
              </tr>
            </thead>
            <tbody>
              {d.disclosures.map((x) => (
                <tr key={x.raw} className="border-t border-hairline">
                  <td className="py-1 font-bold">{x.name}</td>
                  <td className="py-1">{JSON.stringify(x.value)}</td>
                  <td className="py-1 font-mono text-xs text-muted">{x.salt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">None: every selectively disclosable claim was withheld.</p>
        )}
        {d.keyBinding && (
          <>
            <h4 className="text-sm font-bold">Key-binding JWT</h4>
            <JsonView
              value={{ header: d.keyBinding.header, payload: d.keyBinding.payload }}
              highlight={(k) => k === "nonce" || k === "aud"}
              maxHeight="12rem"
            />
          </>
        )}
      </div>
    );
  }
  if (kind === "jwt") {
    const d = decodeJwt(String(value));
    if (!d) return null;
    const isProof = d.header.typ === "openid4vci-proof+jwt";
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          <strong>
            {isProof
              ? "Proof of possession"
              : d.header.typ === "oauth-authz-req+jwt"
                ? "Signed request object"
                : "JWT"}
          </strong>{" "}
          at <code className="font-mono">{path}</code>
          {isProof &&
            ": the wallet signs the issuer's c_nonce with its key, so the credential gets bound to that key."}
        </p>
        <JsonView
          value={{ header: d.header, payload: d.payload }}
          highlight={(k) => k === "nonce" || k === "aud" || k === "kid"}
          maxHeight="16rem"
        />
      </div>
    );
  }
  const o = value as Record<string, unknown>;
  if (kind === "vp") {
    const proof = (o.proof ?? {}) as Record<string, unknown>;
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <strong>Verifiable Presentation</strong> at <code className="font-mono">{path}</code>, signed by the
          holder <code className="font-mono break-all">{String(o.holder ?? "?")}</code>
          {proof.challenge ? (
            <>
              {" "}
              over challenge{" "}
              <code className="rounded bg-present-soft px-1 font-mono text-present-ink">
                {String(proof.challenge)}
              </code>{" "}
              for domain <code className="font-mono">{String(proof.domain)}</code>.
            </>
          ) : (
            <span className="font-bold text-fail"> with no holder proof.</span>
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <strong>Verifiable Credential</strong> at <code className="font-mono">{path}</code>:{" "}
        {([] as string[]).concat(o.type as string).join(", ")}, proof{" "}
        {String((o.proof as Record<string, unknown>)?.type)}.
      </p>
      <Claims claims={(o.credentialSubject ?? {}) as Record<string, unknown>} />
    </div>
  );
}

export function EventDetail({ id }: { id: string }) {
  const [reveal, setReveal] = useState(false);
  const [tab, setTab] = useState<"decoded" | "request" | "response">("decoded");
  const q = useQuery({ queryKey: ["event", id, reveal], queryFn: () => api.event(id, reveal) });
  const e = q.data;
  const tokens = useMemo(() => {
    if (!e) return [];
    const req = findTokens(e.request?.body ?? e.request?.text, "request");
    const res = findTokens(e.response?.body ?? e.response?.text, "response");
    const seen = new Set<string>();
    return [...req, ...res].filter((t) => {
      const k = typeof t.value === "string" ? t.value : JSON.stringify(t.value).slice(0, 200);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [e]);

  if (q.isLoading) return <p className="p-4 text-muted">Loading message…</p>;
  if (q.error || !e)
    return (
      <div className="p-4">
        <Notice tone="error">
          This message could not be loaded. It may have been purged by the retention policy.
        </Notice>
      </div>
    );
  const meaning = meaningOf(e.title);
  const lane = stationOf(e.from) === "issuer" || stationOf(e.to) === "issuer" ? "issue" : "present";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-xl">
          {e.seq}. {e.title}
        </h3>
        <p className="mt-1 font-mono text-sm break-all text-muted">
          {e.method} {e.path} answered {e.status} in {Math.round(e.durationMs)} ms
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {e.labels.map((l) => (
            <Tag key={l} tone={lane}>
              {l}
            </Tag>
          ))}
        </div>
      </div>
      {meaning && <p className="max-w-[68ch] border-l-4 border-hairline pl-3 text-[0.95rem]">{meaning}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex gap-1 rounded-full bg-sunken p-1">
          {(["decoded", "request", "response"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx(
                "rounded-full px-3 py-1 text-sm font-bold capitalize",
                tab === t ? "bg-surface shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={reveal} onChange={(x) => setReveal(x.target.checked)} />
          Reveal tokens (this computer only)
        </label>
      </div>

      {tab === "decoded" &&
        (tokens.length ? (
          <div className="flex flex-col gap-5">
            {tokens.map((t) => (
              <Decoded key={t.path + t.kind} kind={t.kind} value={t.value} path={t.path} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing to decode in this message">
            Open the Request or Response tab for the raw payloads.
          </Empty>
        ))}
      {tab === "request" && <Payload m={e.request} />}
      {tab === "response" && <Payload m={e.response} />}
    </div>
  );
}

function Payload({ m }: { m?: ProtocolEvent["request"] }) {
  if (!m) return <Empty title="No payload recorded" />;
  return (
    <div className="flex flex-col gap-3">
      {Object.keys(m.headers ?? {}).length > 0 && <JsonView value={m.headers} maxHeight="10rem" />}
      {m.body !== undefined ? (
        <JsonView
          value={m.body}
          highlight={(k) =>
            ["c_nonce", "nonce", "challenge", "pre-authorized_code", "vp_token", "credential"].includes(k)
          }
        />
      ) : m.text ? (
        <JsonView value={m.text} />
      ) : (
        <p className="text-sm text-muted">Empty body.</p>
      )}
    </div>
  );
}

export function Inspector({
  events,
  emptyHint,
  newestFirst = false,
  selected: controlled,
  onSelect,
}: {
  events: EventSummary[];
  emptyHint?: string;
  newestFirst?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [own, setOwn] = useState<string | null>(null);
  // Controlled when the page passes a selection (the sequence diagram shares it), otherwise its own.
  const selected = controlled !== undefined ? controlled : own;
  const setSelected = (id: string) => (onSelect ? onSelect(id) : setOwn(id));
  const current = selected ?? events[events.length - 1]?.id ?? null;
  if (!events.length)
    return (
      <Empty title="No protocol messages yet">
        {emptyHint ?? "Messages appear here as soon as a wallet or verifier talks through the gateway."}
      </Empty>
    );
  return (
    <div className="grid overflow-hidden rounded-[10px] border border-hairline bg-surface lg:grid-cols-[minmax(18rem,26rem)_1fr]">
      <ol
        className="max-h-[36rem] divide-y divide-hairline overflow-y-auto border-b border-hairline lg:border-r lg:border-b-0"
        aria-label="Protocol messages"
      >
        {(newestFirst ? [...events].reverse() : events).map((e) => (
          <EventRow key={e.id} e={e} selected={e.id === current} onSelect={() => setSelected(e.id)} />
        ))}
      </ol>
      <div className="max-h-[48rem] min-h-[24rem] min-w-0 overflow-y-auto">
        {current && <EventDetail key={current} id={current} />}
      </div>
    </div>
  );
}
