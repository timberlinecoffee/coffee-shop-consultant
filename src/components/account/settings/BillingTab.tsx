"use client";

// TIM-1911: Billing tab for the Settings shell.
// Plan card + Payment method card + Invoices card (mocked).
// Real invoice wiring lands in TIM-1910b.
//
// Style-guide refs: Cards · Plan/Payment/Invoices; Tables · workspace-table tokens.
// Visual reference: src/app/account/billing/page.tsx (paused card),
//   src/components/ui/card.tsx, src/lib/workspace-table.ts.
// Header chrome: title left / primary action right (matches Financials page).

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@/components/ui/card";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { MOCK_INVOICES } from "./mock-invoices";

type BillingStatus = {
  status: string;
  tier: string | null;
  pausedFromTier: string | null;
  resumeTier: string | null;
  resumePrice: string | null;
};

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function BillingTab() {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null
  );
  const [portalLoading, setPortalLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [cancelPauseLoading, setCancelPauseLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBillingStatus(data as BillingStatus);
      })
      .catch(() => {});
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setActionError(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setPortalLoading(false);
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
        window.location.reload();
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
        window.location.reload();
      } else {
        setActionError(data.error ?? "Something went wrong. Please try again.");
      }
    } finally {
      setCancelPauseLoading(false);
    }
  }

  const isPaused = billingStatus?.status === "paused";

  return (
    <div className="space-y-6">
      {/* Header chrome — title left, primary action right (matches Financials page) */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">Billing</h2>
        <button
          onClick={openPortal}
          disabled={portalLoading}
          className="text-sm font-medium bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {portalLoading ? "Opening…" : "Manage in portal"}
        </button>
      </div>

      {/* Plan card — paused/active states from billing/page.tsx */}
      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          {billingStatus?.tier && (
            <CardAction>
              <span className="text-xs text-[var(--muted-foreground)] capitalize">
                {billingStatus.tier}
              </span>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {isPaused ? (
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ stroke: "var(--warning-dark, #b45309)" }}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Your plan is paused.
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    You&apos;re in read-only mode. Your data is safe.
                    {billingStatus?.resumeTier && (
                      <>
                        {" "}
                        You were on the{" "}
                        <span className="font-medium capitalize">
                          {billingStatus.resumeTier}
                        </span>{" "}
                        plan.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={resumePlan}
                  disabled={resumeLoading}
                  className="text-sm bg-[var(--teal)] text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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
                  {cancelPauseLoading
                    ? "Cancelling…"
                    : "Cancel pause and end subscription"}
                </button>
              </div>
              {billingStatus?.resumePrice && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Resuming restores your plan right away. Your{" "}
                  {billingStatus.resumePrice}/mo billing resumes on your next
                  billing date.
                </p>
              )}
            </div>
          ) : billingStatus ? (
            <div className="space-y-3 text-sm pt-1">
              <div className="flex justify-between">
                <span className="text-[var(--dark-grey)]">Plan</span>
                <span className="text-[var(--foreground)] capitalize">
                  {billingStatus.tier ?? "Free"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--dark-grey)]">Status</span>
                <span className="text-[var(--foreground)] capitalize">
                  {billingStatus.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="h-12 flex items-center pt-1">
              <span className="text-sm text-[var(--muted-foreground)]">
                Loading…
              </span>
            </div>
          )}
          {actionError && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {actionError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Payment method card */}
      <Card>
        <CardHeader>
          <CardTitle>Payment method</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--dark-grey)] mb-3">
            Update your credit card or billing details in the Stripe portal.
          </p>
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="text-sm font-medium text-[var(--teal)] hover:underline disabled:opacity-50 transition-opacity"
          >
            {portalLoading ? "Opening…" : "Update payment method →"}
          </button>
        </CardContent>
      </Card>

      {/* Invoices card — mocked; real rows via /api/account/invoices in TIM-1910b */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className={`w-full ${TABLE_CELL_TEXT}`}>
            <thead>
              <tr className="border-b border-[var(--border)]">
                {(
                  [
                    { label: "Date", align: "left" },
                    { label: "Description", align: "left" },
                    { label: "Amount", align: "right" },
                    { label: "Status", align: "left" },
                    { label: "Download", align: "right" },
                  ] as const
                ).map(({ label, align }) => (
                  <th
                    key={label}
                    className={`${TABLE_HEADER_TEXT} px-4 py-2 text-[var(--muted-foreground)] text-${align}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_INVOICES.map((inv, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-4 py-3 text-[var(--dark-grey)] whitespace-nowrap">
                    {inv.date}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {inv.description}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--foreground)] whitespace-nowrap">
                    {inv.amount}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={inv.downloadUrl}
                      className="text-[var(--teal)] hover:underline"
                      aria-label={`Download invoice for ${inv.date}`}
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
