"use client";

// TIM-4114 (UX Phase 6): the other end of the wire.
//
// The Financials screen now says where its cost of goods comes from. This is
// the matching statement on the workspace that produces it — so the number is
// legible from BOTH sides, and setting an item to "Popular" stops feeling like
// a note to yourself and starts feeling like something that moves the plan.
//
// Why it is not the "Avg COGS" figure already on the category headers: that one
// is an unweighted mean across a category (see aggregateMargins), which is the
// right per-category read but a different number from the one the plan uses.
// Two numbers both called the average cost of goods, differing by a few points
// with no explanation, is precisely the confusion this phase exists to remove.
// So this is labelled for what it is — the blend, weighted by popularity — and
// it names the screen that consumes it.

import Link from "next/link";
import { Link2 } from "lucide-react";
import { computeMenuBlendedCogsPct } from "@/lib/financial-projection";
import { fmtPct } from "@/lib/formatters";
import type { ExpectedPopularity } from "@/lib/menu-engineering";

export interface MenuBlendedCogsSummaryProps {
  items: ReadonlyArray<{
    price_cents: number;
    cogs_cents: number | null;
    computed_cogs_cents: number;
    expected_popularity: ExpectedPopularity | null;
    archived: boolean;
  }>;
  className?: string;
}

export function MenuBlendedCogsSummary({
  items,
  className,
}: MenuBlendedCogsSummaryProps) {
  const blended = computeMenuBlendedCogsPct(items);
  const pricedCount = items.filter((i) => !i.archived && i.price_cents > 0).length;

  // Nothing priced yet. Saying "0%" would be a confident lie, and an empty
  // band on a brand-new menu is noise — the owner has not done anything wrong
  // by not having priced a drink yet.
  if (blended === null || pricedCount === 0) return null;

  return (
    <div
      className={`rounded-lg border border-[var(--teal-bg-750)] bg-[var(--teal-bg-f0f8)] px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${className ?? ""}`}
    >
      <Link2 className="w-4 h-4 text-[var(--teal)] shrink-0" aria-hidden="true" />
      <p className="text-xs text-[var(--foreground)] leading-snug flex-1 min-w-0">
        <span className="font-semibold">
          Across your menu, making a sale costs you {fmtPct(blended / 100)} of what you
          charge for it
        </span>
        <span className="text-[var(--muted-foreground)]">
          {" "}
          — blended across {pricedCount} priced item{pricedCount === 1 ? "" : "s"},
          weighted by how popular you expect each one to be. This is the figure your
          financial plan runs on.
        </span>
      </p>
      <Link
        href="/workspace/financials"
        className="text-xs font-semibold text-[var(--teal)] underline underline-offset-4 hover:no-underline shrink-0"
      >
        See it in Financials
      </Link>
    </div>
  );
}
