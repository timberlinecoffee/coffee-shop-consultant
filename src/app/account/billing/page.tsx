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
    <div className="min-h-screen bg-[#faf9f7]">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/account" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors">← Account</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Billing</h1>

        {successParam && (
          <div className="bg-[#155e63]/10 border border-[#155e63]/20 rounded-xl p-4">
            <p className="text-sm text-[#155e63] font-medium">
              Subscription activated! Your plan is now live.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-[#efefef] p-6">
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Manage subscription</h2>
          <p className="text-sm text-[#afafaf] mb-4">
            Update your payment method, change your plan, or cancel your subscription through the Stripe billing portal.
          </p>
          <button
            onClick={openPortal}
            disabled={loading}
            className="text-sm bg-[#155e63] text-white px-5 py-2.5 rounded-lg font-medium hover:bg-[#0e4448] transition-colors disabled:opacity-50"
          >
            {loading ? "Opening portal…" : "Open billing portal →"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-[#efefef] p-6">
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Need to upgrade?</h2>
          <p className="text-sm text-[#afafaf] mb-4">
            View all plans and pricing options.
          </p>
          <Link
            href="/pricing"
            className="inline-block text-sm text-[#155e63] font-medium hover:underline"
          >
            See pricing →
          </Link>
        </div>
      </div>
    </div>
  );
}
