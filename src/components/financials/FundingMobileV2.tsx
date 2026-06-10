"use client";

// TIM-2596 (Phase 5.8): v2 Funding/Loans mobile surface — card-per-source layout.
// Renders at <md viewports when ui_revamp_v2 is on; v1 CategorySection keeps
// rendering at md+. Tap a card → slide-up detail sheet with the full source's
// fields (read-only; complex editing stays on desktop).

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { FundingSourceLine, FundingKind } from "@/lib/financial-projection";
import { fmt, loanMonthlyPaymentCents } from "@/lib/financial-projection";
import { fmtPct } from "@/lib/formatters";

const KIND_LABELS: Record<FundingKind, string> = {
  founder_equity: "Founder Equity",
  loan: "Loans",
  investor_equity: "Investor Equity",
  grant: "Grants / Other",
};

const KIND_BADGE: Record<FundingKind, string> = {
  founder_equity: "bg-[var(--teal-bg-palest)] text-[var(--teal)] border-[var(--teal-tint)]",
  loan: "bg-amber-50 text-amber-700 border-amber-200",
  investor_equity: "bg-blue-50 text-blue-700 border-blue-200",
  grant: "bg-purple-50 text-purple-700 border-purple-200",
};

const KIND_ORDER: FundingKind[] = ["founder_equity", "loan", "investor_equity", "grant"];

interface Props {
  sources: FundingSourceLine[];
  currencyCode: string;
}

export function FundingMobileV2({ sources, currencyCode }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openSource = openId ? sources.find((s) => s.id === openId) ?? null : null;

  const total = sources.reduce((s, l) => s + l.amount_cents, 0);

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: sources.filter((s) => s.kind === kind),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Total Funding
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {fmt(total, currencyCode)}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {sources.length} source{sources.length === 1 ? "" : "s"}
        </p>
      </div>

      {grouped.map((group) => (
        <section key={group.kind} aria-labelledby={`funding-sec-${group.kind}`}>
          <h2
            id={`funding-sec-${group.kind}`}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {KIND_LABELS[group.kind]}
          </h2>
          <ul className="space-y-2">
            {group.items.map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(source.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${source.label}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {source.label}
                      </p>
                      <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                        {fmt(source.amount_cents, currencyCode)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[source.kind]}`}
                      >
                        {KIND_LABELS[source.kind]}
                      </span>
                      {source.kind === "loan" && source.annual_rate_pct != null && (
                        <span className="ml-1.5">
                          {fmtPct(source.annual_rate_pct / 100)} APR ·{" "}
                          {source.term_months ?? 0} mo
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No funding sources yet.</p>
        </div>
      )}

      {openSource && (
        <FundingDetailSheet
          source={openSource}
          currencyCode={currencyCode}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function FundingDetailSheet({
  source,
  currencyCode,
  onClose,
}: {
  source: FundingSourceLine;
  currencyCode: string;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Type", value: KIND_LABELS[source.kind] },
    { label: "Amount", value: fmt(source.amount_cents, currencyCode) },
  ];

  if (source.kind === "loan") {
    rows.push({ label: "Term", value: source.term_months != null ? `${source.term_months} months` : null });
    rows.push({
      label: "Annual Rate",
      value: source.annual_rate_pct != null ? fmtPct(source.annual_rate_pct / 100) : null,
    });
    if (source.amount_cents > 0 && source.annual_rate_pct != null && source.term_months != null) {
      const pmt = loanMonthlyPaymentCents(source.amount_cents, source.annual_rate_pct, source.term_months);
      rows.push({ label: "Monthly Payment", value: fmt(pmt, currencyCode) });
    }
    if (source.draw_month != null) {
      rows.push({ label: "Draw Month", value: `Month ${source.draw_month}` });
    }
  }

  if (source.kind === "investor_equity" && source.pct_ownership != null) {
    rows.push({ label: "Ownership", value: fmtPct(source.pct_ownership / 100) });
  }

  if (source.kind === "grant" && source.notes) {
    rows.push({ label: "Notes", value: source.notes });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="funding-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="funding-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {source.label}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {KIND_LABELS[source.kind]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <dl className="divide-y divide-[var(--border)] px-5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {row.label}
              </dt>
              <dd className="max-w-[60%] text-right text-sm text-[var(--foreground)]">
                {row.value && row.value.trim() ? (
                  row.value
                ) : (
                  <span className="text-[var(--muted-foreground)]">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            Edit funding sources in the full desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
