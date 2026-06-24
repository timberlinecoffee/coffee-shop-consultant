-- TIM-2993 (Phase 6 ship): flip every remaining users.ui_revamp_v2 = false
-- to true. With all 13 Phase 6 workspace surfaces shipped (TIM-2760 children
-- done), v2 is now the default for every signed-in account.
--
-- SA-2 self-apply per TIM-2894 (policy-sa-2):
--   - RevertToggle has been live in Preferences since 2026-06-09 (TIM-2589,
--     commit b9410cbc) — 15 days as of the apply date, well past the 14-day
--     SA-2 floor. Users who want v1 still have the toggle (which writes
--     ui_revamp_v2=false from /api/account/ui-revamp PATCH).
--   - QA signed off on every Phase 6 child on TIM-2760.
--   - No board "hold" comment on TIM-2760 or its program parent TIM-2575.
--   - Flag is not tagged `flag:board-gated` (only `ai_billing_credits` and
--     `affiliate_payouts` are).
--
-- Lifecycle:
--   TIM-2589 — column created NOT NULL DEFAULT true.
--   TIM-2598 — DEFAULT flipped to false, all rows backfilled false so v1
--              stayed untouched while v2 baked behind ?ui=v2 override.
--   TIM-2790 — DEFAULT flipped back to true for new signups only.
--   TIM-2993 — backfill remaining false rows to true so every existing
--              account lands on v2. RevertToggle remains in Preferences per
--              feedback_big_ui_revamps_need_revert_flag (TIM-2587).
--
-- One DDL-free UPDATE. The column DEFAULT is already true (TIM-2790); this
-- only touches existing rows. Anyone who flips RevertToggle after this lands
-- still goes to false individually — this is a one-time rollout flip, not a
-- policy that prevents opt-out.

UPDATE public.users
   SET ui_revamp_v2 = true,
       updated_at   = now()
 WHERE ui_revamp_v2 IS FALSE;

COMMENT ON COLUMN public.users.ui_revamp_v2 IS
  'Feature flag: true renders the revamped v2 UI surfaces, false falls back to v1. Default true (TIM-2790); existing false rows backfilled to true in TIM-2993 once Phase 6 closed. Overridable via ?ui=v1/?ui=v2 URL param (session/cookie only, no DB write) or RevertToggle in Preferences (PATCH /api/account/ui-revamp writes the DB column).';
