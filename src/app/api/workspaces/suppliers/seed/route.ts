// TIM-1059: Suppliers & Vendors — AI seed + per-category improve.
// TIM-1414: Persistent "more suggestions" button — append mode adds new AI
// rows without wiping prior ones; supports custom categories.
//
// POST /api/workspaces/suppliers/seed { category }                  → 3 ai_suggested candidates (replaces existing AI rows)
// POST /api/workspaces/suppliers/seed { category, mode: "append" }  → 3 fresh AI rows appended; existing rows untouched
// POST /api/workspaces/suppliers/seed { mode: "all" }               → seeds every seeded category (replaces existing AI rows)
//
// Uses the Concept document (city, vibe, menu) to bias suggestions. Vendor
// names land in Title Case at the API boundary (TIM-1002).

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_CATEGORY_SUBTITLES,
  isCustomCategoryKey,
  isSeededCategoryKey,
  isVendorCategoryId,
  type VendorCategoryId,
  type VendorCategoryKey,
} from "@/lib/suppliers";
import { normalizeConceptV2 } from "@/lib/concept";

const anthropic = new Anthropic();

type AiCandidate = {
  name: string;
  contact?: string;
  price_per_unit?: string;
  minimum_order?: string;
  lead_time?: string;
  notes?: string;
};

// TIM-1406: V1/V2-safe via normalizer so the digest is non-empty for fresh-
// from-onboarding plans where workspace_documents still holds the V1 shape.
function conceptSummary(concept: unknown): string {
  const doc = normalizeConceptV2(concept);
  const vision = doc.components.vision.content.trim();
  const offering = doc.components.offering.content.trim();
  const location = doc.components.location.content.trim();
  const targetCustomer = doc.components.target_customer.content.trim();
  const parts = [
    vision && `Vision: ${vision}`,
    offering && `Offering: ${offering}`,
    location && `Location/city: ${location}`,
    targetCustomer && `Customers: ${targetCustomer}`,
  ].filter(Boolean);
  return parts.join("\n") || "An independent specialty coffee shop.";
}

async function generateCategoryCandidates(
  category: VendorCategoryId,
  label: string,
  subtitle: string,
  conceptDigest: string,
  existingNames: string[] = []
): Promise<AiCandidate[]> {
  void category;
  const avoidLine = existingNames.length
    ? `\n- Do NOT repeat any of these vendors (already in the list): ${existingNames.slice(0, 20).join(", ")}.`
    : "";

  const prompt = `You are helping an independent specialty coffee shop owner draft a starting shortlist of ${label} vendors to research.

Shop context:
${conceptDigest}

Category: ${label} — ${subtitle}

Suggest 3 candidate vendors to research. Mix one well-known national/regional option, one specialty/local pick that fits the vibe, and one budget/utility option. Use placeholder text in fields the owner will fill in (e.g. "Request quote", "TBD by region"). Do NOT invent fake phone numbers or websites.${avoidLine}

Respond with JSON only (no markdown fences), shape:
{
  "candidates": [
    {
      "name": "Vendor name in Title Case",
      "contact": "website or 'Request quote' if unknown",
      "price_per_unit": "rough price band, e.g. \\"$18-$22 / lb\\" or 'Request quote'",
      "minimum_order": "e.g. '5 lb', '1 case', 'None'",
      "lead_time": "e.g. '3-5 days', 'Weekly delivery'",
      "notes": "one sentence on why this might fit the shop"
    }
  ]
}

Rules:
- No emojis.
- Founder voice — no "leverage", "synergy", "passionate", "curated".
- "name" must be Title Case (each word capitalized except articles/short prepositions).
- Exactly 3 candidates.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const parsed = JSON.parse(text) as { candidates?: AiCandidate[] };
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates.slice(0, 3) : [];
  return candidates.map((c) => ({
    name: toTitleCase(c.name ?? ""),
    contact: c.contact ?? undefined,
    price_per_unit: c.price_per_unit ?? undefined,
    minimum_order: c.minimum_order ?? undefined,
    lead_time: c.lead_time ?? undefined,
    notes: c.notes ?? undefined,
  }));
}

async function loadConceptDigest(supabase: Awaited<ReturnType<typeof createClient>>, planId: string) {
  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "concept")
    .maybeSingle();
  return conceptSummary(doc?.content);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();
  if (!profile || (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });
  const planId: string = plan.id;

  let body: { category?: string; mode?: string };
  try { body = await request.json(); } catch { body = {}; }

  const conceptDigest = await loadConceptDigest(supabase, planId);
  const append = body.mode === "append";

  // Resolve label/subtitle for custom categories from the DB.
  async function resolveMeta(cat: VendorCategoryId): Promise<{ label: string; subtitle: string } | null> {
    if (isSeededCategoryKey(cat)) {
      return { label: VENDOR_CATEGORY_LABELS[cat], subtitle: VENDOR_CATEGORY_SUBTITLES[cat] };
    }
    const { data } = await supabase
      .from("vendor_custom_categories")
      .select("label")
      .eq("plan_id", planId)
      .eq("key", cat)
      .maybeSingle();
    if (!data) return null;
    return { label: data.label as string, subtitle: `Custom category for your shop.` };
  }

  const categoriesToSeed: VendorCategoryId[] =
    body.mode === "all"
      ? [...VENDOR_CATEGORY_KEYS]
      : isVendorCategoryId(body.category)
        ? [body.category as VendorCategoryId]
        : [];

  if (categoriesToSeed.length === 0) {
    return Response.json({ error: "Provide category or mode: 'all'" }, { status: 400 });
  }

  // Validate custom keys belong to this plan.
  for (const c of categoriesToSeed) {
    if (isCustomCategoryKey(c) && !isSeededCategoryKey(c)) {
      const { data } = await supabase
        .from("vendor_custom_categories")
        .select("id")
        .eq("plan_id", planId)
        .eq("key", c)
        .maybeSingle();
      if (!data) return Response.json({ error: "Unknown custom category" }, { status: 400 });
    }
  }

  let totalInserted = 0;
  const results: { category: VendorCategoryId; count: number }[] = [];

  for (const category of categoriesToSeed) {
    const meta = await resolveMeta(category);
    if (!meta) {
      results.push({ category, count: 0 });
      continue;
    }

    // For append mode, fetch existing names so the prompt can avoid duplicates.
    let existingNames: string[] = [];
    if (append) {
      const { data: rows } = await supabase
        .from("vendor_candidates")
        .select("name")
        .eq("plan_id", planId)
        .eq("category", category);
      existingNames = (rows ?? [])
        .map((r) => (r.name as string) ?? "")
        .filter((n) => n.trim().length > 0);
    }

    let candidates: AiCandidate[];
    try {
      candidates = await generateCategoryCandidates(category, meta.label, meta.subtitle, conceptDigest, existingNames);
    } catch {
      results.push({ category, count: 0 });
      continue;
    }
    if (candidates.length === 0) {
      results.push({ category, count: 0 });
      continue;
    }

    if (!append) {
      // Replace prior ai_suggested rows in this category before re-seeding so
      // re-seeding is idempotent and never duplicates AI output.
      await supabase
        .from("vendor_candidates")
        .delete()
        .eq("plan_id", planId)
        .eq("category", category)
        .eq("source", "ai_suggested");
    }

    const { count } = await supabase
      .from("vendor_candidates")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId)
      .eq("category", category);

    const baseIndex = count ?? 0;
    const rows = candidates.map((c, idx) => ({
      plan_id: planId,
      category,
      name: c.name,
      contact: c.contact ?? null,
      price_per_unit: c.price_per_unit ?? null,
      minimum_order: c.minimum_order ?? null,
      lead_time: c.lead_time ?? null,
      notes: c.notes ?? null,
      status: "researching" as const,
      source: "ai_suggested" as const,
      position: baseIndex + idx,
    }));

    const { data: inserted } = await supabase
      .from("vendor_candidates")
      .insert(rows)
      .select("id");
    const inc = inserted?.length ?? 0;
    totalInserted += inc;
    results.push({ category, count: inc });
  }

  return Response.json({ inserted: totalInserted, results });
}
