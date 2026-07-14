// TIM-3854: Business Plan "Seed from Other Sections" — workspace-first source
// mapping + per-workspace summarizers.
//
// Prior behavior (TIM-3672) seeded BP sections from OTHER BP sections. That
// was circular (Executive Summary "seeds" from Business Overview that hasn't
// been written yet) and produced garbage output like "HEREHEREHERE..." when
// the model was handed empty-placeholder excerpts.
//
// This module drives the seed from **source workspaces** instead: Concept,
// Menu & Pricing, Financial, Location & Lease, Equipment & Supplies, Hiring
// & Onboarding, Marketing. The board-mandated mapping lives in
// SECTION_WORKSPACE_MAP below (source of truth: TIM-3854 issue description).
//
// Every summarizer returns SUMMARIZED shape — category counts, price ranges,
// signature items, headline metrics — not a flat SKU/spreadsheet dump. The
// output is fed into the Write-with-AI modal's textarea so the founder can
// edit/remove any line before Generate, and into the /improve prompt as
// grounded plan data.

// Relative imports so this module and its tests load cleanly under
// `node --experimental-strip-types --test` — same pattern as
// business-plan-prompts.ts (which is why business-plan-prompts.ts is testable
// with the node:test runner but business-plan.ts is not).
import {
  normalizeConceptV2,
  PERSONA_AGE_RANGE_LABELS,
  PERSONA_SPEND_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
} from "../concept.ts";
import { formatCurrencyAmount } from "../currency.ts";

// Structural mirrors of the Bp* interfaces from src/lib/business-plan.ts.
// Duplicated (not imported) so this module has no transitive dependency on
// business-plan.ts — which pulls in the financial engine, marketing shape,
// and a chain of other modules that break the node:test runner. The
// interfaces are load-bearing for the summarizer inputs; a drift here would
// fail typecheck at every call site that also imports the canonical version.
export interface BpMenuItem {
  id: string;
  name: string;
  category_name: string | null;
  price_cents: number | null;
}

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
  cost_local: number | null;
  category: string | null;
  notes: string | null;
}

export interface BpHiringRole {
  id: string;
  role_title: string;
  headcount: number;
  start_date: string | null;
  monthly_cost_cents: number | null;
}

// ── Section → source workspace mapping ─────────────────────────────────────────

// Canonical workspace identifiers. UI labels come from WORKSPACE_LABELS below.
export type SeedWorkspaceKey =
  | "concept"
  | "menu"
  | "financial"
  | "location"
  | "equipment"
  | "hiring"
  | "marketing";

// Human-readable labels rendered as the block heading in the seed textarea.
// "From <Label> Workspace:" — the "Workspace:" suffix is added by the
// formatter so labels stay short.
export const WORKSPACE_LABELS: Record<SeedWorkspaceKey, string> = {
  concept: "Concept",
  menu: "Menu & Pricing",
  financial: "Financial",
  location: "Location & Lease",
  equipment: "Equipment & Supplies",
  hiring: "Hiring & Onboarding",
  marketing: "Marketing",
};

// Empty-state hint the founder sees when a source workspace has no content
// yet. The board spec: never a blank heading, never a garbage string.
export const WORKSPACE_EMPTY_HINTS: Record<SeedWorkspaceKey, string> = {
  concept: "No content yet. Fill out your Concept workspace to seed this section.",
  menu: "No content yet. Add menu items in the Menu & Pricing workspace to seed this section.",
  financial: "No content yet. Fill out the Financial workspace to seed this section.",
  location: "No content yet. Add candidates in the Location & Lease workspace to seed this section.",
  equipment: "No content yet. Add items in the Equipment & Supplies workspace to seed this section.",
  hiring: "No content yet. Add roles in the Hiring & Onboarding workspace to seed this section.",
  marketing: "No content yet. Fill out the Marketing workspace to seed this section.",
};

// Board-mandated mapping from BP section → ordered list of source workspaces.
// Order matters: the seed text renders blocks in this order so the founder
// sees the most-load-bearing workspace first.
//
// Executive Summary is the ONE exception in the calling code — the API route
// also appends "From Other Business Plan Sections" blocks for populated
// sections. See getSectionSourceWorkspaces() below.
const SECTION_WORKSPACE_MAP: Partial<Record<string, SeedWorkspaceKey[]>> = {
  // Executive Summary primarily draws from Concept + Financial workspaces.
  // Other populated BP sections are ALSO included by the caller.
  "executive-summary": ["concept", "financial"],

  // Business/Company Overview — Concept (name, vision, differentiation, brand voice, offering).
  "company-overview": ["concept"],

  // Products & Services / Menu & Pricing — Menu workspace. Summarized as a
  // strategy narrative in the seed, not a SKU list.
  "execution-marketing-sales": ["menu", "marketing", "concept"],

  // Target Market / Your Customers — Concept (personas, demographics, needs).
  "opportunity-target-market": ["concept"],

  // Marketing strategy is bundled into execution-marketing-sales in the
  // current taxonomy; no standalone section key.

  // Operations Plan — Location + Equipment + Hiring.
  "execution-operations": ["location", "equipment", "hiring"],

  // Management Team — Hiring + Concept (owner info in shop_identity/vision).
  "company-team": ["hiring", "concept"],

  // Financial Plan / Revenue Forecast / Financial Statements — Financial.
  "financial-plan-forecast": ["financial"],
  "financial-plan-statements": ["financial"],
  "financial-plan-financing": ["financial"],
  "financial-plan-unit-economics": ["financial"],
  "financial-plan-break-even": ["financial"],
  "financial-plan-sensitivity": ["financial"],
  "financial-plan-dscr": ["financial"],
  "financial-plan-capex-schedule": ["financial", "equipment"],
  "financial-plan-depreciation": ["financial", "equipment"],
  "financial-plan-working-capital": ["financial"],

  // Milestones — Concept fallback (no launch-plan-specific workspace summary
  // covers milestone rationale; concept anchors the "why now").
  "execution-milestones-metrics": ["concept"],

  // Opportunity — problem/solution, competition, risks — Concept fallback.
  "opportunity-problem-solution": ["concept"],
  "opportunity-competition": ["concept"],
  "opportunity-risks": ["concept", "financial"],

  // Appendix — Financial.
  "appendix-monthly-statements": ["financial"],

  // Optional sections — Concept fallback per board mapping. Author-driven,
  // no workspace summary is a perfect fit; Concept anchors voice + brand.
  "sustainability-practices": ["concept"],
  "community-engagement": ["concept"],
  "technology-pos": ["concept", "equipment"],
  "catering-wholesale": ["concept", "menu"],
  "seasonal-menu": ["concept", "menu"],
  "expansion-roadmap": ["concept", "financial"],
  "supplier-relationships": ["concept", "menu"],
  "accessibility-design": ["concept", "location"],
  "staff-training": ["concept", "hiring"],
  "loyalty-online-ordering": ["concept", "menu"],
};

/** Return the ordered source workspaces for a BP section, or ["concept"] as
 *  a defensive fallback for any unmapped custom/new key. */
export function getSectionSourceWorkspaces(sectionKey: string): SeedWorkspaceKey[] {
  return SECTION_WORKSPACE_MAP[sectionKey] ?? ["concept"];
}

// ── Data shapes coming out of Supabase ─────────────────────────────────────────

// financialModel row shape — kept intentionally loose since the column is a
// JSONB blob with a wide surface area. We touch only forecast_inputs and
// startup_costs here.
interface FinancialModelShape {
  forecast_inputs?: unknown;
  monthly_projections?: unknown;
  startup_costs?: unknown;
}

// ── Summarizers (workspace → bullet list) ──────────────────────────────────────

/** Summarize the Concept workspace as a short bullet list: identity, vision,
 *  differentiation, offering, brand voice, personas (names + tags only). */
export function summarizeConcept(conceptContent: unknown): string[] {
  const doc = normalizeConceptV2(conceptContent);
  const out: string[] = [];

  const push = (label: string, value: string | undefined | null) => {
    if (!value) return;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    // One-line summaries — trim aggressively so the seed textarea is scannable.
    const capped = trimmed.length > 200 ? trimmed.slice(0, 197).trimEnd() + "..." : trimmed;
    out.push(`- ${label}: ${capped}`);
  };

  push("Shop identity", doc.components.shop_identity?.content);
  push("Vision", doc.components.vision?.content);
  push("Differentiation", doc.components.differentiation?.content);
  push("Offering", doc.components.offering?.content);
  push("Brand voice", doc.components.brand_voice?.content);
  push("Location context", doc.components.location?.content);
  push("Target customer", doc.components.target_customer?.content);

  if (doc.personas && doc.personas.length > 0) {
    const personas = doc.personas.slice(0, 6).map((p) => {
      const tags: string[] = [];
      if (p.ageRange) tags.push(PERSONA_AGE_RANGE_LABELS[p.ageRange] ?? p.ageRange);
      if (p.visitFrequency) tags.push(PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] ?? p.visitFrequency);
      if (p.spendPerVisit) tags.push(`${PERSONA_SPEND_LABELS[p.spendPerVisit] ?? p.spendPerVisit}/visit`);
      const suffix = tags.length ? ` (${tags.join(", ")})` : "";
      return `${p.name || "Persona"}${suffix}`;
    });
    out.push(`- Personas (${doc.personas.length}): ${personas.join("; ")}`);
  }

  if (doc.competitors && doc.competitors.length > 0) {
    const names = doc.competitors.slice(0, 6).map((c) => c.name);
    out.push(`- Named competitors: ${names.join(", ")}`);
  } else if (doc.no_direct_competitors_identified) {
    out.push(`- Competitors: no direct competitors identified`);
  }

  return out;
}

/** Summarize Menu & Pricing as strategy narrative shape: category counts,
 *  per-category price ranges, signature items (top 3 by name). NOT a flat
 *  SKU list — that's what the board rejected. */
export function summarizeMenu(
  menuRows: BpMenuItem[] | null | undefined,
  currencyCode = "USD",
): string[] {
  if (!menuRows || menuRows.length === 0) return [];
  const out: string[] = [];

  const byCategory = new Map<string, BpMenuItem[]>();
  for (const item of menuRows) {
    const cat = item.category_name ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  out.push(`- Menu size: ${menuRows.length} items across ${byCategory.size} ${byCategory.size === 1 ? "category" : "categories"}`);

  // Per-category summary — count + price range. Six is a soft cap so a
  // ridiculously-broad menu (rare, but possible) doesn't blow the block.
  const cats = Array.from(byCategory.entries()).slice(0, 8);
  for (const [cat, items] of cats) {
    const priced = items.filter((i) => typeof i.price_cents === "number" && (i.price_cents ?? 0) > 0);
    if (priced.length === 0) {
      out.push(`- ${cat}: ${items.length} ${items.length === 1 ? "item" : "items"}`);
      continue;
    }
    const min = Math.min(...priced.map((i) => i.price_cents as number));
    const max = Math.max(...priced.map((i) => i.price_cents as number));
    const range = min === max
      ? formatCurrencyAmount(min / 100, currencyCode)
      : `${formatCurrencyAmount(min / 100, currencyCode)}-${formatCurrencyAmount(max / 100, currencyCode)}`;
    out.push(`- ${cat}: ${items.length} ${items.length === 1 ? "item" : "items"}, ${range}`);
  }

  // Signature items — top 3 by price (proxy for "most differentiated"; the
  // menu workspace doesn't currently expose a signature/highlight flag, so
  // price is the cleanest fallback that still surfaces something meaningful).
  const signature = [...menuRows]
    .filter((i) => typeof i.price_cents === "number" && (i.price_cents ?? 0) > 0)
    .sort((a, b) => (b.price_cents ?? 0) - (a.price_cents ?? 0))
    .slice(0, 3)
    .map((i) => i.name);
  if (signature.length > 0) {
    out.push(`- Signature items: ${signature.join(", ")}`);
  }

  return out;
}

/** Summarize the Financial workspace as headline metrics — Year 1 revenue,
 *  gross margin, net income, break-even month if available. NOT a full
 *  quarterly breakdown — that's what the board rejected. */
export function summarizeFinancial(
  financialModel: FinancialModelShape | null | undefined,
  currencyCode = "USD",
): string[] {
  if (!financialModel) return [];
  const out: string[] = [];

  // Startup costs — a lender's first number question.
  const sc = (financialModel.startup_costs ?? null) as Record<string, unknown> | null;
  if (sc) {
    const buildOut = typeof sc.build_out_cents === "number" ? sc.build_out_cents : 0;
    const licenses = typeof sc.licenses_cents === "number" ? sc.licenses_cents : 0;
    const deposits = typeof sc.deposits_cents === "number" ? sc.deposits_cents : 0;
    const equipment = typeof sc.equipment_cents === "number" ? sc.equipment_cents : 0;
    const total = buildOut + licenses + deposits + equipment;
    if (total > 0) {
      out.push(`- Startup capital: ${formatCurrencyAmount(total / 100, currencyCode)} total`);
    }
  }

  // Year-1 topline + margin — computed from monthly_projections when present.
  // We deliberately avoid pulling in the whole plan_state buildup here — the
  // seed is a summary, and re-loading the same pipeline the /generate route
  // uses would inflate cost + latency for zero founder-visible benefit.
  const mp = (financialModel.forecast_inputs ?? financialModel.monthly_projections ?? null) as
    | { forecast_lines?: Array<{ category?: string; mode?: string; value?: number }> }
    | null;
  if (mp?.forecast_lines && Array.isArray(mp.forecast_lines)) {
    // Rough topline estimate — sum of positive revenue-category flat lines.
    // This is a proxy; the true number comes out of computeMonthlySlices
    // downstream. But for a seed excerpt, the founder-entered assumption is
    // the right thing to surface (matches what they typed in).
    const revenueLines = mp.forecast_lines.filter((l) => l && l.category === "revenue");
    if (revenueLines.length > 0) {
      out.push(`- Revenue assumptions: ${revenueLines.length} line${revenueLines.length === 1 ? "" : "s"} configured`);
    }
    const capexLines = mp.forecast_lines.filter((l) => l && l.category === "capex" && (l.value ?? 0) > 0);
    if (capexLines.length > 0) {
      const total = capexLines.reduce((s, l) => s + (l.value ?? 0), 0);
      out.push(`- CapEx planned: ${formatCurrencyAmount(total / 100, currencyCode)} across ${capexLines.length} line${capexLines.length === 1 ? "" : "s"}`);
    }
  }

  if (out.length === 0) return [];
  out.push(`- Full monthly P&L, cash flow, and 5-year projections drive from these inputs.`);
  return out;
}

/** Summarize Location & Lease — chosen candidate first, then a one-line
 *  count of other sites evaluated. */
export function summarizeLocation(
  candidates: BpLocationCandidate[] | null | undefined,
  currencyCode = "USD",
): string[] {
  if (!candidates || candidates.length === 0) return [];
  const out: string[] = [];

  const chosen = candidates.find((c) => c.status === "chosen") ?? candidates[0];
  if (chosen) {
    out.push(`- Chosen site: ${chosen.name}${chosen.neighborhood ? `, ${chosen.neighborhood}` : ""}`);
    if (chosen.address) out.push(`- Address: ${chosen.address}`);
    if (chosen.sq_ft) out.push(`- Size: ${chosen.sq_ft.toLocaleString()} sq ft`);
    if (chosen.asking_rent_cents) {
      out.push(`- Rent: ${formatCurrencyAmount(chosen.asking_rent_cents / 100, currencyCode)}/month`);
    }
  }

  const others = candidates.filter((c) => c !== chosen);
  if (others.length > 0) {
    out.push(`- Also evaluated: ${others.length} other ${others.length === 1 ? "site" : "sites"}`);
  }

  return out;
}

/** Summarize Equipment & Supplies — total spend + category counts (major/minor).
 *  NOT a full item list — that's what the board rejected. */
export function summarizeEquipment(
  equipment: BpEquipmentItem[] | null | undefined,
  currencyCode = "USD",
): string[] {
  if (!equipment || equipment.length === 0) return [];
  const out: string[] = [];

  const totalCost = equipment.reduce((sum, e) => sum + (e.cost_local ?? 0), 0);
  const major = equipment.filter((e) => e.category === "major");
  const minor = equipment.filter((e) => e.category === "minor");

  out.push(`- ${equipment.length} items, total ${formatCurrencyAmount(totalCost, currencyCode)}`);
  if (major.length > 0) {
    out.push(`- Major equipment: ${major.length} items (${major.slice(0, 3).map((e) => e.name).join(", ")}${major.length > 3 ? "..." : ""})`);
  }
  if (minor.length > 0) {
    out.push(`- Minor equipment: ${minor.length} items`);
  }

  return out;
}

/** Summarize Hiring & Onboarding — headcount, monthly payroll, role list. */
export function summarizeHiring(
  roles: BpHiringRole[] | null | undefined,
  currencyCode = "USD",
): string[] {
  if (!roles || roles.length === 0) return [];
  const out: string[] = [];

  const totalHeadcount = roles.reduce((sum, r) => sum + r.headcount, 0);
  const totalMonthly = roles.reduce((sum, r) => sum + (r.monthly_cost_cents ?? 0), 0);

  out.push(`- Team size: ${totalHeadcount} headcount across ${roles.length} role${roles.length === 1 ? "" : "s"}`);
  if (totalMonthly > 0) {
    out.push(`- Monthly payroll: ${formatCurrencyAmount(totalMonthly / 100, currencyCode)} (est.)`);
  }
  const roleNames = roles.slice(0, 6).map((r) => `${r.role_title}${r.headcount > 1 ? ` ×${r.headcount}` : ""}`);
  out.push(`- Roles: ${roleNames.join(", ")}${roles.length > 6 ? "..." : ""}`);

  return out;
}

/** Summarize the Marketing workspace — story sections + selected channels.
 *  Duck-typed against the MarketingDocument shape from src/lib/marketing.ts
 *  so this module has no runtime dependency on marketing.ts (keeps the
 *  node:test runner happy — see the top-of-file relative-import note). */
export function summarizeMarketing(marketingContent: unknown): string[] {
  if (!marketingContent || typeof marketingContent !== "object") return [];
  const doc = marketingContent as Record<string, unknown>;
  const overview = (doc.overview as Record<string, unknown> | undefined) ?? {};
  const story = (doc.story as Record<string, unknown> | undefined) ?? {};
  const channels = (doc.channels as Record<string, unknown> | undefined) ?? {};
  const selected = Array.isArray(channels.selected) ? (channels.selected as unknown[]) : [];

  const overviewNarrative = typeof overview.narrative === "string" ? overview.narrative : "";
  const founderStory = typeof story.founder_story === "string" ? story.founder_story : "";
  const differentiator = typeof story.differentiator === "string" ? story.differentiator : "";
  const targetCustomer = typeof story.target_customer === "string" ? story.target_customer : "";
  const channelNames = selected
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>).name : null))
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const nothingFilled =
    !overviewNarrative &&
    !founderStory &&
    !differentiator &&
    !targetCustomer &&
    channelNames.length === 0;
  if (nothingFilled) return [];

  const out: string[] = [];
  const push = (label: string, value: string) => {
    if (!value) return;
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const capped = trimmed.length > 200 ? trimmed.slice(0, 197).trimEnd() + "..." : trimmed;
    out.push(`- ${label}: ${capped}`);
  };

  push("Overview", overviewNarrative);
  push("Differentiator", differentiator);
  push("Target customer", targetCustomer);
  push("Founder story", founderStory);
  if (channelNames.length > 0) {
    out.push(`- Channels (${channelNames.length}): ${channelNames.join(", ")}`);
  }

  return out;
}

// ── Block shape + textarea formatter ───────────────────────────────────────────

/** One block in the seed textarea. `bullets` is empty when the source is
 *  unfilled — the modal renders emptyHint in that case. */
export interface SeedBlock {
  /** Stable identifier — matches SeedWorkspaceKey for workspaces, or the
   *  string "bp-section:<key>" for BP-section blocks used by exec summary. */
  id: string;
  /** Short human-readable label used to build the default heading, e.g.
   *  "Concept". Ignored when `heading` is set. */
  label: string;
  /** Optional heading override rendered verbatim (already uppercased). BP-
   *  section blocks pass this so they don't render as "FROM X (BUSINESS
   *  PLAN) WORKSPACE:" — that reads awkward. Workspace blocks omit it and
   *  fall back to the default "FROM <LABEL> WORKSPACE:" pattern. */
  heading?: string;
  /** Textual bullets that make up this block's content. When empty, the
   *  source has no useful content yet and emptyHint should be shown. */
  bullets: string[];
  /** Populated only when `bullets` is empty — the empty-state hint to show
   *  the founder ("No content yet. Fill out X to seed this section."). */
  emptyHint?: string;
  /** True if this block sources from an unfilled workspace / section. */
  isEmpty: boolean;
}

/** Format the seed blocks into a textarea-friendly seed string with clear
 *  per-workspace section breaks. Blocks with `isEmpty: true` render as a
 *  labeled empty-hint (never blank, never garbage). */
export function formatSeedBlocksAsText(blocks: SeedBlock[]): string {
  if (blocks.length === 0) {
    return "";
  }
  const header = "Context from your workspaces (edit or remove any lines you don't want the AI to use):";
  const rendered = blocks.map((b) => {
    const heading = b.heading ?? `FROM ${b.label.toUpperCase()} WORKSPACE:`;
    if (b.isEmpty) {
      return `${heading}\n${b.emptyHint ?? "No content yet."}`;
    }
    return `${heading}\n${b.bullets.join("\n")}`;
  });
  return `${header}\n\n${rendered.join("\n\n")}`;
}

// ── High-level per-section builder (server-side) ───────────────────────────────

/** Bundle the raw workspace rows a section needs. All fields optional so a
 *  caller can pass only the workspaces this section actually maps to. */
export interface WorkspacesData {
  conceptContent?: unknown;
  marketingContent?: unknown;
  menuRows?: BpMenuItem[] | null;
  locationRows?: BpLocationCandidate[] | null;
  equipmentRows?: BpEquipmentItem[] | null;
  hiringRows?: BpHiringRole[] | null;
  financialModel?: FinancialModelShape | null;
  currencyCode?: string;
}

/** For a given section key, produce the ordered SeedBlock array per the
 *  board mapping. Every mapped workspace is included, filled or empty. */
export function buildSeedBlocksForSection(
  sectionKey: string,
  data: WorkspacesData,
): SeedBlock[] {
  const workspaces = getSectionSourceWorkspaces(sectionKey);
  const currencyCode = data.currencyCode ?? "USD";

  const bulletsFor = (ws: SeedWorkspaceKey): string[] => {
    switch (ws) {
      case "concept":
        return summarizeConcept(data.conceptContent);
      case "menu":
        return summarizeMenu(data.menuRows, currencyCode);
      case "financial":
        return summarizeFinancial(data.financialModel, currencyCode);
      case "location":
        return summarizeLocation(data.locationRows, currencyCode);
      case "equipment":
        return summarizeEquipment(data.equipmentRows, currencyCode);
      case "hiring":
        return summarizeHiring(data.hiringRows, currencyCode);
      case "marketing":
        return summarizeMarketing(data.marketingContent);
    }
  };

  return workspaces.map<SeedBlock>((ws) => {
    const bullets = bulletsFor(ws);
    return {
      id: ws,
      label: WORKSPACE_LABELS[ws],
      bullets,
      isEmpty: bullets.length === 0,
      emptyHint: bullets.length === 0 ? WORKSPACE_EMPTY_HINTS[ws] : undefined,
    };
  });
}
