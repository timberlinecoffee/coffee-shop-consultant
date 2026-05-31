-- TIM-1498: Rekey business_plan_sections to the v3 two-level section taxonomy.
--
-- Old keys (snake_case, TIM-1037)        ->  New keys (kebab-case, TIM-1498)
--   executive_summary                    ->  executive-summary             (rename)
--   company_concept                      ->  company-overview              (rename)
--   market_analysis                      ->  opportunity-target-market     (rename; new
--                                            Problem & Solution and Competition rows
--                                            are not created here -- user-fillable)
--   location_real_estate                 ->  execution-operations          (merge target)
--   buildout_equipment                   ->  execution-operations          (merge target)
--   menu_pricing                         ->  execution-marketing-sales     (merge target)
--   marketing_plan                       ->  execution-marketing-sales     (merge target)
--   operations_launch                    ->  execution-milestones-metrics  (rename)
--   team_hiring                          ->  company-team                  (rename)
--   financial_plan                       ->  financial-plan-statements     (rename;
--                                            TIM-1496 will refine substructure)
--   funding_request                      ->  financial-plan-financing      (rename)
--
-- For many-to-one merges, existing user_content is concatenated under
-- `## <old section name>` headings so no founder writing is lost.

BEGIN;

-- 1. Defensive archive table (idempotent). Snapshot every row before we touch
--    anything, so this migration is fully reversible from the DB if needed.
CREATE TABLE IF NOT EXISTS business_plan_sections_archive (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL,
  plan_id         uuid NOT NULL,
  section_key     text NOT NULL,
  user_content    text,
  is_visible      boolean NOT NULL,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  archived_at     timestamptz NOT NULL DEFAULT now(),
  archive_reason  text NOT NULL
);

CREATE INDEX IF NOT EXISTS business_plan_sections_archive_plan_id_idx
  ON business_plan_sections_archive (plan_id);

INSERT INTO business_plan_sections_archive (
  source_id, plan_id, section_key, user_content, is_visible,
  source_created_at, source_updated_at, archive_reason
)
SELECT id, plan_id, section_key, user_content, is_visible,
       created_at, updated_at,
       'tim1498_v3_section_taxonomy_pre_migration'
FROM business_plan_sections;

-- 2. Apply the migration inside a single DO block so the row counts can be
--    reported via RAISE NOTICE.
DO $$
DECLARE
  v_total_before        bigint;
  v_merged_operations   bigint;
  v_merged_marketing    bigint;
  v_renamed             bigint;
  v_total_after         bigint;
BEGIN
  SELECT count(*) INTO v_total_before FROM business_plan_sections;

  ----------------------------------------------------------------------------
  -- 2a. Build merged Execution > Operations rows from location_real_estate +
  --     buildout_equipment. For each plan_id that has either source row,
  --     create a single execution-operations row with content concatenated
  --     under `## Location & Real Estate` / `## Equipment & Supplies`
  --     headings. is_visible is OR'd across sources (visible if any source
  --     was visible). created_at is the earliest of the sources.
  ----------------------------------------------------------------------------
  WITH src AS (
    SELECT
      plan_id,
      max(CASE WHEN section_key = 'location_real_estate' THEN user_content END)  AS loc_content,
      bool_or(CASE WHEN section_key = 'location_real_estate' THEN is_visible END) AS loc_visible,
      max(CASE WHEN section_key = 'buildout_equipment'   THEN user_content END)  AS eq_content,
      bool_or(CASE WHEN section_key = 'buildout_equipment'   THEN is_visible END) AS eq_visible,
      min(created_at) FILTER (WHERE section_key IN ('location_real_estate','buildout_equipment')) AS earliest_created
    FROM business_plan_sections
    WHERE section_key IN ('location_real_estate','buildout_equipment')
    GROUP BY plan_id
  ),
  merged AS (
    SELECT
      plan_id,
      nullif(
        trim(both E'\n' FROM
          coalesce(CASE WHEN loc_content IS NOT NULL AND length(loc_content) > 0
                          THEN E'## Location & Real Estate\n' || loc_content
                        ELSE '' END, '') ||
          CASE WHEN loc_content IS NOT NULL AND length(loc_content) > 0
                AND eq_content  IS NOT NULL AND length(eq_content)  > 0
               THEN E'\n\n' ELSE '' END ||
          coalesce(CASE WHEN eq_content IS NOT NULL AND length(eq_content) > 0
                          THEN E'## Equipment & Supplies\n' || eq_content
                        ELSE '' END, '')
        ),
        ''
      ) AS merged_content,
      coalesce(loc_visible, true) OR coalesce(eq_visible, true) AS merged_visible,
      coalesce(earliest_created, now()) AS created_ts
    FROM src
  )
  INSERT INTO business_plan_sections (plan_id, section_key, user_content, is_visible, created_at, updated_at)
  SELECT plan_id, 'execution-operations', merged_content, merged_visible, created_ts, now()
  FROM merged
  ON CONFLICT (plan_id, section_key)
    DO UPDATE SET
      user_content = COALESCE(business_plan_sections.user_content, EXCLUDED.user_content),
      is_visible   = business_plan_sections.is_visible OR EXCLUDED.is_visible,
      updated_at   = now();
  GET DIAGNOSTICS v_merged_operations = ROW_COUNT;

  ----------------------------------------------------------------------------
  -- 2b. Same shape for Execution > Marketing & Sales from menu_pricing +
  --     marketing_plan.
  ----------------------------------------------------------------------------
  WITH src AS (
    SELECT
      plan_id,
      max(CASE WHEN section_key = 'menu_pricing'    THEN user_content END)  AS menu_content,
      bool_or(CASE WHEN section_key = 'menu_pricing'    THEN is_visible END) AS menu_visible,
      max(CASE WHEN section_key = 'marketing_plan'  THEN user_content END)  AS mkt_content,
      bool_or(CASE WHEN section_key = 'marketing_plan'  THEN is_visible END) AS mkt_visible,
      min(created_at) FILTER (WHERE section_key IN ('menu_pricing','marketing_plan')) AS earliest_created
    FROM business_plan_sections
    WHERE section_key IN ('menu_pricing','marketing_plan')
    GROUP BY plan_id
  ),
  merged AS (
    SELECT
      plan_id,
      nullif(
        trim(both E'\n' FROM
          coalesce(CASE WHEN menu_content IS NOT NULL AND length(menu_content) > 0
                          THEN E'## Menu & Pricing\n' || menu_content
                        ELSE '' END, '') ||
          CASE WHEN menu_content IS NOT NULL AND length(menu_content) > 0
                AND mkt_content  IS NOT NULL AND length(mkt_content)  > 0
               THEN E'\n\n' ELSE '' END ||
          coalesce(CASE WHEN mkt_content IS NOT NULL AND length(mkt_content) > 0
                          THEN E'## Marketing Plan\n' || mkt_content
                        ELSE '' END, '')
        ),
        ''
      ) AS merged_content,
      coalesce(menu_visible, true) OR coalesce(mkt_visible, true) AS merged_visible,
      coalesce(earliest_created, now()) AS created_ts
    FROM src
  )
  INSERT INTO business_plan_sections (plan_id, section_key, user_content, is_visible, created_at, updated_at)
  SELECT plan_id, 'execution-marketing-sales', merged_content, merged_visible, created_ts, now()
  FROM merged
  ON CONFLICT (plan_id, section_key)
    DO UPDATE SET
      user_content = COALESCE(business_plan_sections.user_content, EXCLUDED.user_content),
      is_visible   = business_plan_sections.is_visible OR EXCLUDED.is_visible,
      updated_at   = now();
  GET DIAGNOSTICS v_merged_marketing = ROW_COUNT;

  ----------------------------------------------------------------------------
  -- 2c. Delete the source rows that fed the merges. (They have been archived
  --     above and their content is now part of the merged target rows.)
  ----------------------------------------------------------------------------
  DELETE FROM business_plan_sections
  WHERE section_key IN (
    'location_real_estate', 'buildout_equipment',
    'menu_pricing',         'marketing_plan'
  );

  ----------------------------------------------------------------------------
  -- 2d. Straight renames. UPDATE is safe here because each old key maps to a
  --     distinct new key with no collision (we already deleted merge sources
  --     and there are no pre-existing kebab-case rows because this migration
  --     introduces them).
  ----------------------------------------------------------------------------
  UPDATE business_plan_sections
  SET section_key = CASE section_key
        WHEN 'executive_summary'  THEN 'executive-summary'
        WHEN 'company_concept'    THEN 'company-overview'
        WHEN 'market_analysis'    THEN 'opportunity-target-market'
        WHEN 'operations_launch'  THEN 'execution-milestones-metrics'
        WHEN 'team_hiring'        THEN 'company-team'
        WHEN 'financial_plan'     THEN 'financial-plan-statements'
        WHEN 'funding_request'    THEN 'financial-plan-financing'
        ELSE section_key
      END,
      updated_at = now()
  WHERE section_key IN (
    'executive_summary', 'company_concept', 'market_analysis',
    'operations_launch', 'team_hiring',
    'financial_plan',    'funding_request'
  );
  GET DIAGNOSTICS v_renamed = ROW_COUNT;

  SELECT count(*) INTO v_total_after FROM business_plan_sections;

  RAISE NOTICE 'TIM-1498 migration: rows_before=%, merged_operations=%, merged_marketing=%, renamed=%, rows_after=%',
    v_total_before, v_merged_operations, v_merged_marketing, v_renamed, v_total_after;
END
$$;

-- 3. Defensive check: at this point no snake_case section keys should remain.
DO $$
DECLARE
  v_leftover bigint;
BEGIN
  SELECT count(*) INTO v_leftover FROM business_plan_sections
  WHERE section_key IN (
    'executive_summary', 'company_concept', 'market_analysis',
    'location_real_estate', 'buildout_equipment',
    'menu_pricing', 'marketing_plan',
    'operations_launch', 'team_hiring',
    'financial_plan', 'funding_request'
  );
  IF v_leftover > 0 THEN
    RAISE EXCEPTION 'TIM-1498 migration failed: % rows still on old keys', v_leftover;
  END IF;
END
$$;

COMMIT;
