/**
 * Sequence diagram generated from the recorded events, so it always matches what really happened.
 * Lifelines are the parties that took part; arrows are messages, coloured by lane, red when they failed.
 */
import { isFailedEvent, PARTY_LABEL, type EventSummary, type Party } from "@playground/core";

const ORDER: Party[] = ["studio", "certify", "external-issuer", "wallet", "external-wallet", "verifier-ui", "verifier-backend", "inji-verify", "reference-verifier", "external-verifier"];

export function SequenceDiagram({ events, onSelect }: { events: EventSummary[]; onSelect?: (id: string) => void }) {
  const parties = ORDER.filter((p) => events.some((e) => e.from === p || e.to === p));
  if (!events.length || parties.length < 2) return null;
  const colW = 150;
  const rowH = 34;
  const top = 44;
  const width = parties.length * colW;
  const height = top + events.length * rowH + 20;
  const x = (p: Party) => parties.indexOf(p) * colW + colW / 2;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-hairline bg-surface p-3">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="font-sans" role="img" aria-label={`Sequence diagram of ${events.length} messages`}>
        <defs>
          {["issue", "present", "fail"].map((k) => (
            <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={`var(--${k})`} />
            </marker>
          ))}
        </defs>
        {parties.map((p) => (
          <g key={p}>
            <rect x={x(p) - 66} y={4} width={132} height={26} rx={6} fill="var(--sunken)" stroke="var(--hairline)" />
            <text x={x(p)} y={21} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)">
              {PARTY_LABEL[p]}
            </text>
            <line x1={x(p)} x2={x(p)} y1={30} y2={height - 6} stroke="var(--hairline)" strokeDasharray="3 4" />
          </g>
        ))}
        {events.map((e, i) => {
          const y = top + i * rowH + 12;
          const lane = isFailedEvent(e) ? "fail" : e.phase === "issuance" || e.phase === "setup" ? "issue" : "present";
          const x1 = x(e.from);
          const x2 = x(e.to);
          const self = x1 === x2;
          return (
            <g key={e.id} className={onSelect ? "cursor-pointer" : undefined} onClick={() => onSelect?.(e.id)}>
              <title>{`${e.seq}. ${e.title} (${e.status})`}</title>
              {self ? (
                <path d={`M${x1},${y} h28 v10 h-26`} fill="none" stroke={`var(--${lane})`} strokeWidth="2" markerEnd={`url(#arrow-${lane})`} />
              ) : (
                <line x1={x1} x2={x2 + (x2 > x1 ? -4 : 4)} y1={y} y2={y} stroke={`var(--${lane})`} strokeWidth="2" markerEnd={`url(#arrow-${lane})`} />
              )}
              <text x={self ? x1 + 34 : (x1 + x2) / 2} y={y - 6} textAnchor={self ? "start" : "middle"} fontSize="11.5" fill="var(--ink)">
                {`${e.seq}. ${e.title}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
