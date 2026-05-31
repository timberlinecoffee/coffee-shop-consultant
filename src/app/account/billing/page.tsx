"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type SyncState =
  | { phase: "idle" }
  | { phase: "syncing" }
  | { phase: "done"; tier: string; status: string; creditsAllocated: boolean }
  | { phase: "no_match" }
  | { phase: "error"; message: string };

function readSuccessParam(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("success");
}

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [successParam] = useState<boolean>(readSuccessParam);
  const [sync, setSync] = useState<SyncState>(successParam ? { phase: "syncing" } : { phase: "idle" });
  const syncStartedRef = useRef(false);

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
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[var(--background)] flex flex-col min-h-full">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6 flex-1">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Billing</h1>

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
                {sync.creditsAllocated && " · Co-Pilot credits refreshed."}
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

        <div className="bg-white rounded-xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Manage Subscription</h2>
          <p className="text-sm text-[var(--dark-grey)] mb-4">
            Update your payment method, change your plan, or cancel your subscription through the Stripe billing portal.
          </p>
          <button
            onClick={openPortal}
            disabled={loading}
            className="text-sm bg-[var(--teal)] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
          >
            {loading ? "Opening portal…" : "Open billing portal →"}
          </button>
        </div>

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
