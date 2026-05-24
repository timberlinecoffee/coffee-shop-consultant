-- TIM-972: Add missing columns to existing financial_models table.
-- financial_models already exists (from prior migration); this adds columns
-- needed for the DB-backed Financial Suite architecture.

alter table public.financial_models
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists critique jsonb,
  add column if not exists needs_review_at timestamptz;

-- Unique constraint: one financial model per plan
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.financial_models'::regclass
      and contype = 'u'
      and conname = 'financial_models_plan_id_key'
  ) then
    alter table public.financial_models add constraint financial_models_plan_id_key unique (plan_id);
  end if;
end $$;
