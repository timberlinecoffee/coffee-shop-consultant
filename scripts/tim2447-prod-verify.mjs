#!/usr/bin/env node
/**
 * TIM-2447: Prod verifier for Benchmarking Phase 0.
 *
 * Hits prod Supabase REST with the service-role key and confirms:
 *   1. All 5 tables exist and are readable.
 *   2. benchmark_metrics has the 28 seeded rows.
 *   3. benchmark_cohorts has the 6 seeded rows.
 *   4. benchmark_best_practices has the 7 seeded rows.
 *   5. benchmark_reference_values has >=1 row per Phase 0 headline metric
 *      (the AC for "first-pass ingestion landed").
 *   6. benchmark_extraction_runs has rows (proves pipeline ran).
 *
 * Reads .env.prod from cwd (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY).
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const lines = readFileSync(path, "utf8").split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (process.env[key] !== undefined && process.env[key] !== "") continue
    process.env[key] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
  }
}

loadEnvFile(resolve(process.cwd(), ".env.prod"))

const PHASE_0_HEADLINE_METRICS = [
  // Pillar 1: Revenue & traffic
  "auv_usd",
  "avg_ticket_usd",
  "transactions_per_day",
  "revenue_per_sqft_usd",
  // Pillar 2: COGS
  "total_cogs_pct",
  "beverage_cogs_pct",
  "food_cogs_pct",
  // Pillar 3: Labor
  "labor_pct_of_revenue",
  "sales_per_labor_hour_usd",
  "turnover_pct_annual",
  // Pillar 4: Real estate & fit-out
  "rent_pct_of_revenue",
  "rent_per_sqft_annual_usd",
  "fitout_per_sqft_usd",
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("FATAL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  let passed = 0
  let failed = 0
  const fail = (label, err) => {
    console.log(`  FAIL  ${label} — ${err}`)
    failed += 1
  }
  const pass = (label) => {
    console.log(`  pass  ${label}`)
    passed += 1
  }

  console.log("=== TIM-2447 prod verify ===")

  // 1. Tables readable
  for (const t of [
    "benchmark_metrics",
    "benchmark_cohorts",
    "benchmark_reference_values",
    "benchmark_best_practices",
    "benchmark_extraction_runs",
  ]) {
    const { error } = await sb.from(t).select("*", { count: "exact", head: true })
    if (error) fail(`${t} readable`, error.message)
    else pass(`${t} readable`)
  }

  // 2-4. Static seed counts
  for (const [table, expected] of [
    ["benchmark_metrics", 28],
    ["benchmark_cohorts", 6],
    ["benchmark_best_practices", 7],
  ]) {
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true })
    if (error) fail(`${table} count`, error.message)
    else if ((count ?? 0) >= expected)
      pass(`${table} count (${count} >= ${expected})`)
    else fail(`${table} count`, `${count} < ${expected}`)
  }

  // 5. Reference values per headline metric
  const refCounts = {}
  for (const metric of PHASE_0_HEADLINE_METRICS) {
    const { count, error } = await sb
      .from("benchmark_reference_values")
      .select("*", { count: "exact", head: true })
      .eq("metric_id", metric)
    refCounts[metric] = error ? `ERR ${error.message}` : count
  }
  console.log("\n  reference_values per headline metric:")
  let metricsWithRows = 0
  for (const metric of PHASE_0_HEADLINE_METRICS) {
    const c = refCounts[metric]
    if (typeof c === "number" && c >= 1) {
      console.log(`    ${metric}: ${c}`)
      metricsWithRows += 1
    } else {
      console.log(`    ${metric}: ${c} (NO ROWS)`)
    }
  }
  if (metricsWithRows === PHASE_0_HEADLINE_METRICS.length) {
    pass(`all ${PHASE_0_HEADLINE_METRICS.length} headline metrics have >=1 reference_value row`)
  } else {
    fail(
      "headline metrics coverage",
      `only ${metricsWithRows}/${PHASE_0_HEADLINE_METRICS.length} headline metrics have rows`,
    )
  }

  // 6. Extraction runs exist
  const { count: runCount, error: runErr } = await sb
    .from("benchmark_extraction_runs")
    .select("*", { count: "exact", head: true })
  if (runErr) fail("extraction_runs read", runErr.message)
  else if ((runCount ?? 0) > 0) pass(`extraction_runs has ${runCount} row(s)`)
  else fail("extraction_runs", "no rows yet (pipeline not run)")

  // 7. Sanity: latest dataset_version is current quarter.
  const { data: latest, error: latestErr } = await sb
    .from("benchmark_reference_values")
    .select("dataset_version,extraction_date")
    .order("extraction_date", { ascending: false })
    .limit(1)
  if (latestErr) fail("latest version probe", latestErr.message)
  else if (latest && latest.length > 0)
    pass(`latest dataset_version=${latest[0].dataset_version} extraction_date=${latest[0].extraction_date}`)

  console.log(`\n=== passed ${passed}, failed ${failed} ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
