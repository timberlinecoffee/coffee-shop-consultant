-- TIM-682 / TIM-678 B-2: auth_users_audit table
-- Records every attempt (allowed or refused) by the qa-fixture-admin
-- Edge Function to mutate auth.users rows.

create table if not exists public.auth_users_audit (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  op           text        not null check (op in ('create', 'update', 'delete')),
  target_email text        not null,
  outcome      text        not null check (outcome in ('allowed', 'refused')),
  refusal_code text,           -- e.g. 'not_allowlisted'
  source_ip    text,
  notes        text
);

comment on table public.auth_users_audit is
  'Audit trail for qa-fixture-admin Edge Function attempts — TIM-682.';

-- Service-role access only; RLS disabled intentionally (audit table, not user data).
alter table public.auth_users_audit enable row level security;
-- No policies: only the service-role / Edge Function writes here.
