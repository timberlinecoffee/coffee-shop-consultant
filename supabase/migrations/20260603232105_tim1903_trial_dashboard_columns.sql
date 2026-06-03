-- TIM-1903: dashboard trial UX wiring.
--
-- trial_just_converted_to: stamped by the Stripe webhook on the trialing→active
-- transition. The dashboard renders a one-time "Welcome to {plan}" toast that
-- clears the column via /api/account/dismiss-welcome-toast on first display.
--
-- trial_reminders_sent: idempotency stamp for the Day 5 / Day 7 / Day 8
-- trial-reminder cron. Shape: { "day5": "ISO-ts", "day7": "ISO-ts", "day8": "ISO-ts" }
-- (keys absent if the corresponding email has not been dispatched). The cron
-- never re-sends a day whose key is present.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_just_converted_to text,
  ADD COLUMN IF NOT EXISTS trial_reminders_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.trial_just_converted_to IS
  'TIM-1903: plan key (starter|pro) stamped by Stripe webhook on trial→active. Dashboard clears via /api/account/dismiss-welcome-toast.';

COMMENT ON COLUMN public.users.trial_reminders_sent IS
  'TIM-1903: idempotency stamp for trial-end email cron. Shape { day5, day7, day8 : ISO ts }.';
