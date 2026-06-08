// TIM-2449: derive a WorkspaceProfile from the live plan data.
//
// The verdict engine works off the six cohort axes (plan §5). This module
// translates the raw plan rows into those axes plus the user value for each
// metric the catalog tracks. Pure function — no I/O — so the verdict engine
// stays deterministic and unit-testable.
//
// Inferences:
//   model        — onboarding_data.shop_type[] first, then concept text
//   sqft_bucket  — signed/primary location sq_ft (cents-free; lease.sq_ft)
//   geo_tier     — null in Phase 1 (city ↔ tier lookup is Phase 2 spec work)
//   age_bucket   — pre-open (default) — Groundwork users are pre-open today
//   auv_tier     — Y1 revenue from the financial model
//   concept      — concept content text matching
//
// Each axis is allowed to be null — the cohort matcher and best-practice
// recommender both handle missing axes correctly.

import type { PlanState } from "../business-plan/plan-state.ts";
import { computeMenuBlendedCogsPct } from "../financial-projection.ts";
import type {
  CohortAgeBucket,
  CohortAuvTier,
  CohortConcept,
  CohortGeoTier,
  CohortModel,
  CohortSqftBucket,
  WorkspaceProfile,
} from "./types";

export interface DeriveProfileInputs {
  planState: PlanState;
  // The latest concept doc content (already-parsed JSON, as stored).
  conceptContent: Record<string, unknown> | null;
  // The user's onboarding_data row, used for the structured shop_type signal.
  onboardingData: Record<string, unknown> | null;
  // The same menu rows the audit engine reads — used to populate menu_pricing
  // user values (blended COGS, avg drink price).
  menuRows: ReadonlyArray<{
    price_cents: number | null;
    expected_mix_pct?: number | null;
    archived?: boolean | null;
    computed_cogs_cents?: number | null;
    cogs_cents?: number | null;
  }>;
}

export function deriveWorkspaceProfile(input: DeriveProfileInputs): WorkspaceProfile {
  const { planState } = input;
  const axes = {
    model: deriveModel(input),
    sqft_bucket: deriveSqftBucket(planState.lease.sq_ft),
    geo_tier: deriveGeoTier(),
    age_bucket: deriveAgeBucket(),
    auv_tier: deriveAuvTier(planState.years[0]?.revenue_cents ?? 0),
    concept: deriveConcept(input.conceptContent),
  };

  const userValues: Record<string, number | null> = {
    // Pillar 1: Revenue & traffic
    auv_usd: centsToUsdOrNull(planState.years[0]?.revenue_cents ?? null),
    avg_ticket_usd: centsToUsdOrNull(planState.revenue.avg_ticket_cents),
    transactions_per_day: planState.revenue.customers_per_day_avg > 0
      ? planState.revenue.customers_per_day_avg
      : null,
    revenue_per_sqft_usd: revenuePerSqft(planState),
    // Pillar 2: COGS
    total_cogs_pct: planState.cogs.blended_pct > 0 ? planState.cogs.blended_pct : null,
    beverage_cogs_pct: blendedMenuCogs(input.menuRows),
    food_cogs_pct: null,
    waste_pct: null,
    // Pillar 3: Labor
    labor_pct_of_revenue: laborPctOfRevenue(planState),
    sales_per_labor_hour_usd: null,
    turnover_pct_annual: null,
    wage_rate_usd_hour: null,
    // Pillar 4: Real estate & fit-out
    rent_pct_of_revenue: rentPctOfRevenue(planState),
    rent_per_sqft_annual_usd: rentPerSqftAnnual(planState),
    fitout_per_sqft_usd: fitoutPerSqft(planState),
    lease_term_years: null,
    // Pillar 6: Menu & pricing (Phase 0 stub for completeness)
    avg_drink_price_usd: avgDrinkPrice(input.menuRows),
  };

  return { axes, userValues };
}

function centsToUsdOrNull(cents: number | null): number | null {
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return null;
  return cents / 100;
}

function revenuePerSqft(planState: PlanState): number | null {
  const rev = planState.years[0]?.revenue_cents ?? 0;
  const sqft = planState.lease.sq_ft ?? null;
  if (rev <= 0 || !sqft || sqft <= 0) return null;
  return rev / 100 / sqft;
}

function laborPctOfRevenue(planState: PlanState): number | null {
  const rev = planState.years[0]?.revenue_cents ?? 0;
  if (rev <= 0) return null;
  const annualLaborCents = planState.labor.monthly_loaded_cost_cents * 12;
  if (annualLaborCents <= 0) return null;
  return (annualLaborCents / rev) * 100;
}

function rentPctOfRevenue(planState: PlanState): number | null {
  const rev = planState.years[0]?.revenue_cents ?? 0;
  if (rev <= 0) return null;
  const annualRentCents = planState.lease.monthly_rent_cents * 12;
  if (annualRentCents <= 0) return null;
  return (annualRentCents / rev) * 100;
}

function rentPerSqftAnnual(planState: PlanState): number | null {
  const sqft = planState.lease.sq_ft ?? null;
  if (!sqft || sqft <= 0) return null;
  const annualRentCents = planState.lease.monthly_rent_cents * 12;
  if (annualRentCents <= 0) return null;
  return annualRentCents / 100 / sqft;
}

function fitoutPerSqft(planState: PlanState): number | null {
  const sqft = planState.lease.sq_ft ?? null;
  if (!sqft || sqft <= 0) return null;
  const buildout = planState.use_of_funds.lines.find((l) => l.key === "buildout_cents");
  const buildoutCents = buildout?.amount_cents ?? 0;
  if (buildoutCents <= 0) return null;
  return buildoutCents / 100 / sqft;
}

function blendedMenuCogs(rows: DeriveProfileInputs["menuRows"]): number | null {
  // Reuse the canonical helper for consistency with the audit and BP layers.
  // computeMenuBlendedCogsPct accepts the same row shape we pass into the
  // companion benchmark route.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pct = computeMenuBlendedCogsPct(rows as unknown as any[]);
  return typeof pct === "number" && Number.isFinite(pct) && pct > 0 ? pct : null;
}

function avgDrinkPrice(rows: DeriveProfileInputs["menuRows"]): number | null {
  const active = rows.filter(
    (r) => !r.archived && typeof r.price_cents === "number" && (r.price_cents ?? 0) > 0,
  );
  if (active.length === 0) return null;
  const sum = active.reduce((acc, r) => acc + (r.price_cents ?? 0), 0);
  return sum / active.length / 100;
}

// ── axis derivation ──────────────────────────────────────────────────────────

const SHOP_TYPE_TO_MODEL: Record<string, CohortModel> = {
  "Drive-through": "drive_thru",
  "Roastery cafe": "cafe", // roastery+cafe rolls into cafe cohort for now
  "Mobile cart or kiosk": "kiosk",
  "Mobile cart or pop-up": "mobile_cart",
  "Espresso bar (drinks only)": "kiosk",
  "Full cafe with food": "cafe",
};

export function deriveModel(input: DeriveProfileInputs): CohortModel | null {
  const shopTypes = readShopTypes(input.onboardingData);
  if (shopTypes.length > 0) {
    // Drive-thru is highest-priority signal.
    if (shopTypes.includes("Drive-through")) return "drive_thru";
    for (const t of shopTypes) {
      if (SHOP_TYPE_TO_MODEL[t]) return SHOP_TYPE_TO_MODEL[t];
    }
  }
  // Fall back to concept text matching — same heuristics as the financials seed.
  const concept = input.conceptContent ?? {};
  const text = JSON.stringify(concept).toLowerCase();
  if (text.includes("drive-thru") || text.includes("drive thru") || text.includes("drive through")) {
    return "drive_thru";
  }
  if (text.includes("mobile") || text.includes("pop-up") || text.includes("pop up") || text.includes("cart")) {
    return "mobile_cart";
  }
  if (text.includes("kiosk") || text.includes("espresso bar")) return "kiosk";
  if (text.includes("cafe") || text.includes("café") || text.includes("coffee shop")) return "cafe";
  return null;
}

function readShopTypes(onboardingData: Record<string, unknown> | null): string[] {
  if (!onboardingData) return [];
  const raw = onboardingData.shop_type;
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") return [raw];
  return [];
}

export function deriveSqftBucket(sqft: number | null): CohortSqftBucket | null {
  if (!sqft || sqft <= 0) return null;
  if (sqft < 500) return "lt_500";
  if (sqft < 1500) return "500_1500";
  if (sqft < 3000) return "1500_3000";
  return "gt_3000";
}

export function deriveGeoTier(): CohortGeoTier | null {
  // Phase 1: no metro-tier lookup yet. The dashboard UX spec (Phase 2) calls
  // out an "Adjust cohort" affordance so users can opt into a tier when the
  // city lookup lands. Leaving this null is the documented Phase 1 behavior.
  return null;
}

export function deriveAgeBucket(): CohortAgeBucket | null {
  // Phase 1: Groundwork users are pre-open by construction. When platform-
  // shared data lands (Phase 5) we'll thread in opened_at from the workspace.
  return "pre_open";
}

export function deriveAuvTier(y1RevenueCents: number): CohortAuvTier | null {
  if (!Number.isFinite(y1RevenueCents) || y1RevenueCents <= 0) return null;
  const usd = y1RevenueCents / 100;
  if (usd < 350_000) return "low";
  if (usd < 700_000) return "mid";
  if (usd < 1_100_000) return "high";
  return "top_decile";
}

export function deriveConcept(conceptContent: Record<string, unknown> | null): CohortConcept | null {
  if (!conceptContent) return null;
  const text = JSON.stringify(conceptContent).toLowerCase();
  if (text.includes("third wave") || text.includes("third-wave") || text.includes("specialty")) {
    return "third_wave_specialty";
  }
  if (text.includes("grab and go") || text.includes("grab-and-go") || text.includes("grab & go")) {
    return "grab_and_go";
  }
  if (text.includes("roastery")) return "roastery_cafe";
  if (text.includes("food program") || text.includes("kitchen") || text.includes("bakery")) {
    return "cafe_food_program";
  }
  if (text.includes("neighborhood")) return "neighborhood_cafe";
  return null;
}
