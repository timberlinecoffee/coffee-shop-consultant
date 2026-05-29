"use client";

import { useEffect, useRef, useState } from "react";

interface ReadinessRingProps {
  /** 0–100 completion percentage */
  pct: number;
  /** Diameter in pixels */
  size?: number;
  /** If true, triggers the completion pulse (scale 1.0→1.03 200ms ease-in-out) */
  complete?: boolean;
}

/**
 * Circular progress ring for workspace module readiness.
 *
 * Moment 3 spec: When complete becomes true, the ring pulses scale 1.0→1.03
 * (200ms ease-in-out) and an internal counter animates to 100 over 300ms.
 *
 * @example
 * <ReadinessRing pct={67} size={40} complete={false} />
 * <ReadinessRing pct={100} size={40} complete={true} />
 */
export function ReadinessRing({ pct, size = 40, complete = false }: ReadinessRingProps) {
  const [displayPct, setDisplayPct] = useState(pct);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevComplete = useRef(complete);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (complete && !prevComplete.current) {
      setIsPulsing(true);
      const start = displayPct;
      const startTime = performance.now();
      const duration = 300;
      animRef.current = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        setDisplayPct(Math.round(start + (100 - start) * progress));
        if (progress >= 1) {
          if (animRef.current) clearInterval(animRef.current);
          setDisplayPct(100);
        }
      }, 16);
      setTimeout(() => setIsPulsing(false), 400);
    }
    prevComplete.current = complete;
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!complete) setDisplayPct(pct);
  }, [pct, complete]);

  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - displayPct / 100);
  const cx = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${displayPct}% complete`}
      role="img"
      style={{
        transform: isPulsing ? "scale(1.03)" : "scale(1)",
        transition: "transform 200ms ease-in-out",
        flexShrink: 0,
      }}
    >
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke="var(--neutral-200, var(--neutral-200))"
        strokeWidth="3"
      />
      <circle
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={complete ? "var(--teal, var(--teal))" : "var(--sage, var(--sage))"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 300ms ease-in-out" }}
      />
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.28}
        fontWeight="600"
        fill={complete ? "var(--teal, var(--teal))" : "var(--neutral-600, var(--neutral-600))"}
      >
        {displayPct}
      </text>
    </svg>
  );
}
