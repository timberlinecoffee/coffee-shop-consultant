import type { SupabaseClient } from "@supabase/supabase-js"

export interface BenchmarkRow {
  category: string
  item_name_canonical: string
  price_cents_p25: number
  price_cents_p50: number
  price_cents_p75: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchPricingBenchmarks(regionKey: string, supabase: SupabaseClient<any>): Promise<string> {
  const { data, error } = await supabase
    .from("pricing_benchmarks")
    .select("category, item_name_canonical, price_cents_p25, price_cents_p50, price_cents_p75")
    .eq("region_key", regionKey)
    .order("category")
    .order("item_name_canonical")

  if (error || !data || data.length === 0) {
    return `## Pricing Benchmarks (${regionKey})\nNo benchmark data available for this region.`
  }

  const fmt$ = (cents: number) => `$${(cents / 100).toFixed(2)}`

  const lines = [
    `## Pricing Benchmarks — ${regionKey}`,
    "| item | p25 | p50 | p75 |",
    "| --- | --- | --- | --- |",
  ]

  for (const row of data as BenchmarkRow[]) {
    lines.push(
      `| ${row.item_name_canonical} (${row.category}) | ${fmt$(row.price_cents_p25)} | ${fmt$(row.price_cents_p50)} | ${fmt$(row.price_cents_p75)} |`,
    )
  }

  return lines.join("\n")
}
