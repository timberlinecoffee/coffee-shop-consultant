-- TIM-1518: TIM-1449 added "Pre-Open Weeks" seed rows starting at day_offset=-28
-- but never widened the original soft_open_plan_items_day_offset_check
-- (-7..30). Every founder Generate/Seed click failed with a CHECK violation,
-- so soft_open_plan_items stayed empty and the UI surfaced
-- "Couldn't seed the playbook. Milestones may still generate."
--
-- Widen the range to span a full pre-open quarter (-90 days) through the
-- first post-open year (+365 days). This matches the new Opening Month Plan
-- product semantics: founders may add tasks anywhere from training-schedule
-- lockdown through a year-out follow-up.
alter table public.soft_open_plan_items
  drop constraint if exists soft_open_plan_items_day_offset_check;

alter table public.soft_open_plan_items
  add constraint soft_open_plan_items_day_offset_check
    check (day_offset between -90 and 365);
