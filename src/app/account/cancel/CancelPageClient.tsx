"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Props = {
  tier: string;
  tierDisplayName: string;
  currentRate: string;
  periodEnd: string | null;
};

export function CancelPageClient({ tier, tierDisplayName, currentRate, periodEnd }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pausing" | "cancelling" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const periodEndFormatted = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  async function handlePause() {
    setState("pausing");
    try {
      const res = await fetch("/api/billing/pause", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setErrorCode(data.code ?? null);
        setState("error");
        return;
      }
      router.push("/account/billing?paused=1");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  async function handleCancel() {
    setState("cancelling");
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }
      router.push("/account/billing?cancelled=1");
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    }
  }

  const busy = state === "pausing" || state === "cancelling";

  return (
    <div className="bg-[var(--background)] min-h-full">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Before You Cancel</h1>
          <p className="mt-1 text-sm text-[var(--dark-grey)]">
            Keep your {tierDisplayName} plan and everything in it, for just $2.99/month.
          </p>
        </div>

        {/* Pause offer card */}
        <div className="bg-white rounded-xl border-2 border-[var(--teal)] p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="inline-block bg-[var(--teal)]/10 text-[var(--teal)] text-xs font-semibold px-2.5 py-1 rounded-full">
              Recommended
            </span>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--foreground)]">
              $2.99<span className="text-base font-normal text-[var(--dark-grey)]">/month</span>
            </p>
            <p className="text-sm text-[var(--dark-grey)] mt-0.5">while paused, instead of losing everything</p>
          </div>

          <ul className="space-y-2 text-sm text-[var(--foreground)]">
            <li className="flex items-start gap-2">
              <span className="text-[var(--teal)] mt-0.5">✓</span>
              Your entire {tierDisplayName} plan, financials, and progress are saved.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--teal)] mt-0.5">✓</span>
              Resume anytime and pick up exactly where you left off.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[var(--teal)] mt-0.5">✓</span>
              No commitment. Reactivate or cancel for real at any time.
            </li>
          </ul>

          <div className="bg-[var(--off-white)] rounded-lg p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Pausing from</span>
              <span className="font-medium text-[var(--foreground)]">
                {tierDisplayName} at {currentRate}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Next charge</span>
              <span className="font-medium text-[var(--foreground)]">
                $2.99{periodEndFormatted ? ` on ${periodEndFormatted}` : ""}
              </span>
            </div>
          </div>

          <button
            onClick={handlePause}
            disabled={busy}
            className="w-full text-sm bg-[var(--teal)] text-white px-5 py-3 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
          >
            {state === "pausing" ? "Pausing subscription…" : "Pause My Subscription for $2.99/mo"}
          </button>
        </div>

        {state === "error" && (
          errorCode === "past_due" ? (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-4 space-y-3">
              <p className="text-sm text-red-700">{errorMsg}</p>
              <Link
                href="/account/billing"
                className="inline-block text-sm bg-[var(--teal)] text-white px-4 py-2 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors"
              >
                Update Payment Method
              </Link>
            </div>
          ) : (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {errorMsg}
            </p>
          )
        )}

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-[var(--border)]" />
          <span className="text-xs text-[var(--dark-grey)]">or</span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {/* Cancel anyway section */}
        <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-3">
          <h2 className="font-semibold text-[var(--foreground)]">Cancel My Subscription</h2>
          <p className="text-sm text-[var(--dark-grey)]">
            Your access continues until{" "}
            {periodEndFormatted ? (
              <strong>{periodEndFormatted}</strong>
            ) : (
              "the end of your current billing period"
            )}
            . After that, your account will downgrade to the free plan and your saved data will
            be retained, but you will lose {tierDisplayName} features.
          </p>
          <button
            onClick={handleCancel}
            disabled={busy}
            className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {state === "cancelling" ? "Cancelling…" : "Cancel Anyway"}
          </button>
        </div>

        <div className="text-center">
          <Link
            href="/account/billing"
            className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
          >
            Never mind, keep my {tierDisplayName} plan
          </Link>
        </div>
      </div>
    </div>
  );
}

type AnnualProps = {
  tierDisplayName: string;
  periodEnd: string | null;
  userEmail?: string;
};

export function AnnualCancelPageClient({ tierDisplayName, periodEnd, userEmail }: AnnualProps) {
  const [email, setEmail] = useState(userEmail ?? "");
  const [reminderState, setReminderState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [reminderError, setReminderError] = useState("");

  const periodEndFormatted = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  async function handleReminderSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReminderState("submitting");
    setReminderError("");
    try {
      const res = await fetch("/api/account/renewal-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReminderError(data.error ?? "Something went wrong. Please try again.");
        setReminderState("error");
        return;
      }
      setReminderState("done");
    } catch {
      setReminderError("Network error. Please try again.");
      setReminderState("error");
    }
  }

  return (
    <div className="bg-[var(--background)] min-h-full">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Annual Plan</h1>
          <p className="mt-1 text-sm text-[var(--dark-grey)]">
            Pause is not available mid-cycle on annual plans.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Pause Becomes Available at Renewal</h2>
          <p className="text-sm text-[var(--dark-grey)]">
            Your annual {tierDisplayName} plan{" "}
            {periodEndFormatted ? (
              <>
                renews on <strong>{periodEndFormatted}</strong>
              </>
            ) : (
              "renews at the end of your billing period"
            )}
            . At that point you can switch to a monthly plan and use the pause option.
          </p>
          <p className="text-sm text-[var(--dark-grey)]">
            If you need to cancel your annual plan, please open the billing portal below.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/account/billing"
              className="inline-block text-sm bg-[var(--teal)] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors text-center"
            >
              Back to Billing
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] p-6 space-y-4">
          <h2 className="font-semibold text-[var(--foreground)]">Remind Me at Renewal</h2>
          <p className="text-sm text-[var(--dark-grey)]">
            Want a heads-up before your plan renews so you can switch to monthly and pause? Enter your
            email and we will remind you before your renewal date.
          </p>

          {reminderState === "done" ? (
            <div className="bg-[var(--teal-bg-pale)] border border-[var(--teal-bg-900)] rounded-lg px-4 py-4 text-sm text-[var(--teal)] text-center">
              You are on the list. We will remind you before your renewal date.
            </div>
          ) : (
            <form onSubmit={handleReminderSubmit} className="space-y-3">
              <div>
                <label htmlFor="reminder-email" className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Email Address
                </label>
                <input
                  id="reminder-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                />
              </div>

              {reminderState === "error" && (
                <p role="alert" className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {reminderError}
                </p>
              )}

              <button
                type="submit"
                disabled={reminderState === "submitting"}
                className="w-full bg-[var(--teal)] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
              >
                {reminderState === "submitting" ? "Saving…" : "Remind Me at Renewal"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
