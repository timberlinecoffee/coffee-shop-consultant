"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [successParam, setSuccessParam] = useState(false);

  useEffect(() => {
    setSuccessParam(new URLSearchParams(window.location.search).has("success"));
  }, []);

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
          <div className="bg-[var(--teal)]/10 border border-[var(--teal)]/20 rounded-xl p-4">
            <p className="text-sm text-[var(--teal)] font-medium">
              Subscription activated! Your plan is now live.
            </p>
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
