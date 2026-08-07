"use client";

// TIM-3446: the moment nobody was ever asked.
//
// The 5 August first-run audit found 23 signups and 0 conversions. Not one
// person declined — the product never offered. Onboarding ended with "Open my
// Concept workspace", which dropped an owner into eleven read-only screens
// whose banner (honest since TIM-3442) said editing needs a trial, with
// nothing anywhere that started one.
//
// This is that ask, placed after the concept is saved so it is an invitation
// rather than a toll gate. Declining is a visible, unpunished choice: the
// read-only preview is genuinely useful and the copy says so instead of
// pretending it's a wall.
//
// The trial is card-required by board decision (TIM-1902, TIM-1898 §8,
// confirmation 09434556). The FTC auto-renew disclosure below is therefore
// mandatory before the card is requested, and comes from one shared constant
// so it cannot drift from /pricing or from Stripe Checkout.

import { useState } from "react";
import Link from "next/link";
import {
  TRIAL_DISCLOSURE_SENTENCES,
  SUBSCRIPTION_TERMS_PATH,
} from "@/lib/legal/trial-disclosure";

type Interval = "monthly" | "annual";
type TierKey = "starter" | "pro";

interface TierCard {
  key: TierKey;
  name: string;
  monthly: string;
  annual: string;
  annualBilled: string;
  line: string;
  credits: string;
}

// Mirrors /pricing. Prices also appear in the legal disclosure, which is why
// they are not invented here.
const TIERS: TierCard[] = [
  {
    key: "starter",
    name: "Starter",
    monthly: "$39",
    annual: "$31",
    annualBilled: "$375 billed yearly",
    line: "Everything to plan and open one shop.",
    credits: "100 AI planning credits a month",
  },
  {
    key: "pro",
    name: "Pro",
    monthly: "$99",
    annual: "$79",
    annualBilled: "$950 billed yearly",
    line: "Weekly live office hours, deeper research, unlimited projects.",
    credits: "1,000 AI planning credits a month",
  },
];

export interface TrialOfferStepProps {
  shopName: string;
  /** Where "I'll look around first" goes. */
  skipHref: string;
  onSkip: () => void;
}

export function TrialOfferStep({ shopName, skipHref, onSkip }: TrialOfferStepProps) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [tier, setTier] = useState<TierKey>("pro");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startTrial() {
    setError(null);
    setStarting(true);
    try {
      const referral =
        typeof window !== "undefined"
          ? (window as unknown as { Rewardful?: { referral?: string } }).Rewardful?.referral
          : undefined;

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, referral }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(
          data.error ??
            "We couldn't open the checkout page. Your concept is saved either way — you can start the trial later from Settings.",
        );
        setStarting(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError(
        "We couldn't reach the checkout page. Your concept is saved either way — you can start the trial later from Settings.",
      );
      setStarting(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-[var(--teal)] mb-2">
        {shopName} is saved.
      </p>
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
        Start your free trial to edit it
      </h1>
      <p className="text-[var(--dark-grey)] text-sm mb-6 leading-relaxed">
        Your concept is written and waiting. Seven free days turns on editing
        and opens the other ten workspaces — financials, hiring, suppliers,
        marketing, and the rest.
      </p>

      {/* Billing interval */}
      <div
        className="inline-flex rounded-xl border border-[var(--border)] p-1 mb-5"
        role="group"
        aria-label="Billing interval"
      >
        {(["monthly", "annual"] as Interval[]).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setInterval(opt)}
            aria-pressed={interval === opt}
            className={`min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors ${
              interval === opt
                ? "bg-[var(--teal)] text-white"
                : "text-[var(--dark-grey)] hover:text-[var(--foreground)]"
            }`}
          >
            {opt === "monthly" ? "Monthly" : "Yearly — save 20%"}
          </button>
        ))}
      </div>

      {/* Plan chooser */}
      <div className="grid gap-3 sm:grid-cols-2 mb-5">
        {TIERS.map((t) => {
          const selected = tier === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTier(t.key)}
              aria-pressed={selected}
              className={`text-left rounded-xl border p-4 transition-colors ${
                selected
                  ? "border-[var(--teal)] bg-[var(--teal)]/5"
                  : "border-[var(--border)] hover:border-[var(--dark-grey)]"
              }`}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {t.name}
                </span>
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {interval === "monthly" ? t.monthly : t.annual}
                  <span className="text-xs font-normal text-[var(--dark-grey)]">
                    {" "}
                    /mo
                  </span>
                </span>
              </div>
              {interval === "annual" && (
                <p className="text-xs text-[var(--dark-grey)] mb-2">{t.annualBilled}</p>
              )}
              <p className="text-sm text-[var(--dark-grey)] leading-relaxed mb-2">
                {t.line}
              </p>
              <p className="text-sm text-[var(--foreground)]">{t.credits}</p>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-[var(--dark-grey)] mb-4">
        Every trial gets full Pro access and 75 AI credits for the seven days,
        whichever plan you pick. You choose now so we know what to switch you to
        on day 7 — not because it changes the trial.
      </p>

      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--error)] mb-4 bg-[var(--warning-amber-bg-10)] border border-[var(--error-bg-9)] rounded-xl px-3 py-2"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={startTrial}
        disabled={starting}
        className="w-full min-h-[48px] bg-[var(--teal)] text-white rounded-xl font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40"
      >
        {starting ? "Opening secure checkout…" : "Start my 7-day free trial"}
      </button>

      {/* FTC Negative Option Rule disclosure — required before the card ask.
          Wording is owned by src/lib/legal/trial-disclosure.ts. */}
      <div className="rounded-xl border border-[var(--border)] px-4 py-3 mt-4">
        <p className="text-[13px] text-[var(--muted-foreground)] leading-relaxed">
          {TRIAL_DISCLOSURE_SENTENCES.slice(0, -1).join(" ")}{" "}
          <Link href={SUBSCRIPTION_TERMS_PATH} className="text-[var(--teal)] underline">
            Subscription Terms
          </Link>{" "}
          apply.
        </p>
      </div>

      {/* The escape hatch, deliberately visible. Read-only is a real option and
          the audit found the preview genuinely useful — pretending otherwise
          would be the same dishonesty TIM-3442 removed from the banner. */}
      <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
        <Link
          href={skipHref}
          onClick={onSkip}
          className="inline-flex items-center justify-center min-h-[44px] text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] underline transition-colors"
        >
          I&apos;ll look around first
        </Link>
        <p className="text-xs text-[var(--dark-grey)] mt-1">
          You can read every workspace without a card, and start the trial any
          time.
        </p>
      </div>
    </div>
  );
}
