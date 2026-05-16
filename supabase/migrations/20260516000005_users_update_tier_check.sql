-- TIM-627: replace users.subscription_tier check constraint with Groundwork
-- tier set (free, starter, growth, pro) per TIM-617 pricing decision.
-- Pre-migration values 'builder' -> 'starter', 'accelerator' -> 'pro'.

begin;

update public.users set subscription_tier = 'starter' where subscription_tier = 'builder';
update public.users set subscription_tier = 'pro' where subscription_tier = 'accelerator';

alter table public.users
  drop constraint if exists users_subscription_tier_check;

alter table public.users
  add constraint users_subscription_tier_check
  check (subscription_tier in ('free', 'starter', 'growth', 'pro'));

commit;
