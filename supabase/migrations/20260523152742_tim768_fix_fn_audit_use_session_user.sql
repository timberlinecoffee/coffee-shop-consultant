-- TIM-768: Fix fn_audit_auth_users so actor_role records the real caller.
--
-- The function is SECURITY DEFINER owned by postgres, so current_user always
-- returns 'postgres' and the audit log loses the actor identity. Out of 155
-- pre-existing rows, 151 were recorded as 'postgres' because of this bug.
-- session_user returns the originally-authenticated role regardless of
-- SECURITY DEFINER, which is what an audit log actually needs.
--
-- Same class of bug as TIM-766/protect_founder_auth_row (fixed in migration
-- 20260517170104_fix_protect_founder_use_session_user.sql).

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
    session_user,
    current_setting('application_name', true),
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
