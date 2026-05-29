// TIM-1059: Suppliers & Vendors — AI seed + per-category improve.
//
// POST /api/workspaces/suppliers/seed { category }   → 3 ai_suggested candidates
// POST /api/workspaces/suppliers/seed { mode: "all" } → seeds every category
//
// Uses the Concept document (city, vibe, menu) to bias suggestions. Vendor
// names land in Title Case at the API boundary (TIM-1002).

export const runtime = "nodejs";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import { normalizeAIOutput } from "@/lib/normalize";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  VENDOR_CATEGORY_SUBTITLES,
  isVendorCategoryKey,
  type VendorCategoryKey,
} from "@/lib/suppliers";

const anthropic = new Anthropic();

type AiCandidate = {
  name: string;
  contact?: string;
  price_per_unit?: string;
  minimum_order?: string;
  lead_time?: string;
  notes?: string;
};

function conceptSummary(concept: unknown): string {
  if (!concept || typeof concept !== "object") return "An independent specialty coffee shop.";
  const c = concept as { components?: Record<string, { content?: string } | undefined> };
  const get = (key: string) =>
    typeof c.components?.[key]?.content === "string" ? (c.components![key]!.content as string).trim() : "";
  const vision = get("vision");
  const offering = get("offering");
  const location = get("location");
  const personas = get("personas");
  const parts = [
    vision && `Vision: ${vision}`,
    offering && `Offering: ${offering}`,
    location && `Location/city: ${location}`,
    personas && `Customers: ${personas}`,
  ].filter(Boolean);
  return parts.join("\n") || "An independent specialty coffee shop.";
}

async function generateCategoryCandidates(
  category: VendorCategoryKey,
  conceptDigest: string
): Promise<AiCandidate[]> {
  const label = VENDOR_CATEGORY_LABELS[category];
  const subtitle = VENDOR_CATEGORY_SUBTITLES[category];

  const prompt = `You are helping an independent specialty coffee shop owner draft a starting shortlist of ${label} vendors to research.

Shop context:
${conceptDigest}

Category: ${label} — ${subtitle}

Suggest 3 candidate vendors to research. Mix one well-known national/regional option, one specialty/local pick that fits the vibe, and one budget/utility option. Use placeholder text in fields the owner will fill in (e.g. "Request quote", "TBD by region"). Do NOT invent fake phone numbers or websites.

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
    notes: c.notes ? normalizeAIOutput(c.notes) : undefined,
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

  let body: { category?: string; mode?: string };
  try { body = await request.json(); } catch { body = {}; }

  const conceptDigest = await loadConceptDigest(supabase, plan.id);

  const categoriesToSeed: VendorCategoryKey[] =
    body.mode === "all"
      ? [...VENDOR_CATEGORY_KEYS]
      : isVendorCategoryKey(body.category)
        ? [body.category]
        : [];

  if (categoriesToSeed.length === 0) {
    return Response.json({ error: "Provide category or mode: 'all'" }, { status: 400 });
  }

  let totalInserted = 0;
  const results: { category: VendorCategoryKey; count: number }[] = [];

  for (const category of categoriesToSeed) {
    let candidates: AiCandidate[];
    try {
      candidates = await generateCategoryCandidates(category, conceptDigest);
    } catch {
      results.push({ category, count: 0 });
      continue;
    }
    if (candidates.length === 0) {
      results.push({ category, count: 0 });
      continue;
    }

    // Archive prior ai_suggested rows in this category before re-seeding so
    // re-seeding is idempotent and never duplicates AI output.
    await supabase
      .from("vendor_candidates")
      .delete()
      .eq("plan_id", plan.id)
      .eq("category", category)
      .eq("source", "ai_suggested");

    const { count } = await supabase
      .from("vendor_candidates")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id)
      .eq("category", category);

    const baseIndex = count ?? 0;
    const rows = candidates.map((c, idx) => ({
      plan_id: plan.id,
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
