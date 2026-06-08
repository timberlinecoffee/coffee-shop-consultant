-- TIM-2388: reconcile Beaver & Beef demo financials so total_raise and
-- use_of_funds.total agree.
--
-- Before this patch (seeded by TIM-1554):
--   funding_sources sum  = $250,000  (founder_equity $150k + loan $100k)
--   startup_costs   sum  = $244,000  (buildout $150k + equipment $50k + ...)
--
-- The BP audit + the per-section self-consistency proofreader
-- (TIM-2336/2343) flagged this as a contradiction because the LLM
-- narrative summed CapEx-inclusive figures to ~$405k under "use of funds"
-- while the structured total_raise was $250k.
--
-- This patch raises both sides to $405,000 — a realistic Inglewood 900 sqft
-- specialty coffee + sandwich shop opening cost (buildout, equipment,
-- working capital reserve through ramp) — so the board-facing demo plan is
-- internally consistent and the validator/audit do not flag it.
--
-- Owner: CTO (TIM-2388). Follow-up to TIM-2358.
-- Safe to re-run: jsonb_set overwrites the same fields each time.

do $$
declare
  demo_user_id uuid;
  demo_plan_id uuid;
  fm_id uuid;
  mp jsonb;
begin

  select id into demo_user_id
    from auth.users
   where email = 'trent@simpler.coffee'
   limit 1;

  if demo_user_id is null then
    raise exception 'User trent@simpler.coffee not found - is this the right environment?';
  end if;

  select id into demo_plan_id
    from public.coffee_shop_plans
   where user_id = demo_user_id
     and lower(plan_name) like '%beaver%'
   order by created_at desc
   limit 1;

  if demo_plan_id is null then
    raise exception 'Beaver & Beef plan not found for trent@simpler.coffee';
  end if;

  select id, monthly_projections into fm_id, mp
    from public.financial_models
   where plan_id = demo_plan_id
   limit 1;

  if fm_id is null then
    raise exception 'financial_models row not found for plan %', demo_plan_id;
  end if;

  -- Funding sources: $405,000 total raise (founder $155k + term loan $250k).
  -- BDC-style small business term loan, 60 months, 6.5% — preserves the
  -- existing rate/term and only adjusts the principal.
  mp := jsonb_set(
    mp,
    '{funding_sources}',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'funding:founder',
        'kind', 'founder_equity',
        'label', 'Founder Equity',
        'amount_cents', 15500000
      ),
      jsonb_build_object(
        'id', 'funding:loan',
        'kind', 'loan',
        'label', 'Bank Loan',
        'draw_month', 1,
        'term_months', 60,
        'amount_cents', 25000000,
        'annual_rate_pct', 6.5
      )
    ),
    true
  );

  -- Startup costs: $405,000 use-of-funds. Realistic for a 900 sqft buildout
  -- in Inglewood Calgary with bar millwork, 200A electrical, espresso plumbing,
  -- HVAC reuse, paint and floor. Equipment line backs the buildout_equipment_items
  -- patch (~$41,650 of itemized gear) with buffer for misc smallwares.
  mp := jsonb_set(mp, '{startup_costs,buildout_cents}',                to_jsonb(22500000::bigint), true);
  mp := jsonb_set(mp, '{startup_costs,equipment_cents}',               to_jsonb(5500000::bigint),  true);
  mp := jsonb_set(mp, '{startup_costs,deposits_cents}',                to_jsonb(900000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,licenses_cents}',                to_jsonb(750000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,initial_inventory_cents}',       to_jsonb(800000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,startup_supplies_cents}',        to_jsonb(350000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,professional_fees_cents}',       to_jsonb(850000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,opening_cash_buffer_cents}',     to_jsonb(4000000::bigint),  true);
  mp := jsonb_set(mp, '{startup_costs,pre_opening_marketing_cents}',   to_jsonb(600000::bigint),   true);
  mp := jsonb_set(mp, '{startup_costs,working_capital_reserve_cents}', to_jsonb(4250000::bigint),  true);

  update public.financial_models
     set monthly_projections = mp,
         updated_at = now()
   where id = fm_id;

  raise notice 'Reconciled financials for plan %: funding_sources=$405,000, startup_costs=$405,000',
    demo_plan_id;

end $$;
