-- Staging demo data: idempotent seed for board walkthroughs.
--
-- Creates one demo owner with the 'concept' workspace complete and the
-- 'financials' workspace in progress, AI coach conversation history, a
-- Pro subscription, financial model + equipment list, and a couple of
-- milestones. Safe to re-run.
--
-- Owner: CTO (TIM-567 → schema refreshed for TIM-627 / TIM-652).
-- Run via: psql or Supabase SQL editor against the staging project.

do $$
declare
  demo_user_id  uuid := '11111111-1111-1111-1111-111111111111';
  demo_email    text := 'demo.owner@timberline.coffee';
  demo_password text := 'TimberlineDemo2026!';
  demo_plan_id  uuid := '22222222-2222-2222-2222-222222222222';
begin
  -- 1. auth.users (idempotent upsert). password_hash uses bcrypt.
  --    auth.users.confirmed_at is a generated column in current Supabase
  --    schema, so it is NOT inserted/updated explicitly.
  --    GoTrue v2.189+ requires non-NULL token strings; insert empty strings
  --    rather than relying on column defaults.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_super_admin, is_sso_user, is_anonymous,
    confirmation_token, recovery_token, email_change_token_new,
    email_change, email_change_token_current, reauthentication_token,
    phone_change, phone_change_token
  ) values (
    demo_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', demo_email,
    crypt(demo_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name','Maya Chen','signup_source','staging_seed'),
    now() - interval '14 days', now(),
    false, false, false,
    '','','','','','','',''
  )
  on conflict (id) do update set
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    email_change_token_current = '',
    reauthentication_token = '',
    phone_change = '',
    phone_change_token = '',
    updated_at         = now();

  -- 2. auth.identities row so email/password login resolves the identity.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    demo_user_id, demo_user_id, 'email', demo_user_id::text,
    jsonb_build_object(
      'sub', demo_user_id::text,
      'email', demo_email,
      'email_verified', true,
      'phone_verified', false,
      'signup_source', 'staging_seed'
    ),
    now(), now() - interval '14 days', now()
  )
  on conflict (provider, provider_id) do update set
    identity_data   = excluded.identity_data,
    last_sign_in_at = excluded.last_sign_in_at,
    updated_at      = now();

  -- 3. public.users — Pro tier (TIM-627 rename from 'accelerator').
  insert into public.users (
    id, email, full_name, signup_source, subscription_status,
    subscription_tier, ai_credits_remaining, target_opening_date,
    readiness_score, onboarding_completed, onboarding_data
  ) values (
    demo_user_id, demo_email, 'Maya Chen', 'staging_seed', 'active',
    'pro', 200, '2026-09-15', 42, true,
    jsonb_build_object(
      'motivation','community',
      'stage','signed_lease',
      'location','Portland, OR',
      'shop_types', jsonb_build_array('full_cafe','specialty_drinks')
    )
  )
  on conflict (id) do update set
    full_name            = excluded.full_name,
    subscription_status  = excluded.subscription_status,
    subscription_tier    = excluded.subscription_tier,
    ai_credits_remaining = excluded.ai_credits_remaining,
    target_opening_date  = excluded.target_opening_date,
    readiness_score      = excluded.readiness_score,
    onboarding_completed = excluded.onboarding_completed,
    onboarding_data      = excluded.onboarding_data,
    updated_at           = now();

  -- 4. coffee_shop_plans (TIM-627: current_module dropped, workspace_progress added).
  insert into public.coffee_shop_plans (id, user_id, plan_name, status, workspace_progress)
  values (
    demo_plan_id, demo_user_id, 'Cedar & Crema (demo)', 'in_progress',
    jsonb_build_object(
      'concept',    jsonb_build_object('status','completed','completed_sections',5),
      'financials', jsonb_build_object('status','in_progress','completed_sections',2)
    )
  )
  on conflict (id) do update set
    plan_name          = excluded.plan_name,
    status             = excluded.status,
    workspace_progress = excluded.workspace_progress,
    updated_at         = now();

  -- 5. workspace_responses (TIM-627 rename from module_responses; workspace_key text axis).
  insert into public.workspace_responses (plan_id, workspace_key, section_key, response_data, status)
  values
    (demo_plan_id, 'concept', 'shop_type', jsonb_build_object(
      'model','full_cafe','size','1100sqft','seating','24',
      'food_level','light_pastries_only','service_style','counter_order'
    ), 'completed'),
    (demo_plan_id, 'concept', 'your_why', jsonb_build_object(
      'motivation','Build the third place my neighborhood does not have yet.',
      'customer_experience','Greeted by name, drink ready before the 9am meeting.',
      'line_in_sand','I will not serve burnt espresso to move volume.'
    ), 'completed'),
    (demo_plan_id, 'concept', 'target_customer', jsonb_build_object(
      'age_range','28-45','occupation','remote_professionals_and_creatives',
      'income','75k-140k','coffee_habits','daily_pourover_or_latte',
      'values','craft, neighborhood, sustainability'
    ), 'completed'),
    (demo_plan_id, 'concept', 'competitive_analysis', jsonb_build_object(
      'competitors', jsonb_build_array(
        jsonb_build_object('name','Heart Coffee','distance','0.4mi','strength','roastery brand','gap','closes at 6pm, no evening hours'),
        jsonb_build_object('name','Stumptown Belmont','distance','0.6mi','strength','tourist draw','gap','no neighborhood loyalty program'),
        jsonb_build_object('name','Coava Public Brew Bar','distance','0.9mi','strength','minimalist espresso','gap','no food, no seating')
      )
    ), 'completed'),
    (demo_plan_id, 'concept', 'concept_brief', jsonb_build_object(
      'brief_content','Cedar & Crema is a 1,100 sqft neighborhood cafe in inner-SE Portland for remote professionals who want a craft pourover, a quiet seat, and to be known by name. Open 6:30am-7pm to own the evening gap our competitors leave on the table.'
    ), 'completed'),
    (demo_plan_id, 'financials', 'startup_costs', jsonb_build_object(
      'equipment_budget',58000,'buildout_budget',92000,'licensing_budget',6500,
      'initial_inventory',9500,'working_capital',35000
    ), 'completed'),
    (demo_plan_id, 'financials', 'revenue_projections', jsonb_build_object(
      'avg_ticket',7.40,'daily_transactions',180,'days_per_week',6
    ), 'completed'),
    (demo_plan_id, 'financials', 'monthly_expenses', jsonb_build_object(
      'rent',4800,'labor_cost',18500,'cogs_percentage',32
    ), 'in_progress'),
    (demo_plan_id, 'financials', 'pricing_strategy', jsonb_build_object(
      'espresso_price',3.75,'drip_price',4.25,'specialty_price',6.00
    ), 'not_started'),
    (demo_plan_id, 'financials', 'financial_summary', jsonb_build_object('summary_notes',''), 'not_started')
  on conflict (plan_id, workspace_key, section_key) do update set
    response_data = excluded.response_data,
    status        = excluded.status,
    updated_at    = now();

  -- 6. ai_conversations: a short coach exchange the board can scroll.
  --    TIM-627: module_number column dropped; workspace_key (text) is the axis.
  delete from public.ai_conversations where plan_id = demo_plan_id;
  insert into public.ai_conversations (plan_id, workspace_key, section_key, messages, credits_used, cost_usd)
  values
    (demo_plan_id, 'concept', 'concept_brief',
      jsonb_build_array(
        jsonb_build_object('role','user','content','Does my concept brief read like a real positioning statement or a wish list?'),
        jsonb_build_object('role','assistant','content','Strong start. The evening gap is your sharpest differentiator. Tighten the customer line: "remote professionals" is broad. Try "remote workers and creatives who treat their morning cafe like a co-working anchor." That makes pricing, food, and music decisions write themselves.')
      ),
      2, 0.0148),
    (demo_plan_id, 'financials', 'startup_costs',
      jsonb_build_array(
        jsonb_build_object('role','user','content','Is 35k working capital enough for a 1100 sqft cafe in Portland?'),
        jsonb_build_object('role','assistant','content','It is on the lower end. Industry rule of thumb is 3 months of fixed costs on hand at open. Your fixed monthly run rate is roughly 23,300, so target 70k. If 35k is the cap, plan to be cash-flow positive by month 4 or line up a working-capital line of credit before signing the lease.')
      ),
      2, 0.0162),
    (demo_plan_id, 'financials', 'revenue_projections',
      jsonb_build_array(
        jsonb_build_object('role','user','content','180 transactions a day, 6 days a week, 7.40 ticket. Realistic for inner-SE?'),
        jsonb_build_object('role','assistant','content','Reasonable by month 6, optimistic for month 1. Heart and Stumptown both do 240-310/day at maturity. Plan a ramp: 90 tx/day months 1-2, 130 by month 4, 180 by month 7. Your break-even from the earlier scenario sits at 102 tx/day, so the math holds even on the slow ramp.')
      ),
      2, 0.0155)
  ;

  -- 7. subscriptions (Pro tier, active — TIM-627 rename from 'accelerator').
  insert into public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, tier, status,
    current_period_start, current_period_end
  ) values (
    demo_user_id, 'cus_demo_staging', 'sub_demo_staging_pro',
    'pro', 'active',
    now() - interval '8 days', now() + interval '22 days'
  )
  on conflict (user_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    tier   = excluded.tier,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end   = excluded.current_period_end,
    updated_at = now();

  -- 8. financial_models (populates the "Your numbers" quick-link).
  insert into public.financial_models (
    plan_id, startup_costs, monthly_projections, revenue_scenarios, break_even_analysis
  ) values (
    demo_plan_id,
    jsonb_build_object(
      'equipment',58000,'buildout',92000,'licensing',6500,
      'initial_inventory',9500,'working_capital',35000,'total',201000
    ),
    jsonb_build_object(
      'revenue',31968,'cogs',10230,'labor',18500,'rent',4800,
      'utilities',850,'other',1100,'net_income',-3512
    ),
    jsonb_build_object(
      'pessimistic', jsonb_build_object('monthly_revenue',19980,'net',-12420),
      'base',        jsonb_build_object('monthly_revenue',31968,'net',-3512),
      'optimistic',  jsonb_build_object('monthly_revenue',47952,'net',9100)
    ),
    jsonb_build_object('break_even_tickets_per_day',102,'notes','contribution-margin method, includes COGS as variable')
  )
  on conflict (plan_id) do update set
    startup_costs       = excluded.startup_costs,
    monthly_projections = excluded.monthly_projections,
    revenue_scenarios   = excluded.revenue_scenarios,
    break_even_analysis = excluded.break_even_analysis,
    updated_at = now();

  -- 9. equipment_lists
  insert into public.equipment_lists (plan_id, items)
  values (demo_plan_id, jsonb_build_array(
    jsonb_build_object('name','La Marzocco Linea PB 2-group','category','espresso','est_cost',17500,'status','quoted'),
    jsonb_build_object('name','Mahlkonig E80 Supreme grinder','category','espresso','est_cost',4200,'status','researching'),
    jsonb_build_object('name','Mavam under-counter espresso (alt)','category','espresso','est_cost',22000,'status','researching'),
    jsonb_build_object('name','Fetco CBS-2131XTS batch brewer','category','brewed','est_cost',2800,'status','quoted'),
    jsonb_build_object('name','True 60" undercounter refrigerator','category','refrigeration','est_cost',2950,'status','researching'),
    jsonb_build_object('name','Bunn ice & water dispenser','category','service','est_cost',1900,'status','researching')
  ))
  on conflict (plan_id) do update set items = excluded.items, updated_at = now();

  -- 10. milestones (TIM-627 rename module_number → source_workspace_key).
  delete from public.milestones where plan_id = demo_plan_id and is_auto_generated;
  insert into public.milestones (plan_id, title, description, target_date, completed_at, source_workspace_key, is_auto_generated)
  values
    (demo_plan_id, 'Concept brief locked', 'Concept workspace complete', current_date - 4, now() - interval '4 days', 'concept', true),
    (demo_plan_id, 'Sign lease at Belmont & 34th', 'Letter of intent out; landlord countersign expected this week', current_date + 9, null, 'location_lease', true),
    (demo_plan_id, 'Equipment quotes in', 'Need 3 quotes per major SKU before purchase', current_date + 18, null, 'buildout_equipment', true);
end $$;
