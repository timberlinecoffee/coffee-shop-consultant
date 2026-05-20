"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";

const EASE_SLIDE = [0.25, 0.46, 0.45, 0.94] as const;

/* ── FadeUp ─────────────────────────────────────────────────────────────── */
export function FadeUp({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-72px" }}
      transition={{ duration: 0.52, delay, ease: EASE_SLIDE }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ── StaggerContainer + StaggerItem ──────────────────────────────────────── */
export function StaggerContainer({
  children,
  className,
  style,
  delayStart = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delayStart?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.09, delayChildren: delayStart } },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-72px" }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 22 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.45, ease: EASE_SLIDE },
        },
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ── AnimatedCounter ──────────────────────────────────────────────────────── */
function easeOutExpo(t: number) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
  duration = 1800,
  className,
  style,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayed(Math.round(easeOutExpo(progress) * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, target, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}
      {displayed.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ── FadeIn (opacity only, no Y) ────────────────────────────────────────── */
export function FadeIn({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-72px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ── ScaleIn ────────────────────────────────────────────────────────────── */
export function ScaleIn({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-72px" }}
      transition={{ duration: 0.55, delay, ease: EASE_SLIDE }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}
