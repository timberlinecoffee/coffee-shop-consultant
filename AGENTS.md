<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:supabase-migration-rules -->
# Supabase migrations: commit the SQL in the same PR

When you call the Supabase MCP `apply_migration` tool, you MUST also commit the exact SQL you applied to `supabase/migrations/<version>_<name>.sql` in the same PR that introduced the change. No exceptions.

- The filename `<version>` must match the version recorded in `supabase_migrations.schema_migrations` on the project you applied against.
- Use the same SQL body verbatim (no edits between `apply_migration` and the file).
- This applies to dev, staging, and prod projects equally.

Why: The repo is the auditable source of truth for the deployed schema. Applying without committing breaks `supabase db diff`, makes rollback impossible, and forces archeology like TIM-759. If you only need a dev experiment, use a Supabase development branch — not direct `apply_migration` on a long-lived project.

If you discover an applied-but-uncommitted migration, file a child issue under TIM-759 and recover the SQL from `schema_migrations.statements` before merging anything else against that project.
<!-- END:supabase-migration-rules -->

<!-- BEGIN:security-definer-rules -->
# SECURITY DEFINER functions: use session_user, never current_user

Inside a `SECURITY DEFINER` function, `current_user` returns the function *owner* (usually `postgres`), not the caller. Use `session_user` whenever you need to identify the caller — auth bypass checks, audit logs, role-based branching, etc. `auth.role()` and `auth.jwt()` are fine, because they read `request.jwt.claims`, not the executing role.

Bugs of this class so far:
- TIM-766 / `protect_founder_auth_row`: bypass for `supabase_auth_admin` never matched because `current_user` always returned `postgres`. Locked Trent out of `auth.users` updates. Fixed in `20260517170104_fix_protect_founder_use_session_user.sql`.
- TIM-768 / `fn_audit_auth_users`: `actor_role` recorded `postgres` for 151/155 rows because the trigger used `current_user`. Fixed in `20260523152742_tim768_fix_fn_audit_use_session_user.sql`.

Audit before adding new `SECURITY DEFINER` functions:
```sql
SELECT proname, prosrc FROM pg_proc
WHERE prosecdef = true AND prosrc ILIKE '%current_user%';
```
Any hit must be either intentional (and commented as such) or rewritten to use `session_user`.
<!-- END:security-definer-rules -->

<!-- BEGIN:vercel-deploy-hygiene -->
# Vercel prod deploys come from `main` only

**Hard rule. No exceptions without CTO sign-off on the issue.**

- Feature branches deploy as **previews** only. Do NOT pass `target: production` (or `--prod` / `vercel deploy --prod`) when the working tree is on a `feat/*`, `fix/*`, `feature/*`, or any non-`main` branch.
- Promote to production by merging the PR to `main`; the Vercel git integration auto-deploys `main` to the production alias.
- If a manual promotion is required, use `vercel promote <dpl_id>` against a deployment whose `githubCommitRef` is `main`. Never promote a feature-branch deployment to prod.
- Every `feat/*` / `fix/*` run MUST start with `git fetch origin && git rebase origin/main` (or merge `origin/main` in) **before** substantive work. The branch tree must never lag `main` on user-visible surfaces (landing page, layout, marketing, pricing).
- Before any prod-target deploy, confirm `git diff origin/main -- src/app/page.tsx src/app/layout.tsx public/` returns no removals from main. If it does, rebase first.

Why: TIM-985. Multiple agents deployed `feat/*` branches with `target: production` after main had merged the new TIM-697 v8 landing page (15299d7). Each prod deploy from a stale feature branch reverted the production landing page to the pre-merge tree. Founder noticed and flagged on TIM-805. The fix is to never deploy a non-main tree to the production alias.

How to apply:
- Agent runs that own a `feat/*` branch: rebase on `origin/main` at the start of every heartbeat.
- Deploy gating: if you must invoke `deploy_to_vercel` / `vercel deploy`, use `target: null` (preview) on feature branches. Only `main` deploys to production.
- Reviewer / QA: reject any PR whose CI/agent log shows a prod-target deploy from a non-main ref.
<!-- END:vercel-deploy-hygiene -->
