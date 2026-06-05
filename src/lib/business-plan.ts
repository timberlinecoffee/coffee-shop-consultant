// TIM-1037: Business Plan Generator v1 — types, section keys, assemblers.
// TIM-1498: Two-level taxonomy (parent groups + subsections) per YYC Coffee
// School reference outline. Group keys are stable; subsection keys are stored
// in `business_plan_sections.section_key` and used by the AI generator route.

import { normalizeConceptV2 } from "@/lib/concept";
import { normalizeMarketing } from "@/lib/marketing";
import { normalizeMonthlyProjections, computeMonthlySlices, totalCapexCents, type EquipmentSummary } from "@/lib/financial-projection";
import { formatCurrencyAmount } from "@/lib/currency";

// ── Group keys (parent rows in the two-level nav) ─────────────────────────────

export type BusinessPlanGroupKey =
  | "opportunity"
  | "execution"
  | "company"
  | "financial-plan"
  | "appendix";

export interface BusinessPlanGroupMeta {
  key: BusinessPlanGroupKey;
  title: string;
}

// Display order is the array order.
export const BUSINESS_PLAN_GROUPS: BusinessPlanGroupMeta[] = [
  { key: "opportunity",    title: "Opportunity" },
  { key: "execution",      title: "Execution" },
  { key: "company",        title: "Company" },
  { key: "financial-plan", title: "Financial Plan" },
  { key: "appendix",       title: "Appendix" },
];

// ── Section keys ─────────────────────────────────────────────────────────────

export type BusinessPlanSectionKey =
  | "executive-summary"
  | "opportunity-problem-solution"
  | "opportunity-target-market"
  | "opportunity-competition"
  // TIM-2341: dedicated Risks section. Investor critique on TIM-2315 flagged
  // risks "buried in Statements paragraph"; a lender expects them stand-alone.
  | "opportunity-risks"
  | "execution-marketing-sales"
  | "execution-operations"
  | "execution-milestones-metrics"
  | "company-overview"
  | "company-team"
  | "financial-plan-forecast"
  // TIM-2341: lender-ready default sections. Each computes from plan_state's
  // lender_metrics so narrative + tables read the same numbers. Investor
  // critique on TIM-2315: "missing financial concepts that any lender expects".
  | "financial-plan-unit-economics"
  | "financial-plan-break-even"
  | "financial-plan-sensitivity"
  | "financial-plan-financing"
  | "financial-plan-dscr"
  | "financial-plan-capex-schedule"
  | "financial-plan-depreciation"
  | "financial-plan-working-capital"
  | "financial-plan-statements"
  | "appendix-monthly-statements";

export interface BusinessPlanSectionMeta {
  key: BusinessPlanSectionKey;
  title: string;
  // null = top-level (no parent group). Executive Summary is the only such row.
  groupKey: BusinessPlanGroupKey | null;
  defaultVisible: boolean;
  sourceLabel: string;
}

// Display order is the array order; ordering within a group is implicit.
export const BUSINESS_PLAN_SECTIONS: BusinessPlanSectionMeta[] = [
  { key: "executive-summary",              title: "Executive Summary",      groupKey: null,             defaultVisible: true,  sourceLabel: "AI-generated from your plan" },

  { key: "opportunity-problem-solution",   title: "Problem & Solution",     groupKey: "opportunity",    defaultVisible: true,  sourceLabel: "AI-generated from your plan" },
  { key: "opportunity-target-market",      title: "Target Market",          groupKey: "opportunity",    defaultVisible: true,  sourceLabel: "Concept workspace" },
  { key: "opportunity-competition",        title: "Competition",            groupKey: "opportunity",    defaultVisible: true,  sourceLabel: "AI-generated from your plan" },
  // TIM-2341: dedicated Risks section.
  { key: "opportunity-risks",              title: "Risks",                  groupKey: "opportunity",    defaultVisible: true,  sourceLabel: "AI-generated from your plan" },

  { key: "execution-marketing-sales",      title: "Marketing & Sales",      groupKey: "execution",      defaultVisible: true,  sourceLabel: "Menu & Pricing + Marketing workspaces" },
  { key: "execution-operations",           title: "Operations",             groupKey: "execution",      defaultVisible: true,  sourceLabel: "Location & Equipment workspaces" },
  { key: "execution-milestones-metrics",   title: "Milestones & Metrics",   groupKey: "execution",      defaultVisible: true,  sourceLabel: "Launch Plan workspace" },

  { key: "company-overview",               title: "Overview",               groupKey: "company",        defaultVisible: true,  sourceLabel: "Concept workspace" },
  { key: "company-team",                   title: "Team",                   groupKey: "company",        defaultVisible: true,  sourceLabel: "Hiring workspace" },

  // TIM-1496 owns Financial Plan subsection content/structure. Stubbed here so
  // the taxonomy is complete and the UI/PDF render the group with placeholder
  // subsections that route handlers can fill in.
  { key: "financial-plan-forecast",          title: "Forecast",                  groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Financials workspace" },
  // TIM-2341: unit economics buildup is visible ABOVE the P&L (per investor
  // critique on TIM-2315). Order places it right after Forecast.
  { key: "financial-plan-unit-economics",    title: "Unit Economics",            groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your assumptions" },
  { key: "financial-plan-break-even",        title: "Break-even Analysis",       groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your assumptions" },
  { key: "financial-plan-sensitivity",       title: "Sensitivity Analysis",      groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your assumptions" },
  { key: "financial-plan-financing",         title: "Financing",                 groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Your inputs" },
  { key: "financial-plan-dscr",              title: "DSCR & Debt Service",       groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your loan terms" },
  { key: "financial-plan-capex-schedule",    title: "CapEx Schedule",            groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Equipment workspace" },
  { key: "financial-plan-depreciation",      title: "Depreciation Schedule",     groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your CapEx" },
  { key: "financial-plan-working-capital",   title: "Working Capital",           groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Computed from your assumptions" },
  { key: "financial-plan-statements",        title: "Statements",                groupKey: "financial-plan", defaultVisible: true,  sourceLabel: "Financials workspace" },

  { key: "appendix-monthly-statements",    title: "Monthly Statements",     groupKey: "appendix",       defaultVisible: true,  sourceLabel: "Financials workspace" },
];

// Convenience: subsections grouped by their parent group, in display order.
export function getSectionsByGroup(): Array<{ group: BusinessPlanGroupMeta; sections: BusinessPlanSectionMeta[] }> {
  return BUSINESS_PLAN_GROUPS.map((group) => ({
    group,
    sections: BUSINESS_PLAN_SECTIONS.filter((s) => s.groupKey === group.key),
  }));
}

export function getTopLevelSections(): BusinessPlanSectionMeta[] {
  return BUSINESS_PLAN_SECTIONS.filter((s) => s.groupKey === null);
}

// ── Assembled section data ────────────────────────────────────────────────────

export interface BusinessPlanSectionData {
  key: BusinessPlanSectionKey;
  title: string;
  sourceLabel: string;
  autoContent: string;       // assembled from source data
  userContent: string | null; // user override, null = show auto
  isVisible: boolean;
}

// ── Data-loading types (row shapes from Supabase) ─────────────────────────────

export interface BpLocationCandidate {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  sq_ft: number | null;
  asking_rent_cents: number | null;
  status: string;
  notes: string | null;
}

export interface BpEquipmentItem {
  id: string;
  name: string;
  cost_usd: number | null;
  category: string | null;
  notes: string | null;
}

export interface BpMenuItem {
  id: string;
  name: string;
  // TIM-1140: category is now a per-plan editable row; the view exposes the
  // joined name as `category_name`.
  category_name: string | null;
  price_cents: number | null;
}

export interface BpLaunchItem {
  id: string;
  milestone: string;
  target_date: string | null;
  status: string;
}

export interface BpHiringRole {
  id: string;
  role_title: string;
  headcount: number;
  start_date: string | null;
  monthly_cost_cents: number | null;
  status: string;
}

// TIM-1417: Marketing inputs come from the planning document
// (workspace_documents.workspace_key='marketing'). The business plan renders
// the story sections and selected channels, not the deprecated
// marketing_brand pillar shape.
export interface BpMarketingPlanning {
  overview_narrative: string;
  founder_story: string;
  differentiator: string;
  target_customer: string;
  channels: string[];
}

export function toBpMarketingPlanning(content: unknown): BpMarketingPlanning | null {
  const doc = normalizeMarketing(content);
  const channels = doc.channels.selected.map((c) => c.name).filter(Boolean);
  if (
    !doc.overview.narrative &&
    !doc.story.founder_story &&
    !doc.story.differentiator &&
    !doc.story.target_customer &&
    channels.length === 0
  ) {
    return null;
  }
  return {
    overview_narrative: doc.overview.narrative,
    founder_story: doc.story.founder_story,
    differentiator: doc.story.differentiator,
    target_customer: doc.story.target_customer,
    channels,
  };
}

// ── Auto-content assemblers ───────────────────────────────────────────────────

function centsToUsd(cents: number, currencyCode = "USD"): string {
  return formatCurrencyAmount(cents / 100, currencyCode, { compact: false });
}

export function assembleCompanyConcept(conceptContent: unknown): string {
  const doc = normalizeConceptV2(conceptContent);
  const lines: string[] = [];

  const id = doc.components.shop_identity?.content;
  if (id) lines.push(`Shop: ${id}`);

  const vision = doc.components.vision?.content;
  if (vision) lines.push(`\nVision\n${vision}`);

  const offering = doc.components.offering?.content;
  if (offering) lines.push(`\nOffering\n${offering}`);

  const differentiation = doc.components.differentiation?.content;
  if (differentiation) lines.push(`\nDifferentiation\n${differentiation}`);

  const brandVoice = doc.components.brand_voice?.content;
  if (brandVoice) lines.push(`\nBrand Voice\n${brandVoice}`);

  if (doc.personas && doc.personas.length > 0) {
    const personaNames = doc.personas.map((p) => p.name).filter(Boolean);
    if (personaNames.length > 0) {
      lines.push(`\nKey Customer Personas: ${personaNames.join(", ")}`);
    }
  }

  return lines.join("\n").trim() || "Add your concept details in the Concept workspace to populate this section.";
}

// TIM-1498: Target Market is the Concept workspace's target-customer narrative
// plus personas. (Competition lives in its own AI-generated subsection now.)
export function assembleTargetMarket(conceptContent: unknown): string {
  const doc = normalizeConceptV2(conceptContent);
  const lines: string[] = [];

  const targetCustomer = doc.components.target_customer?.content;
  if (targetCustomer) lines.push(`Target Market\n${targetCustomer}`);

  if (doc.personas && doc.personas.length > 0) {
    lines.push(`\nCustomer Profiles`);
    for (const p of doc.personas) {
      const tags: string[] = [];
      if (p.ageRange) tags.push(p.ageRange);
      if (p.incomeRange) tags.push(p.incomeRange);
      if (p.visitFrequency) tags.push(`${p.visitFrequency} visits`);
      if (p.spendPerVisit) tags.push(`${p.spendPerVisit}/visit`);
      const desc = p.dailyContext ?? p.notes ?? "";
      lines.push(`- ${p.name || "Persona"}${tags.length ? ` (${tags.join(", ")})` : ""}${desc ? `: ${desc}` : ""}`);
    }
  }

  const location = doc.components.location?.content;
  if (location) lines.push(`\nMarket Area\n${location}`);

  return lines.join("\n").trim() || "Add customer personas and market details in the Concept workspace to populate this section.";
}

export function assembleLocationSection(candidates: BpLocationCandidate[], currencyCode = "USD"): string {
  if (!candidates || candidates.length === 0) {
    return "Add location candidates in the Location & Lease workspace to populate this section.";
  }

  const chosen = candidates.find((c) => c.status === "chosen") ?? candidates[0];
  const lines: string[] = [];

  if (chosen) {
    lines.push(`Chosen Location: ${chosen.name}`);
    if (chosen.address) lines.push(`Address: ${chosen.address}`);
    if (chosen.neighborhood) lines.push(`Neighborhood: ${chosen.neighborhood}`);
    if (chosen.sq_ft) lines.push(`Size: ${chosen.sq_ft.toLocaleString()} sq ft`);
    if (chosen.asking_rent_cents) lines.push(`Rent: ${centsToUsd(chosen.asking_rent_cents, currencyCode)}/month`);
    if (chosen.notes) lines.push(`\nNotes\n${chosen.notes}`);
  }

  const others = candidates.filter((c) => c !== chosen);
  if (others.length > 0) {
    lines.push(`\nOther Sites Evaluated`);
    for (const c of others) {
      const detail = [c.address, c.neighborhood, c.sq_ft ? `${c.sq_ft.toLocaleString()} sq ft` : null]
        .filter(Boolean).join(", ");
      lines.push(`- ${c.name}${detail ? ` — ${detail}` : ""} (${c.status})`);
    }
  }

  return lines.join("\n").trim();
}

export function assembleBuildoutEquipment(
  equipment: BpEquipmentItem[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  financialModel: any,
  currencyCode = "USD",
): string {
  const lines: string[] = [];

  if (equipment && equipment.length > 0) {
    const totalCost = equipment.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);
    lines.push(`Equipment (${equipment.length} items, total ${formatCurrencyAmount(totalCost, currencyCode, { compact: false })})`);

    const major = equipment.filter((e) => e.category === "major");
    const minor = equipment.filter((e) => e.category === "minor");

    if (major.length > 0) {
      lines.push(`\nMajor Equipment`);
      for (const e of major.slice(0, 10)) {
        lines.push(`- ${e.name}${e.cost_usd ? ` — $${e.cost_usd.toLocaleString()}` : ""}`);
      }
      if (major.length > 10) lines.push(`  … and ${major.length - 10} more`);
    }

    if (minor.length > 0) {
      lines.push(`\nMinor Equipment`);
      for (const e of minor.slice(0, 8)) {
        lines.push(`- ${e.name}${e.cost_usd ? ` — $${e.cost_usd.toLocaleString()}` : ""}`);
      }
      if (minor.length > 8) lines.push(`  … and ${minor.length - 8} more`);
    }
  } else {
    lines.push("Add equipment in the Equipment & Supplies workspace to populate this section.");
  }

  // Build-out budget from financial model startup costs
  if (financialModel?.startup_costs) {
    const sc = financialModel.startup_costs as Record<string, unknown>;
    const buildOutCents = typeof sc.build_out_cents === "number" ? sc.build_out_cents : 0;
    const licensesCents = typeof sc.licenses_cents === "number" ? sc.licenses_cents : 0;
    const depositsCents = typeof sc.deposits_cents === "number" ? sc.deposits_cents : 0;
    if (buildOutCents || licensesCents || depositsCents) {
      lines.push(`\nBuild-out Budget`);
      if (buildOutCents) lines.push(`- Build-out: ${centsToUsd(buildOutCents, currencyCode)}`);
      if (licensesCents) lines.push(`- Licenses & permits: ${centsToUsd(licensesCents, currencyCode)}`);
      if (depositsCents) lines.push(`- Deposits: ${centsToUsd(depositsCents, currencyCode)}`);
    }
  }

  return lines.join("\n").trim();
}

export function assembleMenuPricing(menuItems: BpMenuItem[], currencyCode = "USD"): string {
  if (!menuItems || menuItems.length === 0) {
    return "Add menu items in the Menu & Pricing workspace to populate this section.";
  }

  const byCategory: Record<string, BpMenuItem[]> = {};
  for (const item of menuItems) {
    const cat = item.category_name ?? "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  const lines: string[] = [`Menu (${menuItems.length} items)`];
  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`\n${cat}`);
    for (const item of items.slice(0, 12)) {
      const price = item.price_cents ? centsToUsd(item.price_cents, currencyCode) : "";
      lines.push(`- ${item.name}${price ? `  ${price}` : ""}`);
    }
    if (items.length > 12) lines.push(`  … and ${items.length - 12} more`);
  }

  return lines.join("\n").trim();
}

export function assembleMarketingPlan(planning: BpMarketingPlanning | null): string {
  if (
    !planning ||
    (!planning.overview_narrative &&
      !planning.founder_story &&
      !planning.differentiator &&
      !planning.target_customer &&
      planning.channels.length === 0)
  ) {
    return "Complete the Marketing workspace to populate this section.";
  }

  const lines: string[] = [];
  if (planning.overview_narrative) {
    lines.push(`Overview\n${planning.overview_narrative}`);
  }
  if (planning.differentiator) {
    lines.push(`\nWhat Makes Us Different\n${planning.differentiator}`);
  }
  if (planning.target_customer) {
    lines.push(`\nWho It Is For\n${planning.target_customer}`);
  }
  if (planning.founder_story) {
    lines.push(`\nFounder Story\n${planning.founder_story}`);
  }
  if (planning.channels.length > 0) {
    lines.push(`\nChannels`);
    for (const c of planning.channels) lines.push(`- ${c}`);
  }

  return lines.join("\n").trim();
}

export function assembleOperationsLaunch(timeline: BpLaunchItem[]): string {
  if (!timeline || timeline.length === 0) {
    return "Add milestones in the Launch Plan workspace to populate this section.";
  }

  const lines: string[] = [`Launch Timeline (${timeline.length} milestones)`];

  const sorted = [...timeline].sort((a, b) => {
    if (!a.target_date) return 1;
    if (!b.target_date) return -1;
    return a.target_date.localeCompare(b.target_date);
  });

  for (const item of sorted.slice(0, 15)) {
    const date = item.target_date ? new Date(item.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD";
    const statusTag = item.status !== "pending" ? ` [${item.status}]` : "";
    lines.push(`- ${item.milestone} — ${date}${statusTag}`);
  }

  if (sorted.length > 15) lines.push(`… and ${sorted.length - 15} more milestones`);

  return lines.join("\n").trim();
}

export function assembleTeamHiring(roles: BpHiringRole[], currencyCode = "USD"): string {
  if (!roles || roles.length === 0) {
    return "Add roles in the Hiring & Onboarding workspace to populate this section.";
  }

  const totalHeadcount = roles.reduce((sum, r) => sum + r.headcount, 0);
  const totalMonthlyCost = roles.reduce((sum, r) => sum + (r.monthly_cost_cents ?? 0), 0);

  const lines: string[] = [
    `Team (${totalHeadcount} headcount${totalMonthlyCost ? `, ${centsToUsd(totalMonthlyCost, currencyCode)}/month est.` : ""})`,
  ];

  for (const role of roles) {
    const cost = role.monthly_cost_cents ? ` — ${centsToUsd(role.monthly_cost_cents, currencyCode)}/mo` : "";
    const date = role.start_date ? ` (start ${new Date(role.start_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })})` : "";
    lines.push(`- ${role.role_title} ×${role.headcount}${cost}${date} [${role.status}]`);
  }

  return lines.join("\n").trim();
}

export function assembleFinancialPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  financialModel: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildoutItems: any[],
  // TIM-1694: blended menu COGS pct so menu-linked COGS lines resolve against
  // menu costing here exactly as they do in the Financials workspace. Without
  // this the Business Plan Financials → Cost of Goods section stayed empty/stale
  // because menu-linked lines had no rate to compute against (the ctx was {}).
  menuBlendedCogsPct?: number | null,
  currencyCode = "USD",
): string {
  if (!financialModel) {
    return "Complete the Financials workspace to populate this section.";
  }

  const projections = normalizeMonthlyProjections(
    financialModel.forecast_inputs ?? financialModel.monthly_projections
  );

  const totalEquipCostUsd = (buildoutItems ?? []).reduce(
    (sum: number, e: { cost_usd?: number }) => sum + (e.cost_usd ?? 0), 0
  );
  const equipSummary: EquipmentSummary = {
    total_cost_cents: Math.round(totalEquipCostUsd * 100),
    financed_cost_cents: Math.round(totalEquipCostUsd * 100),
  };

  const slices = computeMonthlySlices(projections, equipSummary, {}, {
    menu_blended_cogs_pct:
      typeof menuBlendedCogsPct === "number" ? menuBlendedCogsPct : null,
  });
  const lines: string[] = [];

  const y1 = slices.filter((s) => s.year === 1);
  if (y1.length === 0) {
    return "Complete the Financials workspace to populate this section.";
  }

  // Year 1 income statement
  const totalRevCents = y1.reduce((s, r) => s + r.net_revenue_cents, 0);
  const totalCogsCents = y1.reduce((s, r) => s + r.total_cogs_cents, 0);
  const grossProfitCents = totalRevCents - totalCogsCents;
  const totalOpexCents = y1.reduce((s, r) => s + r.total_opex_cents, 0);
  const ebitdaCents = y1.reduce((s, r) => s + r.operating_income_cents, 0);
  const totalDeprecCents = y1.reduce((s, r) => s + r.depreciation_cents, 0);
  const totalInterestCents = y1.reduce((s, r) => s + r.interest_cents, 0);
  const totalTaxesCents = y1.reduce((s, r) => s + r.taxes_cents, 0);
  const netIncomeCents = y1.reduce((s, r) => s + r.net_income_cents, 0);
  const endingCashY1 = y1[y1.length - 1].cash_cents;

  const grossMarginPct = totalRevCents > 0 ? Math.round((grossProfitCents / totalRevCents) * 100) : 0;
  const ebitdaMarginPct = totalRevCents > 0 ? Math.round((ebitdaCents / totalRevCents) * 100) : 0;

  const cu = (c: number) => centsToUsd(c, currencyCode);
  lines.push("Year 1 Income Statement");
  lines.push(`Revenue:           ${cu(totalRevCents)}`);
  lines.push(`COGS:              ${cu(totalCogsCents)} (${totalRevCents > 0 ? Math.round((totalCogsCents / totalRevCents) * 100) : 0}%)`);
  lines.push(`Gross Profit:      ${cu(grossProfitCents)} (${grossMarginPct}% margin)`);
  lines.push(`Operating Exp:     ${cu(totalOpexCents)}`);
  lines.push(`EBITDA:            ${cu(ebitdaCents)} (${ebitdaMarginPct}% margin)`);
  lines.push(`Depreciation:      ${cu(totalDeprecCents)}`);
  lines.push(`Interest:          ${cu(totalInterestCents)}`);
  lines.push(`Income Tax:        ${cu(totalTaxesCents)}`);
  lines.push(`Net Income:        ${cu(netIncomeCents)}`);
  lines.push(`Ending Cash:       ${cu(endingCashY1)}`);

  // Quarterly revenue
  lines.push("\nQuarterly Revenue (Year 1)");
  const quarters = [
    { label: "Q1", months: y1.slice(0, 3) },
    { label: "Q2", months: y1.slice(3, 6) },
    { label: "Q3", months: y1.slice(6, 9) },
    { label: "Q4", months: y1.slice(9, 12) },
  ];
  for (const q of quarters) {
    const qRev = q.months.reduce((s, r) => s + r.net_revenue_cents, 0);
    if (qRev > 0) lines.push(`${q.label}: ${cu(qRev)}`);
  }

  // 5-year summary
  lines.push("\n5-Year Summary");
  for (let yr = 1; yr <= 5; yr++) {
    const yrSlices = slices.filter((s) => s.year === yr);
    if (yrSlices.length === 0) continue;
    const yrRev = yrSlices.reduce((s, r) => s + r.net_revenue_cents, 0);
    const yrNet = yrSlices.reduce((s, r) => s + r.net_income_cents, 0);
    const yrEndCash = yrSlices[yrSlices.length - 1].cash_cents;
    lines.push(
      `Year ${yr}: Revenue ${cu(yrRev)}, Net ${cu(yrNet)}, Ending Cash ${cu(yrEndCash)}`
    );
  }

  // Capital assets
  const capexTotal = totalCapexCents(projections);
  if (capexTotal > 0) {
    lines.push("\nCapital Assets");
    const capexLines = projections.forecast_lines.filter(
      (l) => l.category === "capex" && l.mode === "flat" && l.value > 0
    );
    for (const l of capexLines) {
      lines.push(`- ${l.label}: ${centsToUsd(l.value)} (${l.useful_life_years ?? 7}yr life)`);
    }
  }

  lines.push(
    "\nFull monthly P&L, cash flow, and balance sheet statements are included in the Financial Appendix of this document."
  );

  return lines.join("\n").trim() || "Complete the Financials workspace to populate this section.";
}

// ── Two-level merged assemblers ───────────────────────────────────────────────

// TIM-1498: Execution > Operations merges Location & Real Estate + Equipment &
// Supplies, with each previous section preserved under a heading separator.
export function assembleExecutionOperations(
  candidates: BpLocationCandidate[],
  equipment: BpEquipmentItem[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  financialModel: any,
): string {
  const blocks: string[] = [];

  const locationBlock = assembleLocationSection(candidates);
  if (locationBlock && !locationBlock.startsWith("Add location candidates")) {
    blocks.push(`## Location & Real Estate\n${locationBlock}`);
  }

  const equipmentBlock = assembleBuildoutEquipment(equipment, financialModel);
  if (equipmentBlock && !equipmentBlock.startsWith("Add equipment in the")) {
    blocks.push(`## Equipment & Supplies\n${equipmentBlock}`);
  }

  if (blocks.length === 0) {
    return "Add location candidates and equipment in the Location & Lease and Equipment & Supplies workspaces to populate this section.";
  }
  return blocks.join("\n\n").trim();
}

// TIM-1498: Execution > Marketing & Sales merges Menu & Pricing + Marketing.
export function assembleExecutionMarketingSales(
  menuItems: BpMenuItem[],
  planning: BpMarketingPlanning | null,
): string {
  const blocks: string[] = [];

  const menuBlock = assembleMenuPricing(menuItems);
  if (menuBlock && !menuBlock.startsWith("Add menu items")) {
    blocks.push(`## Menu & Pricing\n${menuBlock}`);
  }

  const marketingBlock = assembleMarketingPlan(planning);
  if (marketingBlock && !marketingBlock.startsWith("Complete the Marketing")) {
    blocks.push(`## Marketing Plan\n${marketingBlock}`);
  }

  if (blocks.length === 0) {
    return "Add menu items in Menu & Pricing and complete the Marketing workspace to populate this section.";
  }
  return blocks.join("\n\n").trim();
}

// ── AI snapshot for executive summary generation ──────────────────────────────

export function buildPlanSnapshotForExecutiveSummary(sections: BusinessPlanSectionData[]): string {
  const relevant: BusinessPlanSectionKey[] = [
    "company-overview",
    "opportunity-target-market",
    "execution-operations",
    "execution-marketing-sales",
    "execution-milestones-metrics",
    "company-team",
    "financial-plan-statements",
  ];

  return relevant
    .map((key) => {
      const s = sections.find((x) => x.key === key);
      if (!s) return null;
      const content = s.userContent ?? s.autoContent;
      if (!content || content.includes("workspace to populate")) return null;
      return `### ${s.title}\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

// ── TIM-2341: Lender-ready section assemblers ─────────────────────────────────
// Each builds compact Markdown from a LenderMetricsBundle (plan_state) that
// MarkdownBlocks renders cleanly in the PDF. When the underlying financial
// model isn't filled in yet, returns a placeholder hint rather than failing.

import type { LenderMetricsBundle } from "@/lib/business-plan/lender-metrics";

const LENDER_PLACEHOLDER_PREFIX =
  "Complete the Financials workspace and re-open the Business Plan to populate this section.";

function fmtCentsBusinessPlan(cents: number, currencyCode: string): string {
  return formatCurrencyAmount(cents / 100, currencyCode, { compact: false });
}

export function assembleUnitEconomicsSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const u = metrics.unit_economics;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  lines.push("## Steady-State Revenue Buildup");
  lines.push(`- Average ticket: ${c(u.avg_ticket_cents)}`);
  lines.push(`- Customers per day (average open day): ${u.customers_per_day_avg.toLocaleString()}`);
  lines.push(`- Open days per week: ${u.open_days_per_week}`);
  lines.push(`- Daily revenue: ${c(u.steady_state_daily_revenue_cents)} (ticket × customers)`);
  lines.push(`- Monthly revenue: ${c(u.steady_state_monthly_revenue_cents)} (daily × ${u.open_days_per_week} open days × 4.33 weeks)`);
  lines.push(`- Annual revenue (steady state): ${c(u.steady_state_annual_revenue_cents)} (monthly × 12)`);
  if (u.daypart_lines.length > 0) {
    lines.push("");
    lines.push("## Daypart Contribution");
    for (const d of u.daypart_lines) {
      lines.push(`- ${d.label} (${d.start_hour}:00–${d.end_hour}:00): ${d.revenue_pct}% of daily revenue, ${c(d.daily_revenue_cents)}/day, ${d.recommended_baristas} barista(s) recommended`);
    }
  }
  if (u.product_lines.length > 0) {
    lines.push("");
    lines.push("## Product Mix");
    for (const p of u.product_lines) {
      lines.push(`- ${p.label}: ${p.revenue_pct}% of revenue (${c(p.monthly_revenue_cents)}/mo), ${p.cogs_pct}% COGS, ${c(p.monthly_gross_profit_cents)} gross profit/mo`);
    }
  }
  return lines.join("\n");
}

export function assembleBreakEvenSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const be = metrics.break_even;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  lines.push("## Steady-State Break-even");
  lines.push(`- Monthly revenue required: **${c(be.monthly_revenue_required_cents)}**`);
  lines.push(`- Customers per day required (at the average ticket): **${be.customers_per_day_required.toLocaleString()}**`);
  lines.push(`- Monthly fixed costs (operating expenses + interest): ${c(be.monthly_fixed_costs_cents)}`);
  lines.push(`- Variable cost rate (blended COGS as a percentage of revenue): ${be.variable_cost_rate_pct}%`);
  if (be.first_profitable_month_index != null) {
    const m = be.first_profitable_month_index;
    const yr = Math.ceil(m / 12);
    const monthInYr = ((m - 1) % 12) + 1;
    lines.push(`- First profitable month in the projection: month ${m} of operations (Year ${yr}, month ${monthInYr})`);
  } else {
    lines.push(`- No profitable month within the five-year projection window — see Sensitivity Analysis for the levers most likely to close the gap.`);
  }
  lines.push("");
  lines.push("## Method");
  lines.push("Break-even revenue is solved against the steady-state month set (months 9 through 12 of Year 1, past the ramp). The formula is monthly fixed cost divided by one minus the variable cost rate. Customers per day required is the implied volume at the chosen average ticket and weekly open-day count.");
  return lines.join("\n");
}

export function assembleSensitivitySection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const s = metrics.sensitivity;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const cSigned = (n: number) => `${n >= 0 ? "+" : "−"}${fmtCentsBusinessPlan(Math.abs(n), currencyCode)}`;
  const lines: string[] = [];
  lines.push(`## Baseline`);
  lines.push(`- Year 1 net income: **${c(s.baseline_y1_net_income_cents)}**`);
  lines.push(`- Year 1 revenue: ${c(s.baseline_y1_revenue_cents)}`);
  lines.push("");
  lines.push(`## Scenarios (Y1 net income at each perturbation)`);
  for (const sc of s.scenarios) {
    lines.push(`- ${sc.label}: ${c(sc.y1_net_income_cents)} (Δ ${cSigned(sc.y1_net_income_delta_cents)})`);
  }
  lines.push("");
  lines.push("## Method");
  lines.push("Every scenario re-runs the same projection engine that drives the P&L tables, with one input perturbed and every other assumption held constant. COGS ±20% means the COGS rate moves by twenty percent of itself, not twenty absolute percentage points — so a 30% baseline becomes 36% (+20% relative) or 24% (−20% relative). Ramp scenarios shift the post-opening ramp window forward or backward by three months.");
  return lines.join("\n");
}

export function assembleDscrSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const d = metrics.dscr;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  lines.push(`## Coverage Standard`);
  lines.push(`Most commercial and SBA underwriters require a Debt Service Coverage Ratio (DSCR) of at least ${d.threshold.toFixed(2)}× — meaning earnings before interest, taxes, depreciation, and amortization (EBITDA) must cover annual debt service (principal + interest) by at least ${Math.round((d.threshold - 1) * 100)} percent above the obligation itself.`);
  lines.push("");
  if (!d.has_term_debt) {
    lines.push(`## DSCR Not Applicable`);
    lines.push("No term debt sits in the capital stack as planned, so DSCR is not the relevant coverage metric. Lenders will instead evaluate the equity coverage of the project and the founder's contingency reserve.");
    return lines.join("\n");
  }
  lines.push(`## Year-by-Year DSCR`);
  for (const y of d.years) {
    const flag = y.meets_threshold ? "meets the threshold" : "**below threshold**";
    lines.push(`- Year ${y.year}: EBITDA ${c(y.ebitda_cents)} ÷ Debt service ${c(y.debt_service_cents)} = **${y.dscr_ratio.toFixed(2)}×** (${flag})`);
  }
  if (d.notes.length > 0) {
    lines.push("");
    lines.push(`## Notes`);
    for (const n of d.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

export function assembleCapexScheduleSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const cx = metrics.capex;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  if (cx.rows.length === 0) {
    lines.push("## CapEx Schedule");
    lines.push("No capital expenditures are budgeted in the current financial model. Add equipment in the Equipment & Supplies workspace, or capex lines in the Financials workspace, to populate this schedule.");
    return lines.join("\n");
  }
  lines.push(`## CapEx Schedule — total ${c(cx.total_cents)}`);
  lines.push("");
  for (const r of cx.rows) {
    lines.push(`- **${r.label}**: ${c(r.cost_cents)} · ${r.useful_life_years}-year useful life · placed in service month ${r.purchase_month_index} · ${r.asset_category.replace(/_/g, " ")}`);
  }
  return lines.join("\n");
}

export function assembleDepreciationScheduleSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const dp = metrics.depreciation;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  if (dp.rows.length === 0) {
    lines.push("## Depreciation Schedule");
    lines.push("No depreciable assets are budgeted in the current financial model. Add equipment or build-out to the financial workspace to populate this schedule.");
    return lines.join("\n");
  }
  lines.push(`## Annual Depreciation — total ${c(dp.total_annual_depreciation_cents)}/yr`);
  lines.push("");
  for (const r of dp.rows) {
    lines.push(`- **${r.label}**: ${c(r.cost_cents)} ÷ ${r.useful_life_years} years = ${c(r.annual_depreciation_cents)}/yr (straight-line)`);
  }
  lines.push("");
  lines.push("## Method");
  lines.push("All depreciable assets are amortized straight-line over their estimated useful life, beginning the month the asset is placed in service. This matches the depreciation expense the projected P&L shows in the Statements section.");
  return lines.join("\n");
}

export function assembleWorkingCapitalSection(
  metrics: LenderMetricsBundle | null,
  currencyCode = "USD",
): string {
  if (!metrics) return LENDER_PLACEHOLDER_PREFIX;
  const wc = metrics.working_capital;
  const c = (n: number) => fmtCentsBusinessPlan(n, currencyCode);
  const lines: string[] = [];
  lines.push("## Working Capital Requirement");
  lines.push(`- Inventory days on hand: **${wc.days_inventory_on_hand}** → ${c(wc.inventory_required_cents)}`);
  lines.push(`- Days payable (vendor terms): **${wc.days_payable}** → ${c(wc.accounts_payable_cents)}`);
  lines.push(`- Days receivable (customer/wholesale terms): **${wc.days_receivable}** → ${c(wc.accounts_receivable_cents)}`);
  lines.push(`- Net working capital tied up in operations (inventory + receivables − payables): **${c(wc.net_working_capital_cents)}**`);
  lines.push("");
  lines.push("## Method");
  lines.push(`Inventory and payables are computed against the Year 1 daily COGS run rate (${c(wc.daily_cogs_cents)}/day). Receivables are computed against daily revenue (${c(wc.daily_revenue_cents)}/day). Food-service operators typically need a positive net working capital buffer at opening so the first inventory drop is funded before the first weeks of cash receipts catch up.`);
  return lines.join("\n");
}

export function assembleRisksPlaceholderSection(): string {
  // Risks are generated by the AI prompt (see business-plan-prompts.ts).
  // When no AI draft exists yet, render a structured prompt so the operator
  // knows what to fill in.
  const lines: string[] = [];
  lines.push("Click Generate to produce a categorized risk register from your plan data. The draft covers four lender-standard risk categories:");
  lines.push("");
  lines.push("- **Operational**: opening delays, staffing gaps, supply disruption, equipment failures.");
  lines.push("- **Market**: customer-acquisition pace, competitor moves, neighborhood foot-traffic changes.");
  lines.push("- **Financial**: cost inflation outpacing pricing, longer-than-expected ramp, debt-service squeeze.");
  lines.push("- **Regulatory**: health-code compliance, lease assignment clauses, licensing timelines.");
  lines.push("");
  lines.push("Each risk should pair a description with the owner's mitigation: insurance carried, reserve set aside, training cadence, or a specific contractual protection.");
  return lines.join("\n");
}
