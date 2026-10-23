/**
 * The playground's signature: Issuer → Wallet → Verifier drawn as stations on one transit line. Issuance
 * runs on the blue line, presentation on the saffron line, and every recorded protocol message travels
 * between stations as a pulse. With reduced motion, the destination station flashes instead.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RunStep } from "@playground/core";
import type { Station } from "../lib/format";
import { cx } from "./ui";

export interface Pulse {
  id: string;
  from: Station;
  to: Station;
  ok: boolean;
  title: string;
}

const POS: Record<Station, number> = { issuer: 0, wallet: 50, verifier: 100 };
type StationState = "idle" | "active" | "done" | "fail";

function stationStates(steps?: RunStep[]): Record<Station, StationState> {
  const s = Object.fromEntries((steps ?? []).map((x) => [x.name, x.status]));
  const st = (done: boolean, fail: boolean, active: boolean): StationState => (fail ? "fail" : done ? "done" : active ? "active" : "idle");
  return {
    issuer: st(s.issue === "passed" || s.issue === "skipped", s.issue === "failed", s.issue === "running" || s.issue === "waiting"),
    wallet: st(s.present === "passed", s.present === "failed", s.present === "running" || s.present === "waiting" || s.issue === "waiting"),
    verifier: st(s.verify === "passed", s.verify === "failed" || s.request === "failed", s.request === "running" || s.verify === "running"),
  };
}

function StationDot({ station, state, name, role, flash }: { station: Station; state: StationState; name: string; role: string; flash: boolean }) {
  const ring = station === "issuer" ? "border-issue" : station === "verifier" ? "border-present" : "border-ink";
  const align = station === "issuer" ? "items-start text-left" : station === "verifier" ? "items-end text-right" : "items-center text-center";
  return (
    <div className={cx("absolute top-0 flex w-[34%] flex-col gap-2", align)} style={{ left: station === "issuer" ? 0 : station === "wallet" ? "33%" : undefined, right: station === "verifier" ? 0 : undefined }}>
      <span
        className={cx(
          "relative z-10 grid size-8 place-items-center rounded-full border-[5px] transition-colors duration-300",
          // One background class only: with two, the stylesheet's order (not this list's) decides which wins.
          state === "fail" ? "border-fail bg-fail" : cx(ring, state === "done" ? (station === "issuer" ? "bg-issue" : station === "verifier" ? "bg-present" : "bg-ink") : "bg-surface"),
          state === "active" && "ring-4 ring-issue-soft",
          flash && "ring-4 ring-present-soft",
        )}
        aria-hidden
      >
        {state === "done" && <span className="text-xs font-black text-surface">✓</span>}
        {state === "fail" && <span className="text-xs font-black text-surface">✕</span>}
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-bold text-muted">{role}</span>
        <span className="text-sm leading-tight font-extrabold sm:text-base">{name}</span>
      </span>
      <span className="sr-only">{`${role} ${name}: ${state === "done" ? "completed" : state === "fail" ? "failed" : state === "active" ? "in progress" : "waiting"}`}</span>
    </div>
  );
}

export function TransitLine({ names, steps, pulses, onPulseDone }: { names: Record<Station, string>; steps?: RunStep[]; pulses: Pulse[]; onPulseDone: (id: string) => void }) {
  const reduce = useReducedMotion();
  const states = stationStates(steps);
  const flashing = new Set(reduce ? pulses.map((p) => p.to) : []);
  return (
    <div className="relative h-[104px] w-full select-none" role="img" aria-label={`Transit line: ${names.issuer}, then ${names.wallet}, then ${names.verifier}`}>
      {/* Track: blue for issuance, saffron for presentation. Inset by half a station so ends meet the dots. */}
      <div className="absolute top-[13px] right-4 left-4 flex h-1.5 overflow-hidden rounded-full">
        <span className="h-full w-1/2 bg-issue" />
        <span className="h-full w-1/2 bg-present" />
      </div>
      <div className="absolute inset-x-4 top-0 h-8">
        <AnimatePresence>
          {!reduce &&
            pulses.map((p) => (
              <motion.span
                key={p.id}
                className={cx("absolute top-[9px] z-20 -ml-[7px] size-3.5 rounded-full border-2 border-surface shadow-[0_0_0_3px_var(--surface)]", p.ok ? (POS[p.to] + POS[p.from] <= 50 ? "bg-issue" : "bg-present") : "bg-fail")}
                initial={{ left: `${POS[p.from]}%`, opacity: 0, scale: 0.6 }}
                animate={{ left: `${POS[p.to]}%`, opacity: [0, 1, 1, 0], scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: p.from === p.to ? 0.5 : 0.9, ease: [0.45, 0, 0.2, 1] }}
                onAnimationComplete={() => onPulseDone(p.id)}
                title={p.title}
              />
            ))}
        </AnimatePresence>
      </div>
      <StationDot station="issuer" role="Issuer" name={names.issuer} state={states.issuer} flash={flashing.has("issuer")} />
      <StationDot station="wallet" role="Wallet" name={names.wallet} state={states.wallet} flash={flashing.has("wallet")} />
      <StationDot station="verifier" role="Verifier" name={names.verifier} state={states.verifier} flash={flashing.has("verifier")} />
    </div>
  );
}
