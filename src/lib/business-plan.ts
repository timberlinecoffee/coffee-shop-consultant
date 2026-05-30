// TIM-1037: Business Plan Generator v1 — types, section keys, assemblers.

import { normalizeConceptV2 } from "@/lib/concept";
import { normalizeMonthlyProjections, computeMonthlySlices, totalCapexCents, type EquipmentSummary } from "@/lib/financial-projection";

// ── Section keys ─────────────────────────────────────────────────────────────

export type BusinessPlanSectionKey =
  | "executive_summary"
  | "company_concept"
  | "market_analysis"
  | "location_real_estate"
  | "buildout_equipment"
  | "menu_pricing"
  | "marketing_plan"
  | "operations_launch"
  | "team_hiring"
  | "financial_plan"
  | "funding_request";

export interface BusinessPlanSectionMeta {
  key: BusinessPlanSectionKey;
  title: string;
  defaultVisible: boolean;
  sourceLabel: string;
}

export const BUSINESS_PLAN_SECTIONS: BusinessPlanSectionMeta[] = [
  { key: "executive_summary",   title: "Executive Summary",              defaultVisible: true,  sourceLabel: "AI-generated from your plan" },
  { key: "company_concept",     title: "Company & Concept",              defaultVisible: true,  sourceLabel: "Concept workspace" },
  { key: "market_analysis",     title: "Market Analysis",                defaultVisible: true,  sourceLabel: "Concept workspace" },
  { key: "location_real_estate",title: "Location & Real Estate",         defaultVisible: true,  sourceLabel: "Location & Lease workspace" },
  { key: "buildout_equipment",  title: "Build Out & Equipment",          defaultVisible: true,  sourceLabel: "Build Out & Equipment workspace" },
  { key: "menu_pricing",        title: "Menu & Pricing",                 defaultVisible: true,  sourceLabel: "Menu & Pricing workspace" },
  { key: "marketing_plan",      title: "Marketing Plan",                 defaultVisible: true,  sourceLabel: "Marketing workspace" },
  { key: "operations_launch",   title: "Operations & Launch Timeline",   defaultVisible: true,  sourceLabel: "Launch Plan workspace" },
  { key: "team_hiring",         title: "Team & Hiring",                  defaultVisible: true,  sourceLabel: "Hiring workspace" },
  { key: "financial_plan",      title: "Financial Plan",                 defaultVisible: true,  sourceLabel: "Financials workspace" },
  { key: "funding_request",     title: "Funding Request",                defaultVisible: false, sourceLabel: "Your inputs" },
];

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

export interface BpMarketingBrand {
  positioning_statement: string;
  brand_pillar_1: string;
  brand_pillar_2: string;
  brand_pillar_3: string;
}

// ── Auto-content assemblers ───────────────────────────────────────────────────

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
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

export function assembleMarketAnalysis(conceptContent: unknown): string {
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

export function assembleLocationSection(candidates: BpLocationCandidate[]): string {
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
    if (chosen.asking_rent_cents) lines.push(`Rent: ${centsToUsd(chosen.asking_rent_cents)}/month`);
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
): string {
  const lines: string[] = [];

  if (equipment && equipment.length > 0) {
    const totalCost = equipment.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);
    lines.push(`Equipment (${equipment.length} items, total $${totalCost.toLocaleString()})`);

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
    lines.push("Add equipment in the Build Out & Equipment workspace to populate this section.");
  }

  // Build-out budget from financial model startup costs
  if (financialModel?.startup_costs) {
    const sc = financialModel.startup_costs as Record<string, unknown>;
    const buildOutCents = typeof sc.build_out_cents === "number" ? sc.build_out_cents : 0;
    const licensesCents = typeof sc.licenses_cents === "number" ? sc.licenses_cents : 0;
    const depositsCents = typeof sc.deposits_cents === "number" ? sc.deposits_cents : 0;
    if (buildOutCents || licensesCents || depositsCents) {
      lines.push(`\nBuild-out Budget`);
      if (buildOutCents) lines.push(`- Build-out: ${centsToUsd(buildOutCents)}`);
      if (licensesCents) lines.push(`- Licenses & permits: ${centsToUsd(licensesCents)}`);
      if (depositsCents) lines.push(`- Deposits: ${centsToUsd(depositsCents)}`);
    }
  }

  return lines.join("\n").trim();
}

export function assembleMenuPricing(menuItems: BpMenuItem[]): string {
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
      const price = item.price_cents ? centsToUsd(item.price_cents) : "";
      lines.push(`- ${item.name}${price ? `  ${price}` : ""}`);
    }
    if (items.length > 12) lines.push(`  … and ${items.length - 12} more`);
  }

  return lines.join("\n").trim();
}

export function assembleMarketingPlan(brand: BpMarketingBrand | null): string {
  if (!brand || (!brand.positioning_statement && !brand.brand_pillar_1)) {
    return "Complete the Marketing workspace to populate this section.";
  }

  const lines: string[] = [];
  if (brand.positioning_statement) {
    lines.push(`Positioning\n${brand.positioning_statement}`);
  }

  const pillars = [brand.brand_pillar_1, brand.brand_pillar_2, brand.brand_pillar_3].filter(Boolean);
  if (pillars.length > 0) {
    lines.push(`\nBrand Pillars`);
    for (const p of pillars) lines.push(`- ${p}`);
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

export function assembleTeamHiring(roles: BpHiringRole[]): string {
  if (!roles || roles.length === 0) {
    return "Add roles in the Hiring & Onboarding workspace to populate this section.";
  }

  const totalHeadcount = roles.reduce((sum, r) => sum + r.headcount, 0);
  const totalMonthlyCost = roles.reduce((sum, r) => sum + (r.monthly_cost_cents ?? 0), 0);

  const lines: string[] = [
    `Team (${totalHeadcount} headcount${totalMonthlyCost ? `, ${centsToUsd(totalMonthlyCost)}/month est.` : ""})`,
  ];

  for (const role of roles) {
    const cost = role.monthly_cost_cents ? ` — ${centsToUsd(role.monthly_cost_cents)}/mo` : "";
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

  const slices = computeMonthlySlices(projections, equipSummary);
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

  lines.push("Year 1 Income Statement");
  lines.push(`Revenue:           ${centsToUsd(totalRevCents)}`);
  lines.push(`COGS:              ${centsToUsd(totalCogsCents)} (${totalRevCents > 0 ? Math.round((totalCogsCents / totalRevCents) * 100) : 0}%)`);
  lines.push(`Gross Profit:      ${centsToUsd(grossProfitCents)} (${grossMarginPct}% margin)`);
  lines.push(`Operating Exp:     ${centsToUsd(totalOpexCents)}`);
  lines.push(`EBITDA:            ${centsToUsd(ebitdaCents)} (${ebitdaMarginPct}% margin)`);
  lines.push(`Depreciation:      ${centsToUsd(totalDeprecCents)}`);
  lines.push(`Interest:          ${centsToUsd(totalInterestCents)}`);
  lines.push(`Income Tax:        ${centsToUsd(totalTaxesCents)}`);
  lines.push(`Net Income:        ${centsToUsd(netIncomeCents)}`);
  lines.push(`Ending Cash:       ${centsToUsd(endingCashY1)}`);

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
    if (qRev > 0) lines.push(`${q.label}: ${centsToUsd(qRev)}`);
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
      `Year ${yr}: Revenue ${centsToUsd(yrRev)}, Net ${centsToUsd(yrNet)}, Ending Cash ${centsToUsd(yrEndCash)}`
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

// ── AI snapshot for executive summary generation ──────────────────────────────

export function buildPlanSnapshotForExecutiveSummary(sections: BusinessPlanSectionData[]): string {
  const relevant: BusinessPlanSectionKey[] = [
    "company_concept", "market_analysis", "location_real_estate",
    "menu_pricing", "operations_launch", "team_hiring", "financial_plan",
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
