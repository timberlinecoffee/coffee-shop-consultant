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
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <nav className="bg-white border-b border-grey-light px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/account" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="text-sm text-neutral-500 hover:text-neutral-950 transition-colors">← Account</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-neutral-950">Billing</h1>


        {successParam && (
          <div className="bg-teal/10 border border-teal/20 rounded-xl p-4">
            <p className="text-sm text-teal font-medium">
              Subscription activated! Your plan is now live.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-grey-light p-6">
          <h2 className="font-semibold text-neutral-950 mb-4">Manage subscription</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Update your payment method, change your plan, or cancel your subscription through the Stripe billing portal.
          </p>
          <button
            onClick={openPortal}
            disabled={loading}
            className="text-sm bg-teal text-white px-5 py-2.5 rounded-lg font-medium hover:bg-teal-dark transition-colors disabled:opacity-50"
          >
            {loading ? "Opening portal…" : "Open billing portal →"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-grey-light p-6">
          <h2 className="font-semibold text-neutral-950 mb-4">Need to upgrade?</h2>
          <p className="text-sm text-neutral-500 mb-4">
            View all plans and pricing options.
          </p>
          <Link
            href="/pricing"
            className="inline-block text-sm text-teal font-medium hover:underline"
          >
            See pricing →
          </Link>
        </div>
      </div>

      <footer className="mt-auto border-t border-grey-light px-6 py-5 text-xs text-neutral-500">
        <div className="max-w-3xl mx-auto flex justify-center gap-6">
          <Link href="/terms" className="hover:text-teal transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-teal transition-colors">Privacy</Link>
          <Link href="/subscription-terms" className="hover:text-teal transition-colors">Subscription Terms</Link>
        </div>
      </footer>
    </div>
  );
}
