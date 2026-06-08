"use client";

// TIM-2472: Color-banded percentile bar with user marker.

interface PercentileBarProps {
  /** 0–100 position of the user's value */
  position: number;
  label?: string;
}

const BANDS = [
  { from: 0, to: 25, label: "Bottom 25%", bg: "bg-[var(--bench-yellow-bg)]", border: "border-[var(--bench-yellow-border)]" },
  { from: 25, to: 75, label: "Middle 50%", bg: "bg-[var(--bench-blue-bg)]", border: "border-[var(--bench-blue-border)]" },
  { from: 75, to: 100, label: "Top 25%", bg: "bg-[var(--bench-green-bg)]", border: "border-[var(--bench-green-border)]" },
];

export function PercentileBar({ position, label }: PercentileBarProps) {
  const clampedPos = Math.max(0, Math.min(100, position));

  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-[var(--muted-foreground)]">{label}</p>}
      <div className="relative h-5 flex rounded overflow-hidden border border-[var(--border)]">
        {BANDS.map((band) => (
          <div
            key={band.label}
            className={`${band.bg} flex-none`}
            style={{ width: `${band.to - band.from}%` }}
            title={band.label}
          />
        ))}
        {/* User marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[var(--foreground)] shadow"
          style={{ left: `${clampedPos}%`, transform: "translateX(-50%)" }}
          aria-hidden="true"
        />
        {/* Triangle pointer */}
        <div
          className="absolute -top-1 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-[var(--foreground)]"
          style={{ left: `${clampedPos}%`, transform: "translateX(-50%)" }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--muted-foreground)]">
        <span>0th</span>
        <span>25th</span>
        <span>75th</span>
        <span>100th</span>
      </div>
    </div>
  );
}
