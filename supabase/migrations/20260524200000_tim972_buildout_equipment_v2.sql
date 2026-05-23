-- TIM-972: Add financing_method and source columns to buildout_equipment_items.

alter table public.buildout_equipment_items
  add column if not exists financing_method text not null default 'cash'
    check (financing_method in ('cash', 'loan', 'lease', 'credit')),
  add column if not exists source text not null default 'user_added'
    check (source in ('ai_suggested', 'user_added'));
