-- TIM-627: replace subscriptions.tier check with Groundwork tier set
-- (starter, growth, pro). Pre-migration values 'builder' -> 'starter',
-- 'accelerator' -> 'pro'.

begin;

update public.subscriptions set tier = 'starter' where tier = 'builder';
update public.subscriptions set tier = 'pro' where tier = 'accelerator';

alter table public.subscriptions
  drop constraint if exists subscriptions_tier_check;

alter table public.subscriptions
  add constraint subscriptions_tier_check
  check (tier in ('starter', 'growth', 'pro'));

commit;
