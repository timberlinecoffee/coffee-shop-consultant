"use client";

// TIM-1179: Inline recommendation card shown below equipment item name.
// Shows: recommended model + price. If a referral link exists, shows it
// with an affiliate disclosure tag. No emojis per feedback_no_emojis_in_design.

import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/financial-projection";
import type { EquipmentRecommendation } from "@/types/referral";

const AFFILIATE_DISCLOSURE =
  "We may earn a commission from purchases made via this link. This does not affect our recommendation.";

interface Props {
  recommendation: EquipmentRecommendation;
}

export function EquipmentRecommendationCard({ recommendation: rec }: Props) {
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const priceLabel =
    rec.estimated_price_cents > 0
      ? ` (${formatCurrency(rec.estimated_price_cents / 100)})`
      : "";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1 text-[9px] text-[var(--teal-accent)] hover:text-[var(--teal)] transition-colors mt-0.5"
        aria-label="Show recommendation"
      >
        <ChevronRight size={9} />
        Recommendation
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-[var(--teal-tint)] bg-[var(--teal-tint-500)] px-2 py-1.5 text-[10px] leading-snug">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <span className="text-[var(--muted-foreground)]">Recommended: </span>
          <span className="font-semibold text-[var(--teal)] truncate">
            {rec.recommended_brand} {rec.recommended_model}{priceLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-[var(--neutral-cool-400)] hover:text-[var(--muted-foreground)] transition-colors shrink-0 mt-px"
          aria-label="Hide recommendation"
        >
          <ChevronDown size={9} />
        </button>
      </div>

      {rec.referral_url && (
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <a
            href={rec.referral_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex items-center gap-0.5 text-[var(--teal)] hover:underline font-medium"
          >
            <ExternalLink size={9} />
            {rec.partner_name ? `Buy from ${rec.partner_name}` : "Shop this model"}
          </a>
          <button
            type="button"
            onClick={() => setDisclosureOpen((o) => !o)}
            className="text-[8px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
            aria-expanded={disclosureOpen}
            aria-label="Affiliate link disclosure"
          >
            affiliate link
          </button>
          {disclosureOpen && (
            <p className="w-full text-[9px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
              {AFFILIATE_DISCLOSURE}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
