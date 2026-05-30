"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BillingInterval = "monthly" | "annual";

type Tier = {
  key: string;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  annualBilled: string;
  annualSavings: string;
  description: string;
  highlight: boolean;
  features: string[];
  notIncluded: string[];
  cta: string;
  ctaAnnual?: string;
};

const TIERS: Tier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPrice: "$39",
    annualPrice: "$25",
    annualBilled: "$299/year",
    annualSavings: "Save $169",
    description: "Get your plan built and your numbers right.",
    highlight: false,
    features: [
      "All Course Modules",
      "25 AI Planning Credits/Month",
      "Complete Every Exercise",
      "BRD and Financial Model Generation",
      "Export to PDF",
      "Email Support",
    ],
    notIncluded: [
      "Weekly Async Q&A",
      "Financial Model Stress-Testing",
      "Equipment Sourcing Assistance",
      "1-on-1 Call at BRD Completion",
    ],
    cta: "Start Building",
    ctaAnnual: "Start Building, Pay Annually",
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPrice: "$99",
    annualPrice: "$67",
    annualBilled: "$799/year",
    annualSavings: "Save $389",
    description: "For owners who want to move fast with expert backup.",
    highlight: true,
    features: [
      "Everything in Starter",
      "100 AI Planning Credits/Month",
      "Weekly Async Q&A with Trent",
      "Financial Model Stress-Testing",
      "Priority Support",
    ],
    notIncluded: [
      "Equipment Sourcing Assistance",
      "1-on-1 Call at BRD Completion",
    ],
    cta: "Start with Growth",
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPrice: "$199",
    annualPrice: "$133",
    annualBilled: "$1,599/year",
    annualSavings: "Save $789",
    description: "Full support from concept to open doors.",
    highlight: false,
    features: [
      "Everything in Growth",
      "500 AI Planning Credits/Month",
      "Equipment Sourcing Assistance",
      "Roaster Matching Recommendations",
      "30-Min 1-on-1 Call at BRD Completion",
      "White-Glove Onboarding",
    ],
    notIncluded: [],
    cta: "Start with Pro",
  },
];

const FAQ = [
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade at any time from your billing settings. Upgrades take effect immediately; downgrades apply at the end of your current billing period.",
  },
  {
    q: "What is the annual plan billed as?",
    a: "Annual plans are charged as a single payment at the start of each year. You save roughly two months compared with paying monthly.",
  },
  {
    q: "What counts as an AI planning credit?",
    a: "Each message you send to the AI planning co-pilot uses one credit. Starter includes 25/month, Growth includes 100/month, and Pro includes 500/month.",
  },
  {
    q: "What is the weekly async Q&A?",
    a: "Growth and Pro members can submit questions each week. Trent records a short video response delivered within 48 hours.",
  },
  {
    q: "Is there a free trial?",
    a: "New accounts get 5 free AI planning messages to try the co-pilot before subscribing. No credit card is required for the preview, and your account will not be charged unless you start a paid subscription. After subscribing, you can cancel within 7 days of your first payment for a full refund, no questions asked.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards. Payments are processed securely by Stripe.",
  },
];

function PricingPageInner() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const searchParams = useSearchParams();
  const returnPath = searchParams.get("return");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
  }, []);

  async function startCheckout(tier: string) {
    const key = `${tier}_${interval}`;
    setLoading(key);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        window.location.href = `/login?redirect=/pricing`;
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  const backHref = returnPath ?? "/dashboard";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--teal)] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[var(--teal)] text-sm hidden sm:block">Timberline Coffee School</span>
          </Link>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link
                href={backHref}
                className="text-sm text-[var(--teal)] font-medium hover:underline"
              >
                Back to Dashboard
              </Link>
            ) : (
              <Link href="/login" className="text-sm text-[var(--teal)] font-medium hover:underline">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-12 pb-16">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-[var(--foreground)] mb-4">
            {isLoggedIn ? "Choose Your Plan" : "Groundwork Pricing"}
          </h1>
          <p className="text-[var(--muted-foreground)] text-lg">
            Three tiers. Two intervals. One goal: open doors with a plan that works.
          </p>
        </div>

        {/* Billing toggle — sticky on mobile so it stays visible while scrolling cards */}
        <div className="sticky sm:static top-0 z-10 bg-[var(--background)]/95 backdrop-blur-sm sm:bg-transparent py-4 sm:py-0 -mx-6 px-6 sm:mx-0 sm:px-0 mb-8 text-center">
          <div className="inline-flex items-center bg-white border border-[var(--border)] rounded-xl p-1 gap-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "monthly" ? "bg-[var(--teal)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "annual" ? "bg-[var(--teal)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              Annual
              <span className="ml-2 text-xs bg-[var(--teal-bg-850)] text-[var(--teal)] px-1.5 py-0.5 rounded-full font-semibold">
                ~2 months free
              </span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid sm:grid-cols-3 gap-6 mb-16">
          {TIERS.map((tier) => {
            const loadingKey = `${tier.key}_${interval}`;
            return (
              <div
                key={tier.key}
                className={`rounded-2xl p-8 border flex flex-col relative ${
                  tier.highlight
                    ? "bg-[var(--teal)] text-white border-[var(--teal)] shadow-lg"
                    : "bg-white text-[var(--foreground)] border-[var(--border)]"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[var(--warning-amber-3)] text-[var(--foreground)] text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className={`font-bold text-xl mb-1 ${tier.highlight ? "text-white" : "text-[var(--foreground)]"}`}>
                    {tier.name}
                  </h2>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold">
                      {interval === "annual" ? tier.annualPrice : tier.monthlyPrice}
                    </span>
                    <span className={`text-sm ${tier.highlight ? "text-[var(--sage)]" : "text-[var(--muted-foreground)]"}`}>/month</span>
                  </div>

                  {interval === "annual" && (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs ${tier.highlight ? "text-[var(--sage)]" : "text-[var(--muted-foreground)]"}`}>
                          {tier.annualBilled}
                        </span>
                        <span className="text-xs bg-[var(--teal-bg-850)] text-[var(--teal)] px-1.5 py-0.5 rounded-full font-semibold">
                          {tier.annualSavings}
                        </span>
                      </div>
                      <p className={`text-xs mb-2 ${tier.highlight ? "text-white/70" : "text-[var(--dark-grey)]"}`}>
                        Billed once at $
                        {tier.annualBilled.replace(/[^0-9,]/g, "")}{" "}
                        for 12 months. 7-day money-back guarantee; non-refundable after. Cancel anytime; access continues through the paid year. See{" "}
                        <a
                          href="/subscription-terms"
                          className={`underline ${tier.highlight ? "text-white" : "text-[var(--teal)]"}`}
                        >
                          Subscription Terms
                        </a>
                        .
                      </p>
                    </>
                  )}
                  {interval === "monthly" && (
                    <p className={`text-xs mb-2 ${tier.highlight ? "text-white/70" : "text-[var(--dark-grey)]"}`}>
                      Renews monthly. 7-day money-back on first payment; non-refundable after. Cancel anytime. See{" "}
                      <a
                        href="/subscription-terms"
                        className={`underline ${tier.highlight ? "text-white" : "text-[var(--teal)]"}`}
                      >
                        Subscription Terms
                      </a>
                      .
                    </p>
                  )}

                  <p className={`text-sm ${tier.highlight ? "text-[var(--sage)]" : "text-[var(--muted-foreground)]"}`}>
                    {tier.description}
                  </p>
                </div>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm items-start">
                      <span className={`flex-shrink-0 mt-0.5 ${tier.highlight ? "text-[var(--sage)]" : "text-[var(--teal)]"}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                      <span className={tier.highlight ? "text-white/90" : "text-[var(--foreground)]"}>{f}</span>
                    </li>
                  ))}
                  {tier.notIncluded.map((f) => (
                    <li key={f} className="flex gap-2 text-sm items-start">
                      <span className="flex-shrink-0 mt-0.5 text-[var(--neutral-cool-350)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </span>
                      <span className="text-[var(--neutral-cool-400)]">{f}</span>
                    </li>
                  ))}
                </ul>

                <p className={`text-xs text-center mb-3 ${tier.highlight ? "text-[var(--sage)]" : "text-[var(--dark-grey)]"}`}>
                  By subscribing you agree to our{" "}
                  <a href="/terms" className={`underline ${tier.highlight ? "text-white/70" : "text-[var(--teal)]"}`}>Terms</a>
                  {", "}
                  <a href="/privacy" className={`underline ${tier.highlight ? "text-white/70" : "text-[var(--teal)]"}`}>Privacy Policy</a>
                  {", and "}
                  <a href="/subscription-terms" className={`underline ${tier.highlight ? "text-white/70" : "text-[var(--teal)]"}`}>Subscription Terms</a>
                  .
                </p>
                <button
                  onClick={() => startCheckout(tier.key)}
                  disabled={loading === loadingKey}
                  className={`text-center py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
                    tier.highlight
                      ? "bg-white text-[var(--teal)] hover:bg-[var(--background)]"
                      : "bg-[var(--teal)] text-white hover:bg-[var(--teal-dark)]"
                  }`}
                >
                  {loading === loadingKey ? "Loading..." : ((interval === "annual" && tier.ctaAnnual) || tier.cta)}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mb-16">
          <h2 className="text-2xl font-bold text-[var(--foreground)] text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 font-medium text-[var(--foreground)] text-sm hover:bg-[var(--background)] transition-colors"
                >
                  <span>{item.q}</span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-[var(--muted-foreground)] leading-relaxed border-t border-[var(--border)]">
                    <p className="pt-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="text-center text-sm text-[var(--muted-foreground)]">
          <p>
            Questions? Email{" "}
            <a href="mailto:hello@timberline.coffee" className="text-[var(--teal)] hover:underline">
              hello@timberline.coffee
            </a>
          </p>
        </div>

        <div className="mt-8 flex justify-center gap-6 text-xs text-[var(--dark-grey)]">
          <Link href="/terms" className="hover:text-[var(--teal)] transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-[var(--teal)] transition-colors">Privacy Policy</Link>
          <Link href="/subscription-terms" className="hover:text-[var(--teal)] transition-colors">Subscription Terms</Link>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingPageInner />
    </Suspense>
  );
}
