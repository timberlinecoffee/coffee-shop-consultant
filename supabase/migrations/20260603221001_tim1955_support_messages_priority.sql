-- TIM-1955: Phase 2B Pro-feature gating. The support form tags each
-- submission with a server-derived `priority` flag (true for Pro plan +
-- card-on-file trialists, false for Starter and free). The admin inbox
-- and outbound email use it to triage Pro tickets to a tighter SLA.
-- NULL is allowed for legacy rows so we can backfill at our leisure.
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS support_messages_priority_idx
  ON public.support_messages (priority, created_at DESC)
  WHERE priority = true;

COMMENT ON COLUMN public.support_messages.priority IS
  'TIM-1955: true when the submitter is a Pro plan subscriber or a card-on-file trialist. Drives triage SLA.';
