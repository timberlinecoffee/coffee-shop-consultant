"use client";

// TIM-1912: Billing tab — wired to real /api/account/invoices + /api/account/invoices/[id]/download.
// Plan card + Payment method card + Invoices card.
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

type BillingStatus = {
  status: string;
  tier: string | null;
  pausedFromTier: string | null;
  resumeTier: string | null;
  resumePrice: string | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  amount_total_cents: number;
  currency: string;
  description: string;
  invoice_date: string;
  pdf_storage_path: string | null;
};

function capitalize(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtAmount(cents: number, currency: string): string {
  const symbol = currency.toUpperCase() === "CAD" ? "CAD $" : "$";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-[var(--success-bg-2)] text-[var(--success-medium)]",
  refunded: "bg-[var(--warning-bg)] text-[var(--warning-dark,#b45309)]",
  void: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  uncollectible: "bg-red-50 text-red-600",
};

export function BillingTab() {
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [cancelPauseLoading, setCancelPauseLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setBillingStatus(data as BillingStatus); })
      .catch(() => {});

    fetch("/api/account/invoices", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { invoices: [] }))
      .then((data) => setInvoices(data.invoices ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setInvoicesLoading(false));
  }, []);

  async function openPortal() {
    setPortalLoading(true);
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
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[var(--warning-bg)] flex items-center justify-center">
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
                  {billingStatus.resumePrice}/mo billing resumes on your next billing date.
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
              <span className="text-sm text-[var(--muted-foreground)]">Loading…</span>
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

      {/* Invoices card — real data from /api/account/invoices (TIM-1912) */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {invoicesLoading ? (
            <div className="px-4 py-8 text-center">
              <span className="text-sm text-[var(--muted-foreground)]">Loading invoices…</span>
            </div>
          ) : invoices.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                No invoices yet — your first charge will appear here on day 7 of the trial.
              </p>
            </div>
          ) : (
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
                      className={`${TABLE_HEADER_TEXT} px-4 py-2 text-[var(--muted-foreground)] ${align === "right" ? "text-right" : "text-left"}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const statusStyle = STATUS_STYLES[inv.status] ?? "bg-[var(--muted)] text-[var(--muted-foreground)]";
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-3 text-[var(--dark-grey)] whitespace-nowrap">
                        {fmtDate(inv.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-[var(--foreground)]">
                        {inv.description}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--foreground)] whitespace-nowrap">
                        {fmtAmount(inv.amount_total_cents, inv.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>
                          {capitalize(inv.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.pdf_storage_path ? (
                          <a
                            href={`/api/account/invoices/${inv.id}/download`}
                            className="text-[var(--teal)] hover:underline"
                            aria-label={`Download invoice ${inv.invoice_number}`}
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]" title="PDF is being generated">
                            Generating…
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
