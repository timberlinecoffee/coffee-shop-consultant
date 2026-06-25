-- TIM-2968: Add order_index to hiring_plan_roles for drag-and-drop hierarchy.
-- order_index is a sibling index within a parent group (nullable parent = root level).
-- Existing rows get order_index assigned by creation order so the list is
-- stable before any drag event.

alter table public.hiring_plan_roles
  add column order_index int not null default 0;

-- Back-fill: assign creation-order index within each (plan_id, parent_role_id) group.
with ranked as (
  select
    id,
    row_number() over (
      partition by plan_id, coalesce(parent_role_id::text, '')
      order by created_at
    ) - 1 as idx
  from public.hiring_plan_roles
)
update public.hiring_plan_roles r
  set order_index = ranked.idx
from ranked
where r.id = ranked.id;

create index on public.hiring_plan_roles (plan_id, parent_role_id, order_index);
