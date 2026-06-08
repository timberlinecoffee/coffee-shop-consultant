// TIM-1912: CRA place-of-supply tax engine for Alberta-compliant SaaS invoices.
// Ref: CRA digital-economy place-of-supply rules; Numeral 2026 Canada GST/HST rates.

export type TaxResult = {
  /** ISO province code, or null when zero-rated / non-CA. */
  jurisdiction: string | null;
  /** Tax rate in basis points. 500 = 5%, 1300 = 13%, 1500 = 15%, 0 = zero-rated. */
  rateBps: number;
  /**
   * True when gstRegistered=false (small-supplier mode). Tax line is suppressed;
   * invoice shows a small-supplier disclosure note instead.
   */
  taxLineSuppressed: boolean;
};

// CRA place-of-supply rates for digital services / SaaS, 2026.
// QC: 5% GST only in v1 — QST (9.975%) deferred to phase 2.
const PROVINCE_RATE_BPS: Record<string, number> = {
  AB: 500,
  BC: 500,
  MB: 500,
  NT: 500,
  NU: 500,
  SK: 500,
  YT: 500,
  ON: 1300,
  NS: 1500,
  NB: 1500,
  NL: 1500,
  PE: 1500,
  QC: 500, // GST only — QST not implemented (phase 2). See TIM-1912.
};

/**
 * Compute tax for a SaaS invoice line.
 *
 * @param province - ISO 3166-2 province code (e.g. "AB"). Comes from
 *   Stripe customer `address.state`. Null if missing.
 * @param country  - ISO 3166-1 alpha-2 country code (e.g. "CA"). Null if missing.
 * @param gstRegistered - Read from platform_settings.gst_registered.
 * @param subtotalCents - Invoice subtotal in the smallest currency unit (cents).
 */
export function computeTax(opts: {
  province: string | null;
  country: string | null;
  gstRegistered: boolean;
  subtotalCents: number;
}): TaxResult {
  const { province, country, gstRegistered } = opts;

  if (!gstRegistered) {
    return { jurisdiction: null, rateBps: 0, taxLineSuppressed: true };
  }

  // Non-CA customers are zero-rated (no GST/HST line).
  if (country && country.toUpperCase() !== "CA") {
    return { jurisdiction: null, rateBps: 0, taxLineSuppressed: false };
  }

  if (!province) {
    console.warn("[tax] Missing province code on CA customer; treating as zero-rated");
    return { jurisdiction: null, rateBps: 0, taxLineSuppressed: false };
  }

  const prov = province.toUpperCase();

  if (prov === "QC") {
    console.warn("[tax] QC customer: QST not implemented in v1 — applying 5% GST only (phase 2 TODO)");
  }

  const rateBps = PROVINCE_RATE_BPS[prov];
  if (rateBps === undefined) {
    console.warn(`[tax] Unknown province "${province}"; treating as zero-rated`);
    return { jurisdiction: prov, rateBps: 0, taxLineSuppressed: false };
  }

  return { jurisdiction: prov, rateBps, taxLineSuppressed: false };
}

/** Compute tax amount in cents, rounded to nearest cent. */
export function taxAmountCents(subtotalCents: number, rateBps: number): number {
  return Math.round((subtotalCents * rateBps) / 10000);
}

/** Human-readable tax label for a jurisdiction (e.g. "GST (5%)" or "HST (13%)"). */
export function taxLabel(jurisdiction: string | null, rateBps: number): string {
  if (!jurisdiction || rateBps === 0) return "Tax";
  const pct = (rateBps / 100).toFixed(0);
  const isHST = ["ON", "NS", "NB", "NL", "PE"].includes(jurisdiction);
  return `${isHST ? "HST" : "GST"} (${pct}%)`;
}
