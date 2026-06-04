"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "../_components/Logo";
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

// TIM-1902: collapsed to two tiers (Starter / Pro) with a 7-day card-required
// free trial that unlocks Pro features for every trialist.
// TIM-1954 (TIM-1944 plan rev 2 Decision 1): annual prices $399 / $999 with a
// "Save 15% with annual" framing; Pro credits equalized to 100/mo; Pro feature
// mix swapped to Coffee Shop World + Office Hours + deeper insights + priority
// support + multi-project.
const TIERS: Tier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPrice: "$39",
    annualPrice: "$33",
    annualBilled: "$399/year",
    annualSavings: "Save 15%",
    description: "Everything to plan and open one shop.",
    highlight: false,
    features: [
      "All planning workspaces",
      "Scout AI assistant: chat and section generation",
      "Investor-ready PDF export",
      "100 AI planning credits/month",
    ],
    notIncluded: [
      "Coffee Shop World benchmarking",
      "Weekly Live Office Hours Q&A",
      "Deeper insights",
      "Unlimited locations and projects",
      "Priority support",
    ],
    cta: "Start 7-Day Free Trial",
    ctaAnnual: "Start 7-Day Free Trial",
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPrice: "$99",
    annualPrice: "$83",
    annualBilled: "$999/year",
    annualSavings: "Save 15%",
    description: "The full toolkit for owners who want every edge.",
    highlight: true,
    features: [
      "Everything in Starter",
      "Coffee Shop World benchmarking vs. real shops",
      "Weekly Live Office Hours Q&A + recordings",
      "Deeper insights: deep market research and longer Scout chains",
      "Unlimited locations and projects",
      "Priority support",
      "100 AI planning credits/month",
    ],
    notIncluded: [],
    cta: "Start 7-Day Free Trial",
    ctaAnnual: "Start 7-Day Free Trial",
  },
];

const FAQ = [
  {
    q: "How does the 7-day free trial work?",
    a: "Pick the plan you'd like to convert to, add a card, and you get 7 days of full Pro access plus 75 AI planning credits to try Scout. Cancel anytime in your billing settings before day 7 and you won't be charged. If you don't cancel, we charge the plan you picked on day 7 — Starter at $39/mo or Pro at $99/mo.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade or downgrade at any time from your billing settings. Upgrades take effect immediately; downgrades apply at the end of your current billing period.",
  },
  {
    q: "What is the annual plan billed as?",
    a: "Annual plans are charged as a single payment at the start of each year and save about 15% versus paying monthly.",
  },
  {
    q: "What counts as an AI planning credit?",
    a: "Credits are debited based on how much work Scout does on each turn — a short reply costs about one credit and a long research turn costs more. Trial accounts get 75 credits up front. Starter and Pro both include 100/month; Pro's value is in the additional features (Coffee Shop World, Office Hours, deeper insights, priority support, multi-project).",
  },
  {
    q: "What is Weekly Live Office Hours?",
    a: "Every week, Pro members get a live Office Hours call with Trent to bring questions or work through their plan. Sessions are recorded and shared with Pro members afterwards.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit and debit cards. Payments are processed securely by Stripe.",
  },
  {
    q: "Need a break?",
    a: "You can pause your plan for $2.99/mo instead of cancelling. Your workspace stays safe and you can resume at your current rate any time. Visit your billing settings to pause.",
  },
];

function PricingPageInner() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // TIM-1933: Track whether the logged-in viewer already has a live (trialing
  // / active / past_due) subscription. If yes, the CTA must call
  // /api/billing/change-plan (swap in place) instead of
  // /api/stripe/create-checkout-session (mint a new sub on top of the old).
  const [hasLiveSub, setHasLiveSub] = useState(false);
  const searchParams = useSearchParams();
  const returnPath = searchParams.get("return");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const logged = !!session;
      setIsLoggedIn(logged);
      if (!logged) return;
      fetch("/api/billing/status", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          const live = new Set(["trialing", "free_trial", "active", "past_due"]);
          setHasLiveSub(live.has(data.status ?? ""));
        })
        .catch(() => {});
    });
  }, []);

  async function startCheckout(tier: string) {
    const key = `${tier}_${interval}`;
    setLoading(key);
    try {
      if (hasLiveSub) {
        // In-place plan swap on the existing Stripe subscription.
        const res = await fetch("/api/billing/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, interval }),
        });
        const data = await res.json();
        if (res.ok) {
          window.location.href = "/account/billing?success=1";
        } else if (res.status === 401) {
          window.location.href = `/login?redirect=/pricing`;
        } else if (data.reason === "paused" || data.reason === "cancelled" || data.reason === "no_subscription") {
          window.location.href = "/account/billing";
        } else {
          alert(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
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
      } else if (res.status === 409 && data.reason === "existing_subscription") {
        // Race: status fetched as no-sub but a sub now exists. Bounce through
        // change-plan instead of mint.
        setHasLiveSub(true);
        const swap = await fetch("/api/billing/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier, interval }),
        });
        if (swap.ok) {
          window.location.href = "/account/billing?success=1";
        } else {
          alert("Could not switch your plan. Open Billing and try again.");
        }
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
          <Link href={isLoggedIn ? "/dashboard" : "/"} className="flex items-center" aria-label="Groundwork home">
            <Logo variant="color" height={28} />
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
            Two plans. 7-day free trial — card required, cancel anytime, full Pro features during trial.
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
                Save 15%
              </span>
            </button>
          </div>
        </div>

        {/* Tier cards */}
        <div className="grid sm:grid-cols-2 gap-6 mb-16 max-w-3xl mx-auto">
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
                        7-day free trial — card required, cancel anytime before day 7 with no charge. After the trial, billed once at $
                        {tier.annualBilled.replace(/[^0-9,]/g, "")}{" "}
                        for 12 months. Cancel anytime; access continues through the paid year. See{" "}
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
                      7-day free trial — card required, cancel anytime before day 7 with no charge. Renews monthly afterwards. See{" "}
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
                  {loading === loadingKey
                    ? "Loading..."
                    : hasLiveSub
                      ? `Switch to ${tier.name}`
                      : ((interval === "annual" && tier.ctaAnnual) || tier.cta)}
                </button>
              </div>
            );
          })}
        </div>

        {/* Trial reassurance + FTC auto-renew disclosure (required before card entry) */}
        <div className="max-w-3xl mx-auto mb-16 text-center">
          <p className="text-[var(--foreground)] font-medium mb-3" style={{ fontSize: "15px" }}>
            Try Pro free for 7 days. We&apos;ll remind you before your trial ends.
          </p>
          <div
            className="rounded-xl border border-[var(--border)] px-6 py-4 text-left"
            style={{ background: "var(--background)" }}
          >
            <p className="text-[var(--muted-foreground)] leading-relaxed" style={{ fontSize: "13px" }}>
              Your free trial includes full Pro access for 7 days. A credit card is required at
              signup. After your trial, your card will be charged automatically for the plan you
              selected at signup: Starter at $39/month or Pro at $99/month. Cancel in{" "}
              <strong>Settings &gt; Billing</strong> at any time before day 7 to avoid a charge.{" "}
              <a href="/subscription-terms" className="text-[var(--teal)] underline">
                Subscription Terms
              </a>{" "}
              apply.
            </p>
          </div>
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
