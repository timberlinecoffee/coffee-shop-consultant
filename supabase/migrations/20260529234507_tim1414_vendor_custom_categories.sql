-- TIM-1414: Custom vendor categories.
-- Board feedback: "They should be able to also add their own categories as
-- well, in case there's anything that's been missed here." Custom categories
-- live alongside the nine seeded categories, are visually indistinguishable
-- once created, and persist per plan.
--
-- We drop the CHECK constraints on vendor_candidates.category /
-- vendor_decisions.category so custom keys ("custom:<slug>") can be stored.
-- Validation now lives at the API boundary.

create table if not exists public.vendor_custom_categories (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.coffee_shop_plans(id) on delete cascade,
  key         text not null,
  label       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (plan_id, key)
);

create index if not exists idx_vendor_custom_categories_plan
  on public.vendor_custom_categories (plan_id, position);

alter table public.vendor_custom_categories enable row level security;

drop policy if exists "vendor_custom_categories_owner_all" on public.vendor_custom_categories;
create policy "vendor_custom_categories_owner_all" on public.vendor_custom_categories
  for all using (
    plan_id in (select id from public.coffee_shop_plans where user_id = auth.uid())
  );

create or replace function public.fn_vendor_custom_categories_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vendor_custom_categories_updated_at on public.vendor_custom_categories;
create trigger trg_vendor_custom_categories_updated_at
  before update on public.vendor_custom_categories
  for each row execute function public.fn_vendor_custom_categories_updated_at();

-- Relax the category CHECK so custom keys can land. We keep the existing rows
-- valid by name; new rows go through API validation that accepts either a
-- seeded key or a plan-scoped custom key (custom:<slug>).
alter table public.vendor_candidates
  drop constraint if exists vendor_candidates_category_check;

alter table public.vendor_decisions
  drop constraint if exists vendor_decisions_category_check;
