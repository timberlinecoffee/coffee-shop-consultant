"use client";

import { useState } from "react";
import Link from "next/link";

const FEATURES = {
  free: [
    { label: "Dashboard access", included: true },
    { label: "Preview Module 1 content", included: true },
    { label: "Complete exercises", included: false },
    { label: "AI coaching", included: false },
    { label: "Deliverable generation (BRD, financial model)", included: false },
    { label: "All 8 modules", included: false },
    { label: "Export to PDF", included: false },
    { label: "Priority support", included: false },
  ],
  builder: [
    { label: "Dashboard access", included: true },
    { label: "All 8 modules", included: true },
    { label: "50 AI coaching credits/month", included: true },
    { label: "Complete exercises", included: true },
    { label: "Deliverable generation (BRD, financial model)", included: true },
    { label: "Export to PDF", included: true },
    { label: "Email support", included: true },
    { label: "Priority support", included: false },
  ],
  accelerator: [
    { label: "Everything in Builder", included: true },
    { label: "Unlimited AI coaching", included: true },
    { label: "Weekly async Q&A with Trent", included: true },
    { label: "Financial model stress-testing", included: true },
    { label: "Equipment sourcing assistance", included: true },
    { label: "Roaster matching recommendations", included: true },
    { label: "30-min 1-on-1 call at BRD completion", included: true },
    { label: "Priority support", included: true },
  ],
};

type BillingInterval = "monthly" | "annual";

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState<string | null>(null);

  async function startCheckout(planKey: string) {
    setLoading(planKey);
    try {
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
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

  const plans = [
    {
      name: "Free",
      monthlyPrice: "$0",
      annualPrice: "$0",
      period: "",
      annualNote: "",
      description: "Explore and see if this is for you.",
      features: FEATURES.free,
      cta: "Get started",
      href: "/login",
      highlight: false,
      planKey: null,
    },
    {
      name: "Builder",
      monthlyPrice: "$49",
      annualPrice: "$39",
      period: "/month",
      annualNote: "billed $468/year",
      description: "Everything you need to build your plan.",
      features: FEATURES.builder,
      cta: interval === "annual" ? "Start building (annual)" : "Start building",
      href: null,
      highlight: true,
      planKey: interval === "annual" ? "builder_annual" : "builder_monthly",
    },
    {
      name: "Accelerator",
      monthlyPrice: "$99",
      annualPrice: "$79",
      period: "/month",
      annualNote: "billed $948/year",
      description: "For serious owners who want to move fast.",
      features: FEATURES.accelerator,
      cta: interval === "annual" ? "Get accelerated (annual)" : "Get accelerated",
      href: null,
      highlight: false,
      planKey: interval === "annual" ? "accelerator_annual" : "accelerator_monthly",
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#155e63] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[#155e63] text-sm hidden sm:block">Timberline Coffee School</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-[#155e63] font-medium hover:underline">Sign in</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#1a1a1a] mb-4">Simple pricing</h1>
          <p className="text-[#afafaf] text-lg mb-8">Start free. Upgrade when you&apos;re ready to go deep.</p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-white border border-[#efefef] rounded-xl p-1 gap-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "monthly" ? "bg-[#155e63] text-white" : "text-[#afafaf] hover:text-[#1a1a1a]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                interval === "annual" ? "bg-[#155e63] text-white" : "text-[#afafaf] hover:text-[#1a1a1a]"
              }`}
            >
              Annual
              <span className="ml-1.5 text-xs bg-[#76b39d]/20 text-[#155e63] px-1.5 py-0.5 rounded-full">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 border flex flex-col ${
                plan.highlight
                  ? "bg-[#155e63] text-white border-[#155e63]"
                  : "bg-white text-[#1a1a1a] border-[#efefef]"
              }`}
            >
              <div className="mb-6">
                <h2 className={`font-bold text-xl mb-1 ${plan.highlight ? "text-white" : "text-[#1a1a1a]"}`}>
                  {plan.name}
                </h2>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-bold">
                    {interval === "annual" ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  {plan.period && (
                    <span className={`text-sm ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                {plan.annualNote && interval === "annual" && (
                  <p className={`text-xs mb-2 ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>
                    {plan.annualNote}
                  </p>
                )}
                <p className={`text-sm ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex gap-2 text-sm items-start">
                    <span className={`flex-shrink-0 mt-0.5 ${
                      f.included
                        ? plan.highlight ? "text-[#76b39d]" : "text-[#155e63]"
                        : "text-[#d0d0d0]"
                    }`}>
                      {f.included ? "✓" : "✗"}
                    </span>
                    <span className={
                      f.included
                        ? plan.highlight ? "text-white/90" : "text-[#1a1a1a]"
                        : "text-[#d0d0d0]"
                    }>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.href ? (
                <Link
                  href={plan.href}
                  className={`text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-white text-[#155e63] hover:bg-[#faf9f7]"
                      : "bg-[#155e63] text-white hover:bg-[#0e4448]"
                  }`}
                >
                  {plan.cta}
                </Link>
              ) : (
                <button
                  onClick={() => plan.planKey && startCheckout(plan.planKey)}
                  disabled={loading === plan.planKey}
                  className={`text-center py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
                    plan.highlight
                      ? "bg-white text-[#155e63] hover:bg-[#faf9f7]"
                      : "bg-[#155e63] text-white hover:bg-[#0e4448]"
                  }`}
                >
                  {loading === plan.planKey ? "Loading…" : plan.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="text-center mt-12 text-sm text-[#afafaf]">
          <p>Questions? Email <a href="mailto:hello@timberline.coffee" className="text-[#155e63] hover:underline">hello@timberline.coffee</a></p>
        </div>

        <div className="mt-8 flex justify-center gap-6 text-xs text-[#afafaf]">
          <Link href="/terms" className="hover:text-[#155e63] transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-[#155e63] transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
