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
        className="flex items-center gap-1 text-[9px] text-[#8ab4b7] hover:text-[#155e63] transition-colors mt-0.5"
        aria-label="Show recommendation"
      >
        <ChevronRight size={9} />
        Recommendation
      </button>
    );
  }

  return (
    <div className="mt-1 rounded-md border border-[#cfe0e1] bg-[#f4f9f8] px-2 py-1.5 text-[10px] leading-snug">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <span className="text-[#6b6b6b]">Recommended: </span>
          <span className="font-semibold text-[#155e63] truncate">
            {rec.recommended_brand} {rec.recommended_model}{priceLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-[#c0c0c0] hover:text-[#6b6b6b] transition-colors shrink-0 mt-px"
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
            className="flex items-center gap-0.5 text-[#155e63] hover:underline font-medium"
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
            <p className="w-full text-[9px] text-[#6b6b6b] mt-0.5 leading-relaxed">
              {AFFILIATE_DISCLOSURE}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
