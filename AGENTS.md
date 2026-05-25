<!-- BEGIN:title-case-rule -->
# Title Case for labels (TIM-1002 — applies to AI/seed content)

Any text that is NOT a complete sentence is **Title Case** in the product UI.
This covers static labels AND AI-generated / seed-data content: equipment
names, ingredient names, role names, JD titles, drink names, milestone names,
scorecard criterion names, persona names, suggestion bullet headers.

- Title Case helper: `toTitleCase()` in `src/lib/text.ts`. Pinning tests in
  `src/lib/text.test.mjs`. Use it at the API boundary (or apply Title Case at
  the source, e.g. seed SQL / fixture authoring).
- Seed-data values (TS constants, SQL inserts, JSON fixtures) must be Title
  Case **at rest** — do not rely on a fix-on-read formatter.
- AI prompts that generate label-shaped fields must:
  1. Instruct "Return values in Title Case (every word capitalized except
     articles/short prepositions/conjunctions; AP style)" with a few-shot
     example, AND
  2. Pipe the parsed response through `toTitleCase()` / `titleCaseFields()`
     before persisting or returning to the client.
- Full rule + boundaries: `docs/STYLE_GUIDE.md`.
<!-- END:title-case-rule -->

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

<!-- BEGIN:merge-verification-sweeper -->
# Ship-issue close discipline: branch MUST be merged to `main` before `done` (TIM-1018)

The `merge-verification-sweeper` routine fires every 4h and auto-reopens any `done` ship-issue whose referenced branch still has commits not on `main`. The check is layered (see [TIM-1027](/TIM/issues/TIM-1027)): `git cherry` patch-id match, branch-tip-tree reachability on `main`, and a squash-merge marker scan for the issue identifier in recent `main` commit messages. Any one of those clears the branch as merged. Don't bother closing pre-merge — it'll come right back, loudly.

**Before you `PATCH status=done` on a ship issue:**

```bash
cd coffee-shop-consultant
git fetch origin --prune
BRANCH=<your-branch>; ID=TIM-NNN
# (1) cherry — clean for rebase/cherry-pick merges
git cherry origin/main "origin/$BRANCH" | grep -q '^+' && CHERRY=ahead || CHERRY=clean
# (2) tip-tree — squash of a rebased branch leaves matching tree on main
TREE=$(git rev-parse "origin/$BRANCH^{tree}")
git log origin/main -500 --format=%T | grep -qx "$TREE" && TREE_MATCH=yes || TREE_MATCH=no
# (3) marker — squash subjects typically embed the issue id
git log origin/main -500 --grep "$ID" --format=%H | grep -q . && MARKER=yes || MARKER=no
[ "$CHERRY" = clean ] || [ "$TREE_MATCH" = yes ] || [ "$MARKER" = yes ] \
  && echo "merged" || echo "UNMERGED — do not close"
```

If the check prints `UNMERGED`, your branch is unmerged by all three signals. Open a PR and merge it before closing the issue.

**Branch-only-reclose pattern ([TIM-879](/TIM/issues/TIM-879) / [TIM-893](/TIM/issues/TIM-893)):**
Parent issue is closed at staging-QA on the branch, then a follow-up merge issue is spawned with `inheritExecutionWorkspaceFromIssueId`. The sweeper recognizes this pattern *only if* the child issue's title or description names the same branch and contains "merge", "deploy", or "ship". If you spawn a merge-child, name the branch in its title (e.g. "Merge `feat/tim-XXX` → main and verify production").

**If the sweeper reopens your issue:**
The reopen comment contains the exact `gh pr create` / `git merge` command. Run it, push, then re-close. Do NOT mark `done` again without merging — the marker comment `<!-- merge-verification-sweeper:reopened -->` makes the sweep idempotent, so re-closing without merging gets logged but not re-flagged, and the founder will see it on the digest at [[TIM-1022]].

**Cross-chain limitation:** the sweeper runs as CTO. If your issue is assigned to an agent outside the CTO chain, the reopen PATCH returns 403 and the digest lists it under "BLOCKED — needs CEO reopen". CEO triages on next briefing.
<!-- END:merge-verification-sweeper -->
