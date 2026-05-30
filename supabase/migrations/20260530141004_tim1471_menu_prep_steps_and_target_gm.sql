-- TIM-1471: Menu & Pricing UX overhaul
-- Adds (1) preparation_steps text[] on menu_items for the new Recipe tab
-- preparation list, and (2) target_gross_margin numeric on coffee_shop_plans
-- (default 0.75, the industry-standard 75% target for café beverages).
-- target_gross_margin drives the MSRP readout in the Cost of Goods tab:
--   MSRP = COGS / (1 - target_gross_margin)

alter table public.menu_items
  add column if not exists preparation_steps text[]
    not null default '{}'::text[];

alter table public.coffee_shop_plans
  add column if not exists target_gross_margin numeric(4,3)
    not null
    default 0.750
    check (target_gross_margin > 0 and target_gross_margin < 1);

comment on column public.menu_items.preparation_steps is
  'Ordered prep instructions shown in the Recipe tab. Owner-editable, AI-seedable. Title Case per TIM-1002.';
comment on column public.coffee_shop_plans.target_gross_margin is
  'Target gross margin used to derive the MSRP readout in Menu & Pricing Cost of Goods tab. Default 0.750 = 75% (industry standard for café beverages). 0 < value < 1.';
