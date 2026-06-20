// TIM-2803: Payment failure banner on /dashboard.
//
// Shown when users.subscription_status === "past_due". The invoice.payment_failed
// Stripe webhook stamps this status (TIM-1902); this banner surfaces it in-app
// so owners know to act before the 3-day grace period expires. Mirrors the
// compact strip format of TrialBanner; the full billing card lives at
// /account/billing (which this banner links to).

import Link from "next/link";

export function PaymentFailureBanner() {
  return (
    <div
      role="alert"
      data-testid="payment-failure-banner"
      className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border mb-6 bg-[var(--warning-bg)] border-[var(--warning-amber-3)]"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          style={{ stroke: "var(--warning-dark)" }}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-xs font-semibold text-[var(--warning-text-9)]">
          Your payment didn&apos;t go through. Update your card to keep your plan active.
        </p>
      </div>
      <Link
        href="/account/billing"
        className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border bg-[var(--warning-amber-3)] border-[var(--warning-amber-3)] text-[var(--foreground)] hover:bg-[var(--warning-amber-2)] transition-colors"
      >
        Update payment method
      </Link>
    </div>
  );
}
