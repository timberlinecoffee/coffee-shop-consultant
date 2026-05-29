"use client";

import Link from "next/link";

export interface PricingPlan {
  /** Display name for the plan tier */
  name: string;
  /** Price string, e.g. "$49" or "Free" */
  price: string;
  /** Billing period, e.g. "/mo" — empty string for free tier */
  period: string;
  /** Short note beneath the price, e.g. "No credit card required" */
  note: string;
  /** Feature bullet list */
  features: string[];
  /** CTA button label */
  cta: string;
  /** CTA destination href */
  href: string;
  /** If true, shows "Most Popular" badge and elevated shadow */
  recommended: boolean;
  /** If true, renders with teal background (accent/highlighted tier) */
  accent: boolean;
}

/**
 * Pricing tier card used in the homepage pricing section.
 *
 * @example
 * <PricingCard
 *   plan={{
 *     name: "Builder",
 *     price: "$49",
 *     period: "/mo",
 *     note: "Everything you need to open.",
 *     features: ["Full workspace suite", "AI co-pilot", "PDF exports"],
 *     cta: "Start Building",
 *     href: "/login?plan=builder",
 *     recommended: true,
 *     accent: true,
 *   }}
 * />
 */
export default function PricingCard({ plan }: { plan: PricingPlan }) {
  return (
    <div
      className="flex flex-col rounded-2xl p-6 border transition-all duration-200 hover:-translate-y-1 h-full"
      style={{
        background: plan.accent ? "var(--teal)" : "white",
        borderColor: plan.accent ? "var(--teal)" : "var(--border-subtle)",
        boxShadow: plan.recommended
          ? "0 12px 40px rgba(21,94,99,0.22), 0 2px 8px rgba(21,94,99,0.12)"
          : "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {plan.recommended && (
        <p className="font-semibold uppercase mb-4" style={{ fontSize: "10px", letterSpacing: "0.12em", color: "rgba(255,255,255,0.7)" }}>
          Most Popular
        </p>
      )}
      <p className="font-semibold mb-3" style={{ fontSize: "18px", color: plan.accent ? "white" : "var(--teal)", fontWeight: 600 }}>
        {plan.name}
      </p>
      <div className="flex items-baseline gap-1 mb-1">
        <span style={{ fontSize: "38px", fontWeight: 700, lineHeight: 1, color: plan.accent ? "white" : "var(--teal)", letterSpacing: "-0.02em" }}>
          {plan.price}
        </span>
        {plan.period && (
          <span style={{ fontSize: "14px", color: plan.accent ? "rgba(255,255,255,0.7)" : "var(--neutral-500)" }}>
            {plan.period}
          </span>
        )}
      </div>
      <p className="mb-6" style={{ fontSize: "12px", color: plan.accent ? "rgba(255,255,255,0.6)" : "var(--neutral-500)", fontWeight: 300 }}>
        {plan.note}
      </p>
      <ul className="space-y-2.5 mb-8 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span style={{ color: plan.accent ? "rgba(255,255,255,0.8)" : "var(--sage)", fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>&#10003;</span>
            <span style={{ fontSize: "13px", color: plan.accent ? "rgba(255,255,255,0.85)" : "var(--neutral-700)", lineHeight: 1.5 }}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href={plan.href}
        className="w-full text-center py-3 px-5 rounded-lg font-semibold text-sm transition-all hover:-translate-y-0.5"
        style={{
          background: plan.accent ? "white" : "var(--teal)",
          color: plan.accent ? "var(--teal)" : "white",
          boxShadow: plan.accent ? "0 4px 16px rgba(0,0,0,0.15)" : "0 2px 8px rgba(21,94,99,0.2)",
          display: "block",
        }}
      >
        {plan.cta}
      </Link>
    </div>
  );
}
