// TIM-1903: Persistent trial banner on /dashboard.
//
// Days-left is computed server-side from `users.trial_ends_at` (single source
// of truth — the Stripe webhook seeds this value in TIM-1902). No client-side
// date math, so the banner cannot drift if a user keeps the tab open across
// midnight. The user closes / reopens the dashboard, the value re-derives.
//
// Color shifts to a warning tone at ≤ 2 days remaining; on the final day the
// copy reads "Last day — your trial ends today" per TIM-1898 §8 item 2 spec.
// Plan name is canonical Starter / Pro (TIM-907) and pulled from the chosen
// `subscription_tier` so the CTA reads accurately for the plan the user will
// convert to.

import Link from "next/link";

interface TrialBannerProps {
  trialEndsAt: string | Date;
  // The plan the user picked at trial signup (drives "Choose your plan" copy
  // for Starter-bound trialists who may want to switch to Pro mid-trial).
  chosenTier: "starter" | "pro";
}

function daysLeft(trialEndsAt: Date, now: Date): number {
  // Ceiling on the partial day so "23 hours left" still reads as "1 day left",
  // never "0 days". The "Last day" branch is gated on the absolute date below.
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function isLastDay(trialEndsAt: Date, now: Date): boolean {
  // True when the trial ends within the next 24 hours.
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms > 0 && ms <= 86_400_000;
}

export function TrialBanner({ trialEndsAt, chosenTier }: TrialBannerProps) {
  const end = typeof trialEndsAt === "string" ? new Date(trialEndsAt) : trialEndsAt;
  const now = new Date();
  if (end <= now) return null;

  const remaining = daysLeft(end, now);
  const lastDay = isLastDay(end, now);
  // Trial is always 7 days; progress = (days used) / 7.
  const used = Math.min(7, Math.max(0, 7 - remaining));
  const pct = Math.min(100, Math.max(0, (used / 7) * 100));

  // Warning tone kicks in at ≤ 2 days remaining.
  const warn = remaining <= 2;

  const headline = lastDay
    ? "Last day — your trial ends today"
    : remaining === 1
      ? "Pro trial — 1 day left"
      : `Pro trial — ${remaining} days left`;

  const tone = warn
    ? {
        wrap: "bg-[var(--warning-bg)] border-[var(--warning-amber-3)]",
        text: "text-[var(--warning-text-9)]",
        bar: "bg-[var(--warning-amber-3)]",
        track: "bg-[var(--warning-amber-3)]/25",
      }
    : {
        wrap: "bg-[var(--teal-bg-50)] border-[var(--teal-tint)]",
        text: "text-[var(--teal)]",
        bar: "bg-[var(--teal)]",
        track: "bg-[var(--teal)]/15",
      };

  const ctaLabel =
    chosenTier === "pro" ? "Manage your plan" : "Choose your plan";
  const ctaHref = chosenTier === "pro" ? "/account/billing" : "/pricing";

  return (
    <div
      role="status"
      data-testid="trial-banner"
      data-warn={warn ? "1" : "0"}
      data-days-left={remaining}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${tone.wrap}`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold ${tone.text}`}>{headline}</p>
        <div
          className={`mt-2 h-1.5 rounded-full overflow-hidden ${tone.track}`}
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full ${tone.bar} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <Link
        href={ctaHref}
        className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
          warn
            ? "bg-[var(--warning-amber-3)] border-[var(--warning-amber-3)] text-[var(--foreground)] hover:bg-[var(--warning-amber-2)]"
            : "bg-[var(--teal)] border-[var(--teal)] text-white hover:bg-[var(--teal-dark)]"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
