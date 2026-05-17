"use client";

import { useEffect, useRef, useState } from "react";

/** One number per module (1-8), in the range 0-100. */
export type ModulePercentages = [
  number, number, number, number,
  number, number, number, number,
];

export interface ReadinessRingProps {
  /**
   * Completion percentages for all 8 modules (indices 0-7).
   * Each value is clamped to [0, 100].
   */
  modulePercentages: ModulePercentages | number[];
  /**
   * Diameter in pixels. Defaults to 120 per spec.
   * Changing this scales all inner geometry proportionally.
   */
  size?: number;
  /** Additional CSS class names. */
  className?: string;
}

function clamp(n: number) {
  return Math.min(100, Math.max(0, n));
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const o1 = polarToCartesian(cx, cy, outerR, startAngle);
  const o2 = polarToCartesian(cx, cy, outerR, endAngle);
  const i1 = polarToCartesian(cx, cy, innerR, endAngle);
  const i2 = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${o1.x.toFixed(3)} ${o1.y.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${o2.x.toFixed(3)} ${o2.y.toFixed(3)}`,
    `L ${i1.x.toFixed(3)} ${i1.y.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${i2.x.toFixed(3)} ${i2.y.toFixed(3)}`,
    `Z`,
  ].join(" ");
}

const SEGMENT_COUNT = 8;
const STEP = 360 / SEGMENT_COUNT; // 45°
const GAP = 4;                     // degrees of gap between segments
const ARC = STEP - GAP;            // 41° effective arc

/**
 * ReadinessRing — Component 3 per design-direction v3 Section 6.
 *
 * Circular SVG donut chart, 120px diameter by default. Eight segments
 * correspond to the eight planning modules. Each segment fills independently
 * as the module's completion percentage increases.
 *
 * Filled segments use --color-teal. Unfilled segments use --neutral-300.
 * Center text shows the average completion in Poppins 700 H3.
 *
 * A single pulse animation (150ms, scale 1.0 → 1.03 → 1.0) fires once
 * when a segment transitions to 100%.
 */
export function ReadinessRing({
  modulePercentages,
  size = 120,
  className = "",
}: ReadinessRingProps) {
  const percentages = Array.from({ length: 8 }, (_, i) =>
    clamp(modulePercentages[i] ?? 0)
  );

  const prevPercentages = useRef<number[]>(percentages);
  const [pulsing, setPulsing] = useState<boolean[]>(new Array(8).fill(false));

  useEffect(() => {
    const newPulsing = percentages.map(
      (p, i) => p === 100 && prevPercentages.current[i] !== 100
    );
    if (newPulsing.some(Boolean)) {
      setPulsing(newPulsing);
      const timer = setTimeout(() => setPulsing(new Array(8).fill(false)), 300);
      prevPercentages.current = percentages;
      return () => clearTimeout(timer);
    }
    prevPercentages.current = percentages;
  }, [percentages]);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;  // ~50px at 120px size
  const innerR = size * 0.275; // ~33px at 120px size

  const overallPct = Math.round(
    percentages.reduce((sum, p) => sum + p, 0) / 8
  );

  return (
    <div
      className={["relative inline-flex items-center justify-center", className].join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Plan readiness: ${overallPct}% complete overall`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        overflow="visible"
      >
        {percentages.map((pct, i) => {
          const startAngle = i * STEP + GAP / 2;
          const endAngle = startAngle + ARC;
          const fillEndAngle = startAngle + ARC * (pct / 100);
          const isComplete = pct === 100;
          const isPulsing = pulsing[i];

          return (
            <g
              key={i}
              style={
                isPulsing
                  ? {
                      transformOrigin: `${cx}px ${cy}px`,
                      animation: `readiness-pulse var(--duration-fast) ease-in-out`,
                    }
                  : undefined
              }
            >
              {/* Track (unfilled) */}
              <path
                d={segmentPath(cx, cy, outerR, innerR, startAngle, endAngle)}
                fill="var(--neutral-300)"
              />

              {/* Fill — overlaid on top */}
              {pct > 0 && (
                <path
                  d={segmentPath(cx, cy, outerR, innerR, startAngle, fillEndAngle)}
                  fill="var(--color-teal)"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Center percentage text */}
      <span
        aria-hidden
        className="absolute font-bold text-[var(--neutral-950)] select-none"
        style={{
          fontSize: `${size * 0.2}px`,
          lineHeight: 1,
        }}
      >
        {overallPct}%
      </span>

      <style>{`
        @keyframes readiness-pulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
