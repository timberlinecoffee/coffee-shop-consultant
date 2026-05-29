"use client";

// TIM-1179: Inline recommendation card shown below equipment item name.
// Shows: recommended model + price. If a referral link exists, shows it
// with an affiliate disclosure tag. No emojis per feedback_no_emojis_in_design.

import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
// TIM-1359: FTC 16 CFR Part 255 requires affiliate disclosure in the same visual field.
import { formatCurrency } from "@/lib/financial-projection";
import type { EquipmentRecommendation } from "@/types/referral";

const AFFILIATE_DISCLOSURE =
  "AI Recommendations, Affiliate Disclosure: Some product links are affiliate links, and Groundwork may earn a commission if you purchase through them. This does not influence AI ranking criteria.";

interface Props {
  recommendation: EquipmentRecommendation;
}

export function EquipmentRecommendationCard({ recommendation: rec }: Props) {
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
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={rec.referral_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-0.5 text-[var(--teal)] hover:underline font-medium"
            >
              <ExternalLink size={9} />
              {rec.partner_name ? `Buy from ${rec.partner_name}` : "Shop this model"}
            </a>
            <span className="text-[8px] font-semibold uppercase tracking-wide px-1 py-px rounded bg-slate-100 text-slate-500">
              affiliate link
            </span>
          </div>
          <p className="text-[9px] text-[var(--muted-foreground)] leading-relaxed">
            {AFFILIATE_DISCLOSURE}
          </p>
        </div>
      )}
    </div>
  );
}
