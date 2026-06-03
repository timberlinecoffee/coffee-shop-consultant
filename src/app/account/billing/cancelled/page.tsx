// TIM-1903: confirmation page after a one-click trial cancel from email.
// Reachable without a session (the cancel-via-email route lands here after
// flipping cancel_at_period_end at Stripe).

import Link from "next/link";
import { Logo } from "@/app/_components/Logo";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trial cancelled | Groundwork" };

interface Props {
  searchParams: Promise<{ status?: string; reason?: string }>;
}

const COPY: Record<string, { headline: string; body: string }> = {
  ok: {
    headline: "Your trial is cancelled.",
    body: "We won't charge your card. You can keep using Groundwork until the end of your trial, then your account drops to free. Sign back in any time to pick up a paid plan again.",
  },
  already: {
    headline: "Your trial was already cancelled.",
    body: "No action was needed — you're already set.",
  },
  invalid: {
    headline: "We couldn't read that link.",
    body: "Sign in to your account and cancel from Settings > Billing instead.",
  },
  expired: {
    headline: "That cancel link has expired.",
    body: "Sign in to your account and cancel from Settings > Billing instead.",
  },
  no_subscription: {
    headline: "No subscription found.",
    body: "You don't have an active trial on file. If this looks wrong, email hello@timberline.coffee.",
  },
  error: {
    headline: "Something went wrong.",
    body: "Sign in to your account and cancel from Settings > Billing, or email hello@timberline.coffee and we'll handle it.",
  },
};

export default async function TrialCancelledPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status ?? "ok";
  const content = COPY[status] ?? COPY.error;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center">
          <Link href="/" aria-label="Groundwork home">
            <Logo variant="color" height={28} />
          </Link>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-6 pt-20 text-center">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">
          {content.headline}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-8">
          {content.body}
        </p>
        <Link
          href="/login"
          className="inline-block bg-[var(--teal)] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[var(--teal-dark)] transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
