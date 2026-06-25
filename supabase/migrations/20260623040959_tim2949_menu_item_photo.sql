-- TIM-2949: User-uploaded 4:5 menu item photo replaces curated illustration.
-- Adds menu_items.photo_path + private storage bucket + plan-scoped storage RLS.
-- Standing Rule 1 (TIM-2252): RLS-enabled-with-deny-by-default — base table
-- menu_items already has RLS + owner policy (initial_schema TIM-967); storage
-- bucket gets four explicit plan-scoped policies (mirrors business-plan-logos
-- TIM-1225). No new public tables.

-- Path convention: <plan_id>/<menu_item_id>.<ext>. Both UUIDs => unguessable.
-- Bucket is private; reads go through a server-issued signed URL.

alter table public.menu_items
  add column if not exists photo_path text;

-- TIM-1322 pattern: Postgres freezes the view's column list at creation time,
-- so a column added to the base table does not surface through mi.* until the
-- view is recreated. Body is otherwise identical to
-- 20260529062733_tim1322_menu_item_expected_popularity.sql.
drop view if exists public.menu_items_with_cogs;
create view public.menu_items_with_cogs as
select
  mi.*,
  mc.name as category_name,
  coalesce(
    (
      select round(
        sum(mii.amount * (ing.package_cost_cents::numeric / ing.package_size))
      )::integer
      from public.menu_item_ingredients mii
      join public.menu_ingredients ing on ing.id = mii.ingredient_id
      where mii.menu_item_id = mi.id
    ),
    mi.cogs_cents,
    0
  ) as computed_cogs_cents
from public.menu_items mi
left join public.menu_categories mc on mc.id = mi.category_id;

-- Private storage bucket. 5 MB cap, photographic formats only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-item-photos',
  'menu-item-photos',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Plan-ownership scoped storage policies. First path segment = plan_id.
create policy "menu_item_photos_select" on storage.objects
  for select using (
    bucket_id = 'menu-item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.coffee_shop_plans where user_id = auth.uid()
    )
  );

create policy "menu_item_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'menu-item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.coffee_shop_plans where user_id = auth.uid()
    )
  );

create policy "menu_item_photos_update" on storage.objects
  for update using (
    bucket_id = 'menu-item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.coffee_shop_plans where user_id = auth.uid()
    )
  );

create policy "menu_item_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'menu-item-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from public.coffee_shop_plans where user_id = auth.uid()
    )
  );
