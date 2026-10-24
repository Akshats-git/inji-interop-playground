/**
 * QR Lab: how large a credential is as a QR code, drawn on a line of QR versions 1–40 whose stations are
 * the documented limits (Certify's issuing cap, Inji Verify's scan and upload caps, the QR maximum).
 */
import { useDeferredValue, useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { api, type QrMeasure } from "../lib/api";
import { bytes } from "../lib/format";
import { cx } from "./ui";

const pct = (v: number) => ((v - 1) / 39) * 100;

/** The version line. The filled marker is the PixelPass QR; the hollow one is the same data uncompressed. */
export function VersionLine({ m }: { m: QrMeasure }) {
  const reduce = useReducedMotion();
  const pp = m.versions.L.pixelpass;
  const raw = m.versions.L.raw;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 260, damping: 30 };
  const marker = (v: number | null, filled: boolean) => (
    <motion.div
      className="pointer-events-none absolute inset-0"
      initial={false}
      animate={{ x: `${pct(v ?? 40)}%` }}
      transition={spring}
    >
      <span
        className={cx(
          "absolute top-1/2 left-0 block -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]",
          filled
            ? v === null
              ? "size-5 border-fail bg-fail-soft"
              : "size-5 border-ink bg-present"
            : "size-4 border-dashed border-muted bg-surface",
        )}
        aria-hidden
      />
    </motion.div>
  );
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative mx-2.5 h-14">
        <div className="absolute inset-x-0 top-[1.15rem] h-6">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-present/30" />
          <div
            className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-present"
            style={{ width: `${pct(m.limits[1]!.maxVersion)}%` }}
          />
          {m.limits.map((l) => (
            <span
              key={l.id}
              className="absolute top-1/2 block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-surface"
              style={{ left: `${pct(l.maxVersion)}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute -inset-x-3 -inset-y-2 overflow-hidden">
            <div className="absolute inset-x-3 inset-y-2">
              {raw !== pp && marker(raw, false)}
              {marker(pp, true)}
            </div>
          </div>
        </div>
        {m.limits.map((l) => (
          <span
            key={l.id}
            className="tabular absolute top-0 -translate-x-1/2 text-xs font-bold text-muted"
            style={{ left: `${pct(l.maxVersion)}%` }}
            aria-hidden
          >
            v{l.maxVersion}
          </span>
        ))}
        <span className="absolute top-0 left-0 -translate-x-1/2 text-xs font-bold text-muted" aria-hidden>
          v1
        </span>
      </div>
      <figcaption className="text-sm">
        {pp === null ? (
          <span className="font-bold text-fail">Too large for any QR code, even compressed.</span>
        ) : (
          <>
            PixelPass QR: <strong>version {pp}</strong>
            {raw === null
              ? ", where the uncompressed JSON would not fit in a QR code at all."
              : raw !== pp
                ? `, against version ${raw} uncompressed.`
                : "."}
          </>
        )}{" "}
        <span className="text-muted">Error correction L, the densest setting.</span>
      </figcaption>
    </figure>
  );
}

export function QrMeasureView({ m, showQr = true }: { m: QrMeasure; showQr?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <VersionLine m={m} />
      <div className="grid gap-5 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-3">
            {[
              ["Credential JSON", bytes(m.rawBytes)],
              ["PixelPass text", `${m.pixelpassChars.toLocaleString()} chars`],
              [
                "PixelPass made it",
                m.ratio <= 1
                  ? `${Math.round((1 - m.ratio) * 100)}% smaller`
                  : `${Math.round((m.ratio - 1) * 100)}% larger`,
              ],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md bg-sunken px-3 py-2">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="tabular text-lg font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col gap-1.5">
            {m.limits.map((l) => (
              <li key={l.id} className="flex gap-2 text-sm">
                <span
                  className={cx("font-black", l.fits ? "text-pass" : "text-fail")}
                  aria-label={l.fits ? "fits" : "does not fit"}
                >
                  {l.fits ? "✓" : "✕"}
                </span>
                <span>
                  <span className="font-semibold">{l.label}</span>, up to version {l.maxVersion}
                  <span className="block text-xs text-muted">Source: {l.source}</span>
                </span>
              </li>
            ))}
          </ul>
          <details className="text-sm">
            <summary className="cursor-pointer font-bold">Versions at every error-correction level</summary>
            <table className="mt-2 w-full max-w-sm text-left">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 font-semibold">Level</th>
                  <th className="py-1 font-semibold">Uncompressed</th>
                  <th className="py-1 font-semibold">PixelPass</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {(["L", "M", "Q", "H"] as const).map((ec) => (
                  <tr key={ec} className="border-t border-hairline">
                    <td className="py-1 font-bold">{ec}</td>
                    <td className="py-1">{m.versions[ec].raw ?? "does not fit"}</td>
                    <td className="py-1">{m.versions[ec].pixelpass ?? "does not fit"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
        {showQr && m.qrPng && (
          <figure className="flex flex-col items-center gap-2">
            <img
              src={m.qrPng}
              alt={`PixelPass QR code, version ${m.versions.L.pixelpass}`}
              className="size-44 rounded-lg border border-hairline bg-white p-1 [image-rendering:pixelated]"
            />
            <figcaption className="text-xs text-muted">What a verifier would scan</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}

/** A synthetic farmer card with a face photo of adjustable size: where does it stop fitting? */
export function PhotoSizeLab() {
  const [kb, setKb] = useState(0);
  const deferred = useDeferredValue(kb);
  const id = useId();
  const q = useQuery({
    queryKey: ["qr-synthetic", deferred],
    queryFn: () => api.qrSynthetic(deferred),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-sm font-bold">
          Face photo in the credential
          <span className="tabular text-lg font-extrabold">
            {kb === 0 ? "No photo" : `${kb.toFixed(2)} KB`}
          </span>
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={kb}
          onChange={(e) => setKb(Number(e.target.value))}
          className="w-full accent-[var(--present)]"
        />
        <p className="text-sm text-muted">
          A typical ID-card face JPEG is 4–12 KB, well past the end of this slider: everything a QR code can
          carry fits in under 2.5 KB. The photo bytes here are random, which compresses about as badly as real
          JPEG data.
        </p>
      </div>
      {q.data ? (
        <QrMeasureView m={q.data} showQr={false} />
      ) : q.error ? (
        <p className="text-fail">The QR Lab could not measure this credential.</p>
      ) : (
        <p className="text-muted">Measuring…</p>
      )}
    </div>
  );
}
