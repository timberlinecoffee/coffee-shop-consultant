-- TIM-1541 follow-up: the original migration's header comment said it would add
-- 'paused' status + paused_from_tier + paused_at to BOTH users AND subscriptions,
-- but the actual ALTER added the two new columns only to public.subscriptions.
-- Code on main (src/app/api/billing/status/route.ts:33, src/lib/access.ts:50)
-- reads users.paused_from_tier and was erroring in prod with
-- "column users.paused_from_tier does not exist" (CEO triage 2026-06-04).
--
-- This migration finishes the original intent: adds paused_from_tier + paused_at
-- to public.users and backfills any existing values from public.subscriptions so
-- already-paused rows (none in prod today, but defensive) stay coherent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS paused_from_tier text NULL,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz NULL;

-- Backfill from subscriptions for any user already in a paused state. This is a
-- one-shot reconciliation; the webhook is being updated in the same PR to write
-- both tables going forward.
UPDATE public.users u
SET paused_from_tier = s.paused_from_tier,
    paused_at        = s.paused_at
FROM public.subscriptions s
WHERE u.id = s.user_id
  AND s.status = 'paused'
  AND s.paused_from_tier IS NOT NULL
  AND u.paused_from_tier IS NULL;

COMMENT ON COLUMN public.users.paused_from_tier IS
  'TIM-1541 follow-up: original tier preserved across a Stripe pause cycle so effectiveTierForRead() returns the right access level. Mirrors subscriptions.paused_from_tier; webhook writes both.';
COMMENT ON COLUMN public.users.paused_at IS
  'TIM-1541 follow-up: timestamp when the subscription transitioned to paused. Mirrors subscriptions.paused_at.';
