"use client";

import { useState } from "react";
import PricingCard, { type PricingPlan } from "./PricingCard";
import { FadeUp, StaggerContainer, StaggerItem } from "./AnimatedElements";

type BillingInterval = "monthly" | "annual";

interface TierCopy {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  monthlyNote: string;
  annualNote: string;
  features: string[];
  cta: string;
  recommended: boolean;
  accent: boolean;
}

// TIM-2280: landing-page pricing cards reflect the cadence selected by the
// toggle above (annual default). CTAs forward `?interval=` to /pricing so the
// pricing page mounts with the matching cadence and checkout uses the right
// Stripe priceId (via planKeyFromParams in src/lib/stripe.ts).
const TIERS: TierCopy[] = [
  {
    name: "Starter",
    monthlyPrice: "$39",
    annualPrice: "$31",
    monthlyNote:
      "Billed monthly. 7-day free trial; cancel anytime before day 7.",
    annualNote:
      "$375/year (save 20%). 7-day free trial; cancel anytime before day 7.",
    features: [
      "All planning modules",
      "100 AI planning credits per month",
      "Complete every exercise",
      "Business plan and financial model generation",
      "Export to PDF",
      "Email support",
    ],
    cta: "Start 7-Day Free Trial",
    recommended: false,
    accent: false,
  },
  {
    name: "Pro",
    monthlyPrice: "$99",
    annualPrice: "$79",
    monthlyNote:
      "Billed monthly. 7-day free trial; cancel anytime before day 7.",
    annualNote:
      "$950/year (save 20%). 7-day free trial; cancel anytime before day 7.",
    features: [
      "Everything in Starter",
      "1,000 AI planning credits per month",
      "Coffee Shop World benchmarking vs. real shops",
      "Weekly Live Office Hours Q&A + recordings",
      "Deeper insights — deep market research, longer Scout chains",
      "Priority support",
      "Unlimited locations and projects",
    ],
    cta: "Start 7-Day Free Trial",
    recommended: true,
    accent: true,
  },
];

function planFor(tier: TierCopy, interval: BillingInterval): PricingPlan {
  const isAnnual = interval === "annual";
  return {
    name: tier.name,
    price: isAnnual ? tier.annualPrice : tier.monthlyPrice,
    period: "/month",
    note: isAnnual ? tier.annualNote : tier.monthlyNote,
    features: tier.features,
    cta: tier.cta,
    href: `/pricing?interval=${interval}`,
    recommended: tier.recommended,
    accent: tier.accent,
  };
}

export default function PricingSection() {
  const [interval, setIntervalState] = useState<BillingInterval>("annual");

  return (
    <div className="max-w-6xl mx-auto">
      <FadeUp className="text-center mb-10">
        <p
          className="font-semibold uppercase mb-3"
          style={{ fontSize: "11px", letterSpacing: "0.12em", color: "var(--sage)" }}
        >
          Pricing
        </p>
        <h2
          className="font-bold"
          style={{
            fontSize: "clamp(1.6rem, 3.5vw, 2.25rem)",
            lineHeight: 1.2,
            fontWeight: 700,
            color: "var(--teal)",
          }}
        >
          Two plans. One goal: open with a plan that works.
        </h2>
      </FadeUp>

      <FadeUp delay={0.1}>
        <div role="radiogroup" aria-label="Billing cadence" className="text-center mb-10">
          <div className="inline-flex items-center bg-white border border-[var(--border)] rounded-xl p-1 gap-1">
            <button
              type="button"
              role="radio"
              aria-checked={interval === "monthly"}
              onClick={() => setIntervalState("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "monthly"
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={interval === "annual"}
              onClick={() => setIntervalState("annual")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "annual"
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Annual
              <span className="ml-2 text-xs bg-[var(--teal-bg-850)] text-[var(--teal)] px-1.5 py-0.5 rounded-full font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
        {TIERS.map((tier) => (
          <StaggerItem key={tier.name} className="h-full">
            <PricingCard plan={planFor(tier, interval)} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
