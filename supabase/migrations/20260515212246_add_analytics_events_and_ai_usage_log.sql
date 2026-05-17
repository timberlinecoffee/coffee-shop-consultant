-- analytics_events table
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  session_id text,
  event_name text NOT NULL,
  properties jsonb DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_user_event_time_idx ON public.analytics_events (user_id, event_name, occurred_at);
CREATE INDEX analytics_events_event_time_idx ON public.analytics_events (event_name, occurred_at);

-- RLS for analytics_events
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own rows
CREATE POLICY "users_insert_own_analytics" ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own rows
CREATE POLICY "users_select_own_analytics" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access (bypasses RLS by default, but explicit for clarity)
CREATE POLICY "service_role_full_analytics" ON public.analytics_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ai_usage_log table
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  module_id text,
  prompt_tokens int,
  completion_tokens int,
  model text,
  cost_usd numeric(10,6),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_log_user_module_idx ON public.ai_usage_log (user_id, module_id, occurred_at);
CREATE INDEX ai_usage_log_occurred_at_idx ON public.ai_usage_log (occurred_at);

-- RLS for ai_usage_log
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Users can insert their own rows
CREATE POLICY "users_insert_own_ai_usage" ON public.ai_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own rows
CREATE POLICY "users_select_own_ai_usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "service_role_full_ai_usage" ON public.ai_usage_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
