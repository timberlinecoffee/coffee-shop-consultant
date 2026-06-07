"use client";

// TIM-2472: Target range bar with user marker.

interface BestPracticeBandProps {
  /** Target range low end */
  bpLow: number;
  /** Target range high end */
  bpHigh: number;
  /** User's actual value */
  userValue: number;
  unit?: string;
  label?: string;
}

function fmt(n: number, unit?: string) {
  if (unit === "%") return `${n}%`;
  return unit ? `${n}${unit}` : String(n);
}

export function BestPracticeBand({ bpLow, bpHigh, userValue, unit, label }: BestPracticeBandProps) {
  const rangeMin = Math.min(bpLow, userValue) * 0.9;
  const rangeMax = Math.max(bpHigh, userValue) * 1.1;
  const total = rangeMax - rangeMin || 1;

  const bpStartPct = ((bpLow - rangeMin) / total) * 100;
  const bpWidthPct = ((bpHigh - bpLow) / total) * 100;
  const userPct = ((userValue - rangeMin) / total) * 100;

  const inBand = userValue >= bpLow && userValue <= bpHigh;

  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-[var(--muted-foreground)]">{label}</p>}
      <div className="relative h-5 flex rounded overflow-hidden border border-[var(--border)] bg-[var(--muted)]">
        {/* Best-practice target band */}
        <div
          className="absolute top-0 bottom-0 bg-[var(--bench-green-bg)] border-x border-[var(--bench-green-border)]"
          style={{ left: `${bpStartPct}%`, width: `${bpWidthPct}%` }}
          aria-label={`Target range: ${fmt(bpLow, unit)}–${fmt(bpHigh, unit)}`}
        />
        {/* User marker */}
        <div
          className={`absolute top-0 bottom-0 w-0.5 shadow ${inBand ? "bg-[var(--bench-green-text)]" : "bg-[var(--bench-yellow-text)]"}`}
          style={{ left: `${userPct}%`, transform: "translateX(-50%)" }}
          aria-hidden="true"
        />
        <div
          className={`absolute -top-1 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent ${inBand ? "border-b-[var(--bench-green-text)]" : "border-b-[var(--bench-yellow-text)]"}`}
          style={{ left: `${userPct}%`, transform: "translateX(-50%)" }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>Target: {fmt(bpLow, unit)}–{fmt(bpHigh, unit)}</span>
        <span className={inBand ? "text-[var(--bench-green-text)]" : "text-[var(--bench-yellow-text)]"}>
          You: {fmt(userValue, unit)}
        </span>
      </div>
    </div>
  );
}
