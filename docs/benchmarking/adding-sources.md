# Adding a benchmark source (Phase 0 — TIM-2447)

Operator runbook for the Benchmarking Suite. Plan: [TIM-2427](/TIM/issues/TIM-2427) revision 2.

## Quick reference

| What | Where |
| --- | --- |
| Source catalog (URLs + metrics) | `src/lib/benchmarking/sources.ts` |
| Per-pillar extraction prompts | `src/lib/benchmarking/prompts.ts` |
| Output zod schema (LLM contract) | `src/lib/benchmarking/schema.ts` |
| Pure-DI extraction core | `src/lib/benchmarking/extract.ts` |
| CLI entry point | `scripts/run-benchmark-extraction.mjs` |
| Tables (schema migration) | `supabase/migrations/20260607193721_tim2447_benchmarks_reference.sql` |
| Static seeds (metrics, cohorts, best-practices) | `supabase/seeds/tim2447_*.sql` |

## How the pipeline works

1. The CLI loads the source catalog from `sources.ts`.
2. For each source, it builds a prompt (per-pillar template from `prompts.ts`) injected with the allowed `metric_id` and `cohort_key` lists pulled live from the DB.
3. The prompt + `web_search` tool (max 4 uses per source) is sent to Sonnet 4.6.
4. The model returns a JSON payload — `parsePayload()` validates against zod (`ExtractedReferenceRowSchema` / `ExtractedBestPracticeRowSchema`).
5. Rows that fail zod or reference an unknown `metric_id` / `cohort_key` are dropped; the rejection count is logged on the run row.
6. Surviving rows are upserted into `benchmark_reference_values` / `benchmark_best_practices`. The unique constraint `(metric_id, cohort_id, source_url, extraction_date)` means same-day re-runs overwrite; quarterly re-runs land new dated rows.
7. One row per source is written to `benchmark_extraction_runs` with the status, rows upserted, USD cost, and any error.

## Adding a new source URL

1. Open `src/lib/benchmarking/sources.ts`.
2. Append an entry to `BENCHMARK_SOURCES`:
   ```ts
   {
     url: "https://example.com/coffee-shop-benchmarks",
     source_name: "Example Source — Coffee benchmarks 2026",
     metrics_covered: ["labor_pct_of_revenue", "total_cogs_pct"], // must exist in benchmark_metrics
     extraction_prompt_key: "labor",                                // matches a PILLAR_FOCUS key in prompts.ts
     cohort_filter: { model: "cafe" },                              // null if not cohort-specific
     notes: "Free-tier benchmark article series.",
   }
   ```
3. Confirm each `metrics_covered` key is in `supabase/seeds/tim2447_benchmark_metrics_seed.sql`. If you're adding a brand-new metric, also add it to the seed file and re-apply the seed.
4. Confirm each cohort key referenced in `cohort_filter` (or by the LLM) exists in `tim2447_benchmark_cohorts_seed.sql`.
5. Run the CLI dry against your `--source-filter`:
   ```bash
   node scripts/run-benchmark-extraction.mjs --env=prod --source-filter="example source" --max-cost-usd=0.50
   ```
6. Check `benchmark_extraction_runs` for the row written for your source. `status='succeeded'` means everything landed; `'partial'` means some rows were rejected (check `rows_rejected` and the run log).

## Picking the right `extraction_prompt_key`

| key | Use when source publishes... |
| --- | --- |
| `revenue_traffic` | AUV, ticket size, transactions/day, revenue/sqft |
| `cogs` | beverage COGS %, food COGS %, total COGS %, waste % |
| `labor` | labor %, sales per labor hour, wage rates, turnover % |
| `real_estate_fitout` | rent %, $/sqft rent or fit-out, lease length |
| `best_practices_only` | published industry guidelines / targets, not cohort observations |

If a source spans multiple pillars, pick the strongest fit — the metric allowlist constrains the model regardless of which prompt is chosen.

## Re-running quarterly (refresh cadence)

The dataset version is `YYYY.QN` (e.g. `2026.Q2`), computed from the run date by `datasetVersionForDate()`. To do a clean quarterly refresh:

```bash
node scripts/run-benchmark-extraction.mjs --env=prod --max-cost-usd=10
```

That re-runs every source, lands new rows with the new quarter's `extraction_date` (today) and new `dataset_version` (this quarter). Prior-quarter rows stay in the table — the cohort matcher can pin to a specific version if we ever need to roll back.

## Interpreting `extraction_confidence`

The LLM is told to set `extraction_confidence` per row:

- **high** — the source publishes a clean numeric range or percentile table directly.
- **medium** — inferred from prose with explicit numbers (default).
- **low** — inferred from soft phrasing or aggregated commentary; treat as a hint, not a target.

The Phase 1 cohort matcher should weight `high` rows heaviest, and ignore `low` rows when at least one higher-confidence row exists for the same `(metric_id, cohort_id)`.

## Cost cap

`--max-cost-usd` is a hard ceiling per run. When the running USD spend reaches the cap, the loop aborts before the next source's LLM call. Rows already inserted stay; the abort is captured in the CLI summary. Default `$5` per run is enough to walk the full Phase-0 catalog in normal operation (each source costs roughly $0.05-0.20 with `web_search` capped at 4 uses).

## What's NOT in this pipeline

- No paid data sources — per board direction 2026-06-07.
- No scraped tier-D sources (Yelp / Google / menu pages) — Phase 4.
- No platform-shared user data — Phase 5, gated on N=25 per cohort.
- No cohort matcher logic — that's Phase 1.
- No dashboard / UI surface — that's Phases 2-3.
