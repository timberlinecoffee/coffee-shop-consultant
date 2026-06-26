-- TIM-2447: Benchmarking Phase 0 reference dataset foundation.
--
-- Five tables that back the Benchmarking Suite (parent: TIM-2427, plan rev 2):
--   1. benchmark_metrics          — catalog of every metric we benchmark.
--   2. benchmark_cohorts          — cohort definitions (model + size + geo + age + AUV + concept).
--   3. benchmark_reference_values — observation-level percentile / range rows from extraction.
--   4. benchmark_best_practices   — curated guideline rows (e.g. SCA labor % targets).
--   5. benchmark_extraction_runs  — internal log of pipeline runs (debugging / cost lens).
--
-- Standing rules (TIM-2242):
--   Rule 1 — RLS enabled on every table, deny-by-default.
--   Rule 2 — Service-role-only writes; the AI-extraction CLI runs as service role.
--   Authenticated reads enabled on the four data tables so the cohort matcher /
--   dashboard (Phase 1+) can serve users without proxying through an API route.
--   The extraction-runs log is internal-only (mirrors ai_turn_metrics TIM-2361).

-- ─── 1. benchmark_metrics ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmark_metrics (
  metric_key text PRIMARY KEY,
  pillar text NOT NULL CHECK (pillar IN (
    'revenue_traffic',
    'cogs',
    'labor',
    'real_estate_fitout',
    'equipment_throughput',
    'menu_pricing',
    'marketing_loyalty',
    'customer_experience'
  )),
  name text NOT NULL,
  unit text NOT NULL,
  direction_of_better text NOT NULL CHECK (direction_of_better IN ('higher', 'lower', 'range')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_metrics_authenticated_read"
  ON public.benchmark_metrics
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.benchmark_metrics IS
  'TIM-2447: Catalog of every benchmark metric. Read-only for authenticated; writes only via service role.';

-- ─── 2. benchmark_cohorts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmark_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key text NOT NULL UNIQUE,
  -- axes is a partial-match jsonb: { model, sqft_bucket, geo_tier, age_bucket, auv_tier, concept }.
  -- NULL fields mean "any value" so a cohort can be defined on a subset of axes.
  axes jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_cohorts_authenticated_read"
  ON public.benchmark_cohorts
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.benchmark_cohorts IS
  'TIM-2447: Cohort definitions (axes per plan rev 2 §5). Read-only for authenticated; writes only via service role.';

-- ─── 3. benchmark_reference_values ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmark_reference_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id text NOT NULL REFERENCES public.benchmark_metrics(metric_key) ON DELETE CASCADE,
  -- NULL cohort_id means "national / unbucketed" — the value applies broadly,
  -- not to a specific cohort slice. Best-practices use a separate table.
  cohort_id uuid REFERENCES public.benchmark_cohorts(id) ON DELETE SET NULL,
  value_type text NOT NULL CHECK (value_type IN ('percentile', 'range', 'guideline')),
  -- Percentile values (any subset can be NULL when the source only published some).
  p25 numeric,
  p50 numeric,
  p75 numeric,
  -- Range values (low/high of an interquartile-ish band when not a true percentile).
  low numeric,
  high numeric,
  sample_size integer,
  source_url text NOT NULL,
  source_name text NOT NULL,
  source_publication_date date,
  extraction_date date NOT NULL DEFAULT CURRENT_DATE,
  extraction_confidence text NOT NULL DEFAULT 'medium'
    CHECK (extraction_confidence IN ('high', 'medium', 'low')),
  dataset_version text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Idempotency key: a re-run on the same day for the same (metric, cohort, source)
  -- updates instead of inserts. Quarterly re-runs create new dated rows.
  -- Coalesce cohort_id to a sentinel so NULL participates in uniqueness.
  CONSTRAINT benchmark_reference_values_idempotency UNIQUE NULLS NOT DISTINCT
    (metric_id, cohort_id, source_url, extraction_date)
);

CREATE INDEX IF NOT EXISTS benchmark_reference_values_metric_cohort_idx
  ON public.benchmark_reference_values (metric_id, cohort_id);

CREATE INDEX IF NOT EXISTS benchmark_reference_values_version_date_idx
  ON public.benchmark_reference_values (dataset_version, extraction_date DESC);

ALTER TABLE public.benchmark_reference_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_reference_values_authenticated_read"
  ON public.benchmark_reference_values
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.benchmark_reference_values IS
  'TIM-2447: Observation rows from AI-extraction pipeline. Read-only for authenticated; service-role inserts only. Unique on (metric_id, cohort_id, source_url, extraction_date) for daily idempotency.';

-- ─── 4. benchmark_best_practices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmark_best_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id text NOT NULL REFERENCES public.benchmark_metrics(metric_key) ON DELETE CASCADE,
  -- Partial-axis match against benchmark_cohorts.axes; NULL = applies to all.
  -- e.g. {"model": "drive_thru"} = SCA labor target for drive-thru only.
  applicable_cohort_filter jsonb,
  guideline_low numeric,
  guideline_high numeric,
  guideline_target numeric,
  rationale text NOT NULL,
  source_url text NOT NULL,
  source_name text NOT NULL,
  source_publication_date date,
  extraction_date date NOT NULL DEFAULT CURRENT_DATE,
  dataset_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_best_practices_idempotency UNIQUE NULLS NOT DISTINCT
    (metric_id, applicable_cohort_filter, source_url, extraction_date)
);

CREATE INDEX IF NOT EXISTS benchmark_best_practices_metric_idx
  ON public.benchmark_best_practices (metric_id);

ALTER TABLE public.benchmark_best_practices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_best_practices_authenticated_read"
  ON public.benchmark_best_practices
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.benchmark_best_practices IS
  'TIM-2447: Curated industry guideline rows (e.g. SCA labor % targets). Read-only for authenticated; service-role inserts only.';

-- ─── 5. benchmark_extraction_runs (internal log) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.benchmark_extraction_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  source_url text NOT NULL,
  source_name text NOT NULL,
  model_used text NOT NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'succeeded', 'partial', 'failed')),
  rows_upserted integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  error_message text,
  cost_usd_estimate numeric(12, 6) NOT NULL DEFAULT 0,
  web_search_requests integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS benchmark_extraction_runs_status_started_idx
  ON public.benchmark_extraction_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS benchmark_extraction_runs_version_idx
  ON public.benchmark_extraction_runs (dataset_version, started_at DESC);

ALTER TABLE public.benchmark_extraction_runs ENABLE ROW LEVEL SECURITY;

-- Deny-by-default for authenticated; service-role bypasses RLS for inserts/reads.
-- Mirrors ai_turn_metrics (TIM-2361): internal cost/debug lens, not user-facing.
CREATE POLICY "benchmark_extraction_runs_deny_authenticated"
  ON public.benchmark_extraction_runs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.benchmark_extraction_runs IS
  'TIM-2447: Per-source AI-extraction run log. Service-role-only; authenticated reads denied. Captures status, rows_upserted, error_message, cost_usd_estimate per source-run.';
