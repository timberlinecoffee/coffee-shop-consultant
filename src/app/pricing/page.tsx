"use client";

import { useState } from "react";
import Link from "next/link";

type BillingInterval = "monthly" | "annual";

const TIERS = [
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
      "All course modules",
      "25 AI coaching credits/month",
      "Complete every exercise",
      "BRD and financial model generation",
      "Export to PDF",
      "Email support",
    ],
    notIncluded: [
      "Weekly async Q&A",
      "Financial model stress-testing",
      "Equipment sourcing assistance",
      "1-on-1 call at BRD completion",
    ],
    cta: "Start with Starter",
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
      "100 AI coaching credits/month",
      "Weekly async Q&A with Trent",
      "Financial model stress-testing",
      "Priority support",
    ],
    notIncluded: [
      "Equipment sourcing assistance",
      "1-on-1 call at BRD completion",
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
      "Unlimited AI coaching",
      "Equipment sourcing assistance",
      "Roaster matching recommendations",
      "30-min 1-on-1 call at BRD completion",
      "White-glove onboarding",
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
    q: "What counts as an AI coaching credit?",
    a: "Each message you send to the AI coach uses one credit. Starter includes 25/month, Growth includes 100/month, and Pro is unlimited.",
  },
  {
    q: "What is the weekly async Q&A?",
    a: "Growth and Pro members can submit questions each week. Trent records a short video response delivered within 48 hours.",
  },
  {
    q: "Is there a free trial?",
    a: "There is no free trial, but you can cancel within 7 days of your first payment for a full refund -- no questions asked.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards. Payments are processed securely by Stripe.",
  },
];

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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

  return (
    <div className="min-h-screen bg-neutral-100">
      <nav className="bg-white border-b border-grey-light px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-teal text-sm hidden sm:block">Timberline Coffee School</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-teal font-medium hover:underline">Sign in</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-neutral-950 mb-4">Groundwork pricing</h1>
          <p className="text-neutral-600 text-lg mb-8">
            Three tiers. Two intervals. One goal: open doors with a plan that works.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-white border border-grey-light rounded-xl p-1 gap-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "monthly" ? "bg-teal text-white" : "text-neutral-600 hover:text-neutral-950"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "annual" ? "bg-teal text-white" : "text-neutral-600 hover:text-neutral-950"
              }`}
            >
              Annual
              <span className="ml-2 text-xs bg-sage-surface text-teal px-1.5 py-0.5 rounded-full font-semibold">
                2 months free
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
                    ? "bg-teal text-white border-teal shadow-lg"
                    : "bg-white text-neutral-950 border-grey-light"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-warning text-neutral-950 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      Most popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className={`font-bold text-xl mb-1 ${tier.highlight ? "text-white" : "text-neutral-950"}`}>
                    {tier.name}
                  </h2>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold">
                      {interval === "annual" ? tier.annualPrice : tier.monthlyPrice}
                    </span>
                    <span className={`text-sm ${tier.highlight ? "text-sage" : "text-neutral-600"}`}>/month</span>
                  </div>

                  {interval === "annual" && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs ${tier.highlight ? "text-sage" : "text-neutral-600"}`}>
                        {tier.annualBilled}
                      </span>
                      <span className="text-xs bg-sage-surface text-teal px-1.5 py-0.5 rounded-full font-semibold">
                        {tier.annualSavings}
                      </span>
                    </div>
                  )}

                  <p className={`text-sm ${tier.highlight ? "text-sage" : "text-neutral-600"}`}>
                    {tier.description}
                  </p>
                </div>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm items-start">
                      <span className={`flex-shrink-0 mt-0.5 ${tier.highlight ? "text-sage" : "text-teal"}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                      <span className={tier.highlight ? "text-white/90" : "text-neutral-950"}>{f}</span>
                    </li>
                  ))}
                  {tier.notIncluded.map((f) => (
                    <li key={f} className="flex gap-2 text-sm items-start">
                      <span className="flex-shrink-0 mt-0.5 text-neutral-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </span>
                      <span className="text-neutral-400">{f}</span>
                    </li>
                  ))}
                </ul>

                <p className={`text-xs text-center mb-3 ${tier.highlight ? "text-sage" : "text-neutral-500"}`}>
                  By subscribing you agree to our{" "}
                  <a href="/terms" className={`underline ${tier.highlight ? "text-white/70" : "text-teal"}`}>Terms</a>
                  {", "}
                  <a href="/privacy" className={`underline ${tier.highlight ? "text-white/70" : "text-teal"}`}>Privacy Policy</a>
                  {", and "}
                  <a href="/subscription-terms" className={`underline ${tier.highlight ? "text-white/70" : "text-teal"}`}>Subscription Terms</a>
                  .
                </p>
                <button
                  onClick={() => startCheckout(tier.key)}
                  disabled={loading === loadingKey}
                  className={`text-center py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
                    tier.highlight
                      ? "bg-white text-teal hover:bg-neutral-100"
                      : "bg-teal text-white hover:bg-teal-dark"
                  }`}
                >
                  {loading === loadingKey ? "Loading..." : tier.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mb-16">
          <h2 className="text-2xl font-bold text-neutral-950 text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <div key={i} className="bg-white border border-grey-light rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 font-medium text-neutral-950 text-sm hover:bg-neutral-100 transition-colors"
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
                  <div className="px-6 pb-4 text-sm text-neutral-600 leading-relaxed border-t border-grey-light">
                    <p className="pt-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="text-center text-sm text-neutral-600">
          <p>
            Questions? Email{" "}
            <a href="mailto:hello@timberline.coffee" className="text-teal hover:underline">
              hello@timberline.coffee
            </a>
          </p>
        </div>

        <div className="mt-8 flex justify-center gap-6 text-xs text-neutral-500">
          <Link href="/terms" className="hover:text-teal transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-teal transition-colors">Privacy Policy</Link>
          <Link href="/subscription-terms" className="hover:text-teal transition-colors">Subscription Terms</Link>
        </div>
      </div>
    </div>
  );
}
