begin;
update public.users set subscription_tier = 'starter' where subscription_tier = 'builder';
update public.users set subscription_tier = 'pro' where subscription_tier = 'accelerator';
alter table public.users drop constraint if exists users_subscription_tier_check;
alter table public.users add constraint users_subscription_tier_check
  check (subscription_tier in ('free','starter','growth','pro'));
commit;
