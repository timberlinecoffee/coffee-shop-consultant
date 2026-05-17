"use client";

import { useEffect, useRef, useState } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";

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
 * Moment 3 (§8): segment pulses once — scale 1.0 → 1.03 → 1.0, 200ms ease-in-out —
 * when a module crosses 100%. Counter increments smoothly over 300ms.
 */
export function ReadinessRing({
  modulePercentages,
  size = 120,
  className = "",
}: ReadinessRingProps) {
  const prefersReducedMotion = useReducedMotion();

  const percentages = Array.from({ length: 8 }, (_, i) =>
    clamp(modulePercentages[i] ?? 0)
  );

  const prevPercentages = useRef<number[]>(percentages);
  const [pulsing, setPulsing] = useState<boolean[]>(new Array(8).fill(false));

  // Moment 3 — pulse trigger: fires when a segment crosses to 100%
  useEffect(() => {
    const newPulsing = percentages.map(
      (p, i) => p === 100 && prevPercentages.current[i] !== 100
    );
    if (newPulsing.some(Boolean)) {
      setPulsing(newPulsing);
      // Reset after animation completes (200ms pulse + buffer)
      const timer = setTimeout(() => setPulsing(new Array(8).fill(false)), 300);
      prevPercentages.current = percentages;
      return () => clearTimeout(timer);
    }
    prevPercentages.current = percentages;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentages.join(",")]);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;  // ~50px at 120px size
  const innerR = size * 0.275; // ~33px at 120px size

  const overallPct = Math.round(
    percentages.reduce((sum, p) => sum + p, 0) / 8
  );

  // Moment 3 — smooth counter: animate displayed number over 300ms
  const counterRef = useRef<HTMLSpanElement>(null);
  const prevOverallPct = useRef(overallPct);

  useEffect(() => {
    const from = prevOverallPct.current;
    const to = overallPct;
    prevOverallPct.current = to;

    if (from === to || !counterRef.current) return;

    if (prefersReducedMotion) {
      counterRef.current.textContent = `${to}%`;
      return;
    }

    // Moment 3: counter increments smoothly, 300ms per §8
    const controls = animate(from, to, {
      duration: 0.3,
      ease: "easeOut",
      onUpdate: (val) => {
        if (counterRef.current) {
          counterRef.current.textContent = `${Math.round(val)}%`;
        }
      },
    });
    return () => controls.stop();
  }, [overallPct, prefersReducedMotion]);

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
          const isPulsing = pulsing[i];

          return (
            // Moment 3: pulse scale 1.0 → 1.03 → 1.0, 200ms ease-in-out per §8
            <motion.g
              key={i}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              animate={
                isPulsing && !prefersReducedMotion
                  ? { scale: [1, 1.03, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.2, ease: "easeInOut" }}
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
            </motion.g>
          );
        })}
      </svg>

      {/* Center percentage counter — animated smoothly per §8 */}
      <span
        ref={counterRef}
        aria-hidden
        className="absolute font-bold text-[var(--neutral-950)] select-none"
        style={{
          fontSize: `${size * 0.2}px`,
          lineHeight: 1,
        }}
      >
        {overallPct}%
      </span>
    </div>
  );
}
