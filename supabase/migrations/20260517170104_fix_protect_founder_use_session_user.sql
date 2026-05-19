-- Fix protect_founder_auth_row() so the supabase_auth_admin bypass works.
-- Original used current_user, but the function is SECURITY DEFINER owned by
-- postgres, so current_user always returned 'postgres' and never matched the
-- whitelisted roles. session_user returns the originally-authenticated role
-- regardless of SECURITY DEFINER, which is what we actually want.

CREATE OR REPLACE FUNCTION public.protect_founder_auth_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email = 'trentrollings@gmail.com' THEN
    -- Allow Supabase internal auth service (forgot-password, email-change, admin resets)
    IF session_user IN ('supabase_auth_admin', 'supabase_admin') THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    -- Allow explicit opt-in for authorised agent/human operations
    IF current_setting('app.founder_write_ok', true) = 'true' THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    RAISE EXCEPTION 'founder-row-protected: direct writes to the founder auth row (trentrollings@gmail.com) are blocked. '
                    'To authorise a legitimate operation: BEGIN; SET LOCAL app.founder_write_ok = ''true''; <your DML>; COMMIT;';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
