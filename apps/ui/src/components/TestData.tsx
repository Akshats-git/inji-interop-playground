/**
 * The test data of a hosted Inji environment (MOSIP Collab): its demo identities, the static test OTP, notes for one
 * issuer and where to get your own identity. Shown next to every authorization-code QR code and sign-in link, so a
 * person scanning with Inji Wallet knows what to type at eSignet.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { copy } from "../lib/format";
import { cx } from "./ui";

function CopyValue({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void copy(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="tabular rounded border border-hairline bg-surface px-2 py-0.5 font-mono text-sm font-semibold hover:border-ink"
      aria-label={`Copy ${label} ${value}`}
    >
      {done ? "Copied" : value}
    </button>
  );
}

export function TestData({ environment, issuerId, authorizationServer, className }: { environment: string; issuerId?: string; authorizationServer?: string; className?: string }) {
  const q = useQuery({ queryKey: ["hosted"], queryFn: api.hosted, staleTime: 5 * 60_000 });
  const env = q.data?.environments.find((e) => e.id === environment);
  if (!env) return q.isLoading ? <div className={cx("min-h-40", className)} aria-hidden /> : null;
  const t = env.testData;
  const identities = t.identities.filter((i) => !i.authorizationServers || !authorizationServer || i.authorizationServers.includes(authorizationServer));
  const notes = t.notes.filter((n) => !n.issuer || n.issuer === issuerId);
  return (
    <section aria-label={`Test data for ${env.name}`} className={cx("rounded-md border border-hairline bg-sunken p-3 text-sm", className)}>
      <h3 className="mb-2 text-base">Test data for {env.name}</h3>
      <p className="mb-2 text-muted">Public mock data from MOSIP. Sign in at eSignet with a demo UIN, then the OTP.</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {t.otp && (
          <>
            <dt className="font-bold">OTP</dt>
            <dd>
              <CopyValue value={t.otp} label="OTP" />
            </dd>
          </>
        )}
        {identities.map((i, n) => (
          <div key={i.id} className="contents">
            <dt className={cx(n === 0 ? "font-bold" : "sr-only")}>{n === 0 ? "UIN" : "UIN"}</dt>
            <dd className={cx("flex flex-wrap items-center gap-2", n > 0 && "col-start-2")}>
              <CopyValue value={i.id} label="UIN" />
              <span className="text-muted">{i.label}</span>
            </dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {notes.map((n) => (
            <li key={n.text} className="border-l-2 border-present pl-2">
              {n.text}
            </li>
          ))}
        </ul>
      )}
      {t.selfRegistration && (
        <p className="mt-2 text-muted">
          Your own UIN:{" "}
          <a href={t.selfRegistration} target="_blank" rel="noreferrer" className="font-bold text-issue underline">
            self-register on Collab
          </a>
          ; its OTP is emailed to you. Never share it in a demo.
        </p>
      )}
    </section>
  );
}
