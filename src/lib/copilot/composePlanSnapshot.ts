import type { WorkspaceKey } from "@/types/supabase"
import type { SupabaseClient } from "@supabase/supabase-js"

const TOKEN_CHARS = 4 // rough chars-per-token
const MAX_CHARS_PER_WORKSPACE = 600 * TOKEN_CHARS // ~600 tokens

// Items shown in digest before switching to top/bottom-3 summary
const FULL_LIST_THRESHOLD = 10

export async function composePlanSnapshot(
  planId: string,
  currentWorkspace: WorkspaceKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<{ snapshot: string; estimatedTokens: number; truncated?: boolean; regionBenchmarkSet?: string }> {
  if (currentWorkspace === "menu_pricing") {
    return composeMenuPricingSnapshot(planId, supabase)
  }

  const { data: docs } = await supabase
    .from("workspace_documents")
    .select("workspace_key, content")
    .eq("plan_id", planId)

  if (!docs || docs.length === 0) {
    return { snapshot: "No workspace documents yet.", estimatedTokens: 10 }
  }

  const sections: string[] = []
  for (const doc of docs) {
    const isCurrent = doc.workspace_key === currentWorkspace
    const label = isCurrent
      ? `**${doc.workspace_key.replace(/_/g, " ")} (current workspace)**`
      : doc.workspace_key.replace(/_/g, " ")
    const raw = JSON.stringify(doc.content)
    const body =
      raw.length > MAX_CHARS_PER_WORKSPACE
        ? raw.slice(0, MAX_CHARS_PER_WORKSPACE) + "… [truncated]"
        : raw
    sections.push(`### ${label}\n${body}`)
  }

  const snapshot = sections.join("\n\n")
  return { snapshot, estimatedTokens: Math.ceil(snapshot.length / TOKEN_CHARS) }
}

// ── Menu & Pricing snapshot ───────────────────────────────────────────────────

interface MenuItem {
  name: string
  category: string
  price_cents: number
  cogs_cents: number
  expected_mix_pct: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function composeMenuPricingSnapshot(planId: string, supabase: SupabaseClient<any>) {
  const [itemsResult, docResult] = await Promise.all([
    supabase
      .from("menu_items")
      .select("name, category, price_cents, cogs_cents, expected_mix_pct")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "menu_pricing")
      .maybeSingle(),
  ])

  const items: MenuItem[] = itemsResult.data ?? []
  const docContent = (docResult.data?.content as Record<string, unknown>) ?? {}

  const pricingTier = (docContent.pricing_tier as string) ?? null
  const targetAvgMarginPct = (docContent.target_avg_margin_pct as number) ?? null
  const regionBenchmarkSet = (docContent.region_benchmark_set as string) ?? null

  // ── Compute digest stats ──────────────────────────────────────────────────

  const active = items.filter((i) => i.price_cents > 0)
  const itemCount = active.length

  let meanPriceCents = 0
  let meanMarginPctStr = "0.0"
  let weightedMarginPctStr = "0.0"

  if (itemCount > 0) {
    const marginPcts = active.map((i) => ((i.price_cents - i.cogs_cents) / i.price_cents) * 100)

    meanPriceCents = Math.round(active.reduce((s, i) => s + i.price_cents, 0) / itemCount)
    meanMarginPctStr = (marginPcts.reduce((s, v) => s + v, 0) / itemCount).toFixed(1)

    const totalMix = active.reduce((s, i) => s + Number(i.expected_mix_pct), 0)
    if (totalMix > 0) {
      weightedMarginPctStr = (
        active.reduce((s, i, idx) => s + marginPcts[idx] * Number(i.expected_mix_pct), 0) / totalMix
      ).toFixed(1)
    } else {
      weightedMarginPctStr = meanMarginPctStr
    }
  }

  // ── Top-3 / worst-3 by margin ─────────────────────────────────────────────

  const withMargin = active.map((i) => ({
    ...i,
    margin_pct_str: (((i.price_cents - i.cogs_cents) / i.price_cents) * 100).toFixed(1),
    margin_pct_num: ((i.price_cents - i.cogs_cents) / i.price_cents) * 100,
  }))
  const sorted = [...withMargin].sort((a, b) => b.margin_pct_num - a.margin_pct_num)
  const best3 = sorted.slice(0, 3)
  const worst3 = sorted.slice(-3).reverse()

  // ── Determine truncation ──────────────────────────────────────────────────

  const truncated = itemCount > FULL_LIST_THRESHOLD

  // ── Build snapshot text ───────────────────────────────────────────────────

  const fmt$ = (cents: number) => `$${(cents / 100).toFixed(2)}`

  const digestLine = [
    `item_count=${itemCount}`,
    `mean_price=${fmt$(meanPriceCents)}`,
    `mean_margin=${meanMarginPctStr}%`,
    `weighted_margin=${weightedMarginPctStr}%`,
    truncated ? "truncated=true" : null,
  ]
    .filter(Boolean)
    .join(", ")

  const settings = [
    pricingTier ? `pricing_tier=${pricingTier}` : null,
    targetAvgMarginPct != null ? `target_avg_margin=${targetAvgMarginPct}%` : null,
    regionBenchmarkSet ? `region=${regionBenchmarkSet}` : null,
  ]
    .filter(Boolean)
    .join(", ")

  const lines: string[] = [
    "### menu pricing (current workspace)",
    `_digest: ${digestLine}`,
  ]

  if (settings) {
    lines.push(settings)
  }

  if (itemCount === 0) {
    lines.push("No menu items yet.")
  } else if (!truncated) {
    lines.push("")
    lines.push("**All items** (name, price, margin):")
    for (const item of sorted) {
      lines.push(`- ${item.name} (${item.category}): ${fmt$(item.price_cents)}, ${item.margin_pct_str}%`)
    }
  } else {
    lines.push("")
    lines.push("**Top-3 margin:**")
    for (const item of best3) {
      lines.push(`- ${item.name}: ${fmt$(item.price_cents)}, ${item.margin_pct_str}%`)
    }
    lines.push("")
    lines.push("**Bottom-3 margin:**")
    for (const item of worst3) {
      lines.push(`- ${item.name}: ${fmt$(item.price_cents)}, ${item.margin_pct_str}% (mix ${item.expected_mix_pct}%)`)
    }
  }

  const snapshot = lines.join("\n")

  // Hard-cap to budget even in pathological cases
  const capped =
    snapshot.length > MAX_CHARS_PER_WORKSPACE
      ? snapshot.slice(0, MAX_CHARS_PER_WORKSPACE) + "… [truncated]"
      : snapshot

  return {
    snapshot: capped,
    estimatedTokens: Math.ceil(capped.length / TOKEN_CHARS),
    truncated,
    regionBenchmarkSet: regionBenchmarkSet ?? undefined,
  }
}
