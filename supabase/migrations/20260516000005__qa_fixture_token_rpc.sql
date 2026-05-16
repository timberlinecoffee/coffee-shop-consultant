-- TIM-682: RPC to read QA fixture token from Vault, service_role only
-- Edge function reads QA_FIXTURE_TOKEN from Deno.env first; this RPC is the
-- fallback when the env var is not set via supabase secrets set.
CREATE OR REPLACE FUNCTION public.get_qa_fixture_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'qa_fixture_token' LIMIT 1;
$$;

-- Revoke from public; grant only to service_role
REVOKE ALL ON FUNCTION public.get_qa_fixture_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_qa_fixture_token() TO service_role;
