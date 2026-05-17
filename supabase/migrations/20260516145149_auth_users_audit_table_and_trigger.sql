
-- 1. Create the audit table
CREATE TABLE IF NOT EXISTS public.auth_users_audit (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  op               text        NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  target_id        uuid,
  target_email_before text,
  target_email_after  text,
  actor_role       text,
  actor_app_name   text,
  actor_ip         text,
  actor_jwt_sub    text,
  changed_columns  jsonb,
  created_at       timestamptz DEFAULT now() NOT NULL
);

-- 2. Trigger function
CREATE OR REPLACE FUNCTION public.fn_audit_auth_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_claims jsonb;
  v_jwt_sub    text;
  v_changed    jsonb := '{}';
  col          text;
BEGIN
  -- Parse JWT claims if available (GoTrue/service-role requests carry these)
  BEGIN
    v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
    v_jwt_sub    := v_jwt_claims ->> 'sub';
  EXCEPTION WHEN others THEN
    v_jwt_sub := NULL;
  END;

  -- For UPDATE: collect names of changed columns
  IF TG_OP = 'UPDATE' THEN
    FOR col IN
      SELECT a.attname
      FROM   pg_attribute a
      WHERE  a.attrelid = TG_RELID
        AND  a.attnum   > 0
        AND  NOT a.attisdropped
    LOOP
      IF (row_to_json(OLD)->>col) IS DISTINCT FROM (row_to_json(NEW)->>col) THEN
        v_changed := v_changed || jsonb_build_object(col, jsonb_build_object(
          'old', row_to_json(OLD)->>col,
          'new', row_to_json(NEW)->>col
        ));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.auth_users_audit (
    op,
    target_id,
    target_email_before,
    target_email_after,
    actor_role,
    actor_app_name,
    actor_ip,
    actor_jwt_sub,
    changed_columns
  ) VALUES (
    TG_OP,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.email ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.email ELSE NULL END,
    current_user,
    current_setting('application_name', true),
    -- GoTrue sets request.headers as JSON; try to extract x-forwarded-for
    COALESCE(
      (current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for'),
      NULL
    ),
    v_jwt_sub,
    CASE WHEN TG_OP = 'UPDATE' THEN v_changed ELSE NULL END
  );

  RETURN NULL;
END;
$$;

-- 3. Attach the trigger to auth.users
DROP TRIGGER IF EXISTS trg_audit_auth_users ON auth.users;
CREATE TRIGGER trg_audit_auth_users
  AFTER INSERT OR UPDATE OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_auth_users();

-- 4. Enable RLS and define policies
ALTER TABLE public.auth_users_audit ENABLE ROW LEVEL SECURITY;

-- service_role: full read (it bypasses RLS by default, but be explicit)
CREATE POLICY "service_role_full_read"
  ON public.auth_users_audit
  FOR SELECT
  TO service_role
  USING (true);

-- authenticated: read-only
CREATE POLICY "authenticated_read_only"
  ON public.auth_users_audit
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated — table is append-only via trigger (SECURITY DEFINER)

-- 5. Backfill — manual incident row for TIM-676
INSERT INTO public.auth_users_audit (
  op,
  target_id,
  target_email_before,
  target_email_after,
  actor_role,
  actor_app_name,
  actor_jwt_sub,
  changed_columns,
  created_at
) VALUES (
  'UPDATE',
  NULL,  -- target_id unknown at time of incident
  NULL,
  NULL,
  'postgres',  -- MCP connection uses postgres role
  'Supabase MCP (TIM-676 incident)',
  NULL,
  '{"note": "Backfill row: auth.users write during TIM-676 investigation on 2026-05-16. Actor role was postgres via MCP tool; no JWT sub available. Exact target_id and email unknown at time of logging."}',
  '2026-05-16T00:00:00Z'
);
