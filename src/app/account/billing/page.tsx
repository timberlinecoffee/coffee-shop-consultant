"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { COPILOT_NAME } from "@/lib/copilot/branding";

type SyncState =
  | { phase: "idle" }
  | { phase: "syncing" }
  | { phase: "done"; tier: string; status: string; creditsAllocated: boolean }
  | { phase: "no_match" }
  | { phase: "error"; message: string };

type BillingStatus = {
  status: string;
  tier: string | null;
  pausedFromTier: string | null;
  resumeTier: string | null;
  resumePrice: string | null;
};

function readSuccessParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("success");
}

function readPausedParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("paused");
}

function readCancelledParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("cancelled");
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [cancelPauseLoading, setCancelPauseLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successParam] = useState<boolean>(readSuccessParam);
  const [pausedParam] = useState<boolean>(readPausedParam);
  const [cancelledParam] = useState<boolean>(readCancelledParam);
  const [sync, setSync] = useState<SyncState>(successParam ? { phase: "syncing" } : { phase: "idle" });
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const syncStartedRef = useRef(false);

  useEffect(() => {
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setBillingStatus(data as BillingStatus); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!successParam || syncStartedRef.current) return;
    syncStartedRef.current = true;
    fetch("/api/stripe/sync-subscription", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSync({ phase: "error", message: data.error ?? "Sync failed" });
          return;
        }
        if (data.synced) {
          setSync({
            phase: "done",
            tier: data.tier,
            status: data.status,
            creditsAllocated: !!data.creditsAllocated,
          });
        } else if (data.reason === "no_stripe_customer" || data.reason === "no_subscription_on_customer") {
          setSync({ phase: "no_match" });
        } else {
          setSync({ phase: "error", message: data.reason ?? "Sync failed" });
        }
      })
      .catch((err) => {
        setSync({ phase: "error", message: String(err) });
      });
  }, [successParam]);

  async function openPortal() {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setActionError(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function resumePlan() {
    setResumeLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/billing/resume", { method: "POST" });
      const data = await res.json();
      if (data.redirect) {
        window.location.href = data.redirect;
      } else if (data.ok) {
        window.location.href = "/account/billing?success=1";
      } else {
        setActionError(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setResumeLoading(false);
    }
  }

  async function cancelPause() {
    setCancelPauseLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        window.location.href = "/account/billing?cancelled=1";
      } else {
        setActionError(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setCancelPauseLoading(false);
    }
  }

  const isPaused = billingStatus?.status === "paused";

  return (
    <div className="bg-[var(--background)] flex flex-col min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6 flex-1">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Billing</h1>

        {/* Paused-state card — shown whenever the subscription is paused */}
        {isPaused && !successParam && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ stroke: "var(--warning-dark)" }} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[var(--foreground)] mb-1">Your plan is paused.</h2>
                <p className="text-sm text-[var(--muted-foreground)] mb-5">
                  You&#39;re in read-only mode. Your data is safe.
                  {billingStatus?.resumeTier && (
                    <> You were on the <span className="font-medium capitalize">{billingStatus.resumeTier}</span> plan.</>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={resumePlan}
                    disabled={resumeLoading}
                    className="text-sm bg-[var(--teal)] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
                  >
                    {resumeLoading
                      ? "Resuming…"
                      : billingStatus?.resumeTier && billingStatus?.resumePrice
                        ? `Resume ${capitalize(billingStatus.resumeTier)} at ${billingStatus.resumePrice}/mo`
                        : "Resume my plan"}
                  </button>
                  <button
                    onClick={cancelPause}
                    disabled={cancelPauseLoading}
                    className="text-sm text-[var(--dark-grey)] hover:text-red-600 transition-colors disabled:opacity-50"
                  >
                    {cancelPauseLoading ? "Cancelling…" : "Cancel pause and end subscription"}
                  </button>
                </div>
                {billingStatus?.resumePrice && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-3">
                    Resuming restores your plan right away. You won&#39;t be charged today. Your {billingStatus.resumePrice}/mo billing resumes on your next billing date.
                  </p>
                )}
                {actionError && (
                  <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    {actionError}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {pausedParam && !isPaused && (
          <div className="bg-[var(--teal)]/10 border border-[var(--teal)]/20 rounded-xl p-4">
            <p className="text-sm text-[var(--teal)] font-medium">
              Your subscription is now paused at $2.99/month. Resume any time from this page.
            </p>
          </div>
        )}

        {cancelledParam && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-800 font-medium">
              Cancellation confirmed. Your access continues until the end of your current billing period.
            </p>
          </div>
        )}

        {successParam && (
          <div className="bg-[var(--teal)]/10 border border-[var(--teal)]/20 rounded-xl p-4 space-y-1">
            <p className="text-sm text-[var(--teal)] font-medium">
              Subscription activated. Your plan is now live.
            </p>
            {sync.phase === "syncing" && (
              <p className="text-xs text-[var(--dark-grey)]">Refreshing your plan from Stripe…</p>
            )}
            {sync.phase === "done" && (
              <p className="text-xs text-[var(--dark-grey)]">
                Plan: <span className="font-medium capitalize">{sync.tier}</span> ·{" "}
                <span className="capitalize">{sync.status}</span>
                {sync.creditsAllocated && ` · ${COPILOT_NAME} credits refreshed.`}
              </p>
            )}
            {sync.phase === "no_match" && (
              <p className="text-xs text-[var(--dark-grey)]">
                We could not find your Stripe subscription yet. Give it a minute, then refresh, or open the billing portal below.
              </p>
            )}
            {sync.phase === "error" && (
              <p className="text-xs text-red-600">
                Sync issue: {sync.message}. Try refreshing the page.
              </p>
            )}
          </div>
        )}

        {!isPaused && (
          <div className="bg-white rounded-xl border border-[var(--border)] p-6">
            <h2 className="font-semibold text-[var(--foreground)] mb-4">Manage Subscription</h2>
            <p className="text-sm text-[var(--dark-grey)] mb-4">
              Update your payment method or change your plan through the Stripe billing portal.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={openPortal}
                disabled={loading}
                className="text-sm bg-[var(--teal)] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
              >
                {loading ? "Opening portal…" : "Open billing portal →"}
              </button>
              <Link
                href="/account/cancel"
                className="text-sm text-[var(--dark-grey)] hover:text-red-600 transition-colors"
              >
                Cancel subscription
              </Link>
            </div>
            {actionError && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {actionError}
              </p>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Need to Upgrade?</h2>
          <p className="text-sm text-[var(--dark-grey)] mb-4">
            View all plans and pricing options.
          </p>
          <Link
            href="/pricing"
            className="inline-block text-sm text-[var(--teal)] font-medium hover:underline"
          >
            See pricing →
          </Link>
        </div>
      </div>

      <footer className="mt-auto border-t border-[var(--border)] px-6 py-5 text-xs text-[var(--dark-grey)]">
        <div className="max-w-3xl mx-auto flex justify-center gap-6">
          <Link href="/terms" className="hover:text-[var(--teal)] transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-[var(--teal)] transition-colors">Privacy</Link>
          <Link href="/subscription-terms" className="hover:text-[var(--teal)] transition-colors">Subscription Terms</Link>
        </div>
      </footer>
    </div>
  );
}
