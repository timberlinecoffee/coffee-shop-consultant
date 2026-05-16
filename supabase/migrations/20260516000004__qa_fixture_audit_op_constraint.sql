-- TIM-682: Extend op check to allow both trigger-style ops and qa-fixture-admin ops
-- The pre-existing auth_users_audit table used 'INSERT'/'UPDATE'/'DELETE';
-- the edge function uses 'create'/'update'/'delete'. Both are valid.
ALTER TABLE public.auth_users_audit DROP CONSTRAINT IF EXISTS auth_users_audit_op_check;
ALTER TABLE public.auth_users_audit ADD CONSTRAINT auth_users_audit_op_check
  CHECK (op IN ('INSERT', 'UPDATE', 'DELETE', 'create', 'update', 'delete'));
