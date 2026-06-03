"use client";

// TIM-1956 Phase 2C: in-app upgrade prompt for Starter clients hitting a
// Pro-only touchpoint. Microcopy verbatim from Marketing Copy v3
// (TIM-1950 doc "copy"). Primary CTA routes into the upgrade flow at
// /pricing (canonical entry per TIM-1210); secondary CTA also lands on
// /pricing so a Starter can compare without committing.
//
// Reused from the PaywallModal pattern (TIM-643 / TIM-819) so the chrome,
// keyboard handling, and CTA stack are consistent with the rest of the app.

import { useEffect, useCallback } from "react";
import Link from "next/link";

export type ProFeatureKey =
  | "coffee_shop_world"
  | "deeper_insights"
  | "office_hours"
  | "multi_project"
  | "generic";

interface ProUpgradePromptProps {
  open: boolean;
  onClose: () => void;
  feature?: ProFeatureKey;
}

interface PromptContent {
  title: string;
  body: string;
  ref: string;
}

// TIM-1903: copy refreshed to TIM-1905 §4 verbatim (marketing-locked,
// founder-voice, no em dashes, no jargon). Title/body wording matches the
// copy doc one-for-one so the implementation does not drift from sign-off.
const CONTENT: Record<ProFeatureKey, PromptContent> = {
  coffee_shop_world: {
    title: "Pricing Benchmarks",
    body: "See how your prices compare to real shops in your area. Available on Pro.",
    ref: "pricing-benchmarks",
  },
  deeper_insights: {
    title: "Deep Research",
    body: "This pulls live market and competitor data into your plan. Available on Pro.",
    ref: "deep-research",
  },
  office_hours: {
    title: "Weekly live Office Hours Q&A",
    body: "Pro members get weekly live Q&A with Trent. Bring your questions and get real answers from someone who has opened coffee shops.",
    ref: "office-hours",
  },
  multi_project: {
    title: "Multiple Projects",
    body: "Planning a second location? Manage unlimited projects on Pro.",
    ref: "multiple-projects",
  },
  generic: {
    title: "This is a Pro feature",
    body: "Upgrade to keep access after your trial.",
    ref: "generic",
  },
};

export function ProUpgradePrompt({
  open,
  onClose,
  feature = "generic",
}: ProUpgradePromptProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  if (!open) return null;

  const content = CONTENT[feature];
  const upgradeHref = `/pricing?ref=${content.ref}`;
  const learnMoreHref = "/pricing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-upgrade-prompt-title"
      data-testid="pro-upgrade-prompt"
      data-feature={feature}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--teal)]/10 flex items-center justify-center">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--teal)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h2
          id="pro-upgrade-prompt-title"
          className="text-lg font-bold text-[var(--foreground)] mb-2"
        >
          {content.title}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-6">
          {content.body}
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href={upgradeHref}
            className="block bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
            data-testid="pro-upgrade-prompt-primary"
          >
            Upgrade to Pro
          </Link>
          <Link
            href={learnMoreHref}
            className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors py-1"
            data-testid="pro-upgrade-prompt-secondary"
          >
            Learn more
          </Link>
        </div>
      </div>
    </div>
  );
}
