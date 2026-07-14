// TIM-3854: POST /api/business-plan/seed-context
//
// Feeds the Business Plan "Seed from Other Sections" button. Returns
// per-workspace summarized blocks for the requested BP section, using the
// board-mandated section → workspace mapping in
// src/lib/business-plan/seed-context.ts.
//
// This endpoint replaces the prior TIM-3672 client-side BP-to-BP seed. The
// prior behavior was circular (Executive Summary "seeded" from Business
// Overview that hadn't been written yet) and produced garbage LLM output
// ("HEREHEREHERE...") when the model was handed empty-placeholder excerpts.
// The board directive on TIM-3854 is: seed from source workspaces, not from
// other BP sections. Executive Summary is the ONE exception — it also gets
// blocks from other populated BP sections, but ONLY for that section (the
// client passes them in the request body since they live in local UI state).
//
// Standing rules audit:
//   Rule 2 — server-side ownership check (auth.getUser + plan.user_id match)
//   Rule 3 — zod-shape validation of the request body
//   Rule 4 — enforceRateLimit() against the shared business-plan bucket
//   Rule 5 — no raw stack traces; errors return { error: string }

export const runtime = "nodejs";

import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildSeedBlocksForSection,
  type SeedBlock,
} from "@/lib/business-plan/seed-context";
import type {
  BpEquipmentItem,
  BpHiringRole,
  BpLocationCandidate,
  BpMenuItem,
} from "@/lib/business-plan";
import type { NextRequest } from "next/server";

interface RequestBody {
  sectionKey?: string;
  // Executive Summary only — populated BP sections the client sees in local
  // state. Server has no cheap way to know which sections the founder has
  // curated (userContent vs autoContent), so the client tells us. Each entry
  // is { title, excerpt } — same shape as the prior TIM-3672 excerpt list.
  bpSectionExcerpts?: Array<{ title?: unknown; excerpt?: unknown }>;
}

interface ResponseBody {
  blocks: SeedBlock[];
}

// Rule 3 — bound the BP-section excerpts a client can send. Each capped at
// 500 chars (matches BP_SEED_EXCERPT_MAX_CHARS on the client), and at most
// 40 excerpts (30 standard sections + generous headroom for custom).
const MAX_BP_EXCERPT_CHARS = 500;
const MAX_BP_EXCERPTS = 40;

// Server-side placeholder filter — mirrors isBpPlaceholderContent in
// BPWriteWithAIModal.tsx so a race-condition or bypassed client cannot leak
// assembler-placeholder strings into the seed. Defense-in-depth against the
// exact failure pattern TIM-3854 set out to prevent (feeding a placeholder
// to /improve produces a rewrite of the placeholder, then re-hallucinates).
function isPlaceholderExcerpt(content: string): boolean {
  return (
    content.includes("workspace to populate") ||
    content.includes("workspaces to populate") ||
    content.includes("Click Generate") ||
    content.includes("Complete the other") ||
    content.includes("Complete the Marketing") ||
    content.includes("Complete the Financials workspace") ||
    content.includes("click the text field") ||
    content.includes("rendered in the exported PDF appendix")
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    return await handleSeedContext(request);
  } catch (err) {
    // Rule 5 — sanitized error, no raw stack to the browser. Server-side
    // console-log is fine (Vercel captures it into the function logs).
    console.error("[business-plan/seed-context] uncaught", err);
    return Response.json({ error: "Failed to build seed context. Please try again." }, { status: 500 });
  }
}

async function handleSeedContext(request: NextRequest): Promise<Response> {
  const supabase = await createClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await enforceRateLimit({
    bucket: "business-plan:seed-context",
    id: user.id,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    // empty body is fine — sectionKey falls back below
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as RequestBody;

  const sectionKey = typeof body.sectionKey === "string" && body.sectionKey.trim().length > 0
    ? body.sectionKey.trim()
    : "executive-summary";

  const rawExcerpts = Array.isArray(body.bpSectionExcerpts) ? body.bpSectionExcerpts : [];
  const bpExcerpts = rawExcerpts
    .slice(0, MAX_BP_EXCERPTS)
    // Rule 3 — each element must be an object before we deref .title/.excerpt.
    // Prior version deref'd unconditionally, so a client sending
    // `bpSectionExcerpts: [null, 42, "oops"]` triggered a 500 with a raw
    // TypeError. Filter to objects first, then narrow field types.
    .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
    .map((e) => ({
      title: typeof e.title === "string" ? e.title.trim() : "",
      excerpt: typeof e.excerpt === "string" ? e.excerpt.trim().slice(0, MAX_BP_EXCERPT_CHARS) : "",
    }))
    .filter((e) => e.title.length > 0 && e.excerpt.length > 0)
    // TIM-3854 code-review fix: drop excerpts that ARE assembler placeholder
    // strings ("Complete the X workspace to populate this section"). The
    // client's bpOtherSectionsForContext memo filters these out today, but
    // a bypassed caller / race must not re-open the garbage-output hole.
    .filter((e) => !isPlaceholderExcerpt(e.excerpt));

  // Latest plan owned by this user — matches /generate route's plan resolution.
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "No plan found for this user" }, { status: 404 });
  }

  const planId = plan.id as string;

  // Rule 2 — RLS on every workspace table gates the reads to this user's
  // plan, but we filter by plan_id anyway so an accidental service-role
  // rebind doesn't leak someone else's rows.
  const [
    { data: conceptDoc },
    { data: marketingDoc },
    { data: menuRows },
    { data: locationRows },
    { data: equipmentRows },
    { data: hiringRows },
    { data: financialModel },
  ] = await Promise.all([
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "concept").maybeSingle(),
    supabase.from("workspace_documents").select("content").eq("plan_id", planId).eq("workspace_key", "marketing").maybeSingle(),
    supabase.from("menu_items_with_cogs").select("id, name, category_id, category_name, price_cents, archived").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("location_candidates").select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("buildout_equipment_items").select("id, name, cost_local, category, notes").eq("plan_id", planId).eq("archived", false).order("position"),
    supabase.from("hiring_plan_roles").select("id, role_title, headcount, start_date, monthly_cost_cents").eq("plan_id", planId).order("created_at"),
    supabase.from("financial_models").select("forecast_inputs, monthly_projections, startup_costs").eq("plan_id", planId).maybeSingle(),
  ]);

  // Currency is stored in financial_models.forecast_inputs.currency_code —
  // matches buildout/supplies pages and the /generate route's plan_state.
  const forecastInputs = (financialModel?.forecast_inputs ?? null) as
    | { currency_code?: unknown }
    | null;
  const currencyCode = typeof forecastInputs?.currency_code === "string"
    ? forecastInputs.currency_code
    : "USD";

  const workspaceBlocks = buildSeedBlocksForSection(sectionKey, {
    conceptContent: conceptDoc?.content,
    marketingContent: marketingDoc?.content,
    menuRows: (menuRows ?? []) as BpMenuItem[],
    locationRows: (locationRows ?? []) as BpLocationCandidate[],
    equipmentRows: (equipmentRows ?? []) as BpEquipmentItem[],
    hiringRows: (hiringRows ?? []) as BpHiringRole[],
    financialModel: financialModel as { forecast_inputs?: unknown; monthly_projections?: unknown; startup_costs?: unknown } | null,
    currencyCode,
  });

  // Executive Summary — ALSO include the populated BP sections the client
  // sent. They render as trailing blocks after the workspace blocks so
  // Concept/Financial anchor the seed and the BP sections layer on top.
  // `heading` is set so the block reads as "FROM YOUR <SECTION> DRAFT:"
  // instead of the ugly workspace-shaped default.
  //
  // BP excerpts are paragraph-shaped prose (multi-line, may start with `- `
  // if the founder wrote a list). We render each non-empty line as its own
  // "- <line>" bullet so the formatter's `\n`-join lays it out cleanly. If
  // the founder-authored line already starts with `- ` or `* `, strip the
  // marker first — otherwise we double-dash it to "- - Foo".
  const bpSectionBlocks: SeedBlock[] = sectionKey === "executive-summary"
    ? bpExcerpts.map((e, idx) => ({
        id: `bp-section:${idx}`,
        label: e.title,
        heading: `FROM YOUR ${e.title.toUpperCase()} DRAFT:`,
        bullets: e.excerpt
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => `- ${line.replace(/^[-*]\s+/, "")}`),
        isEmpty: false,
      }))
    : [];

  const blocks: SeedBlock[] = [...workspaceBlocks, ...bpSectionBlocks];

  const responseBody: ResponseBody = { blocks };
  return Response.json(responseBody);
}
