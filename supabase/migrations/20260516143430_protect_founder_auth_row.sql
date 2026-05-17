
-- Create trigger function in public schema (postgres has CREATE there)
CREATE OR REPLACE FUNCTION public.protect_founder_auth_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.email = 'trentrollings@gmail.com' THEN
    -- Allow Supabase internal auth service (forgot-password, email-change, admin resets)
    IF current_user IN ('supabase_auth_admin', 'supabase_admin') THEN
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

-- Revoke public execute, grant only to postgres and auth roles
REVOKE ALL ON FUNCTION public.protect_founder_auth_row() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_founder_auth_row() TO postgres, supabase_auth_admin, supabase_admin;

-- Install trigger on auth.users (postgres has TRIGGER privilege on this table)
DROP TRIGGER IF EXISTS protect_founder_auth_row ON auth.users;

CREATE TRIGGER protect_founder_auth_row
  BEFORE UPDATE OR DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_founder_auth_row();
