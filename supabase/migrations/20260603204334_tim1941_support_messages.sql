-- TIM-1941: customer-facing support form backing table.
-- Public help center (/support) writes here on form submit; the admin inbox
-- in TIM-1940b consumes from this table. Anonymous insert is allowed under
-- a column-level grant so visitors don't need an auth session; all reads are
-- restricted to service-role (admin) callers.

CREATE TABLE IF NOT EXISTS public.support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  email        text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  subject      text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 8000),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page_url     text,
  user_agent   text,
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new','open','closed','spam')),
  handled_at   timestamptz,
  handled_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_notes text
);

CREATE INDEX IF NOT EXISTS support_messages_created_at_idx
  ON public.support_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_status_idx
  ON public.support_messages (status, created_at DESC);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- No SELECT/UPDATE/DELETE policies for anon or authenticated. Only the
-- service-role bypasses RLS and reads/manages messages (admin inbox uses
-- the service-role client, same pattern as the rest of /api/admin).

-- Anonymous + authenticated visitors may INSERT a row via the /api/support
-- route. We allow either role to insert directly (in case the API moves to
-- a client-side write later). The CHECK constraints above guard payload size.
DROP POLICY IF EXISTS "support_messages_insert_anyone" ON public.support_messages;
CREATE POLICY "support_messages_insert_anyone"
  ON public.support_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

COMMENT ON TABLE public.support_messages IS
  'TIM-1941: inbox for Groundwork help center submissions. Anon insert, admin (service-role) read.';
