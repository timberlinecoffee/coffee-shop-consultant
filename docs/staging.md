# Staging environment

## Live URL

**https://coffee-shop-consultant.vercel.app**

This alias is owned by the Vercel project `coffee-shop-consultant` (team `timberlinecoffees-projects`). It targets the production deployment, which is the branch alias for `main`.

The other Vercel hostnames (`coffee-shop-consultant-timberlinecoffees-projects.vercel.app`, `coffee-shop-consultant-git-main-timberlinecoffees-projects.vercel.app`) are gated behind Vercel SSO and will return `401` to anonymous traffic. Use the bare alias above when sharing with the board or non-team reviewers.

## Auto-redeploy

Every push to `main` triggers a fresh production build (Next.js 16 / Turbopack). The alias atomically swaps to the new build once the deploy reaches `READY`. No manual republish is required, so any Week 1 ship that lands on `main` keeps the staging URL current automatically.

Vercel project: `prj_QuArqjpW3FspTZ9sYa6xVySe4qOb`
Git source: `timberlinecoffee/coffee-shop-consultant` (branch `main`)

## API endpoint inventory

| Surface | Route | Notes |
| --- | --- | --- |
| AI co-pilot stream | `POST /api/copilot/stream` | SSE; workspace-keyed, plan-aware. Replaces the retired `coach` endpoint (TIM-639 / TIM-618-H). |
| Co-pilot threads | `GET/POST /api/copilot/threads`, `GET/PATCH/DELETE /api/copilot/threads/[threadId]`, `POST /api/copilot/threads/[threadId]/title` | Thread browser + auto-title (TIM-634). |
| Workspaces | `src/app/workspace/*` | Six workspace shells mount `<CoPilotDrawer />` (TIM-636). |
| Stripe webhook | `POST /api/stripe/webhook` | Hardened with idempotency + `invoice.payment_failed` (TIM-642). |
| Auth | `POST /auth/signout`, `/login`, `/signup`, `/forgot-password`, `/reset-password` | Supabase Auth. |

## Supabase backend

- Project: `coffee-shop-consultant` (`ltmcttjftxzpgynhnrpg`), region `us-east-1`
- Public URL: `https://ltmcttjftxzpgynhnrpg.supabase.co`
- Schema: `supabase/schema.sql` (applied)

## Demo / board walkthrough account

Seeded by `supabase/seeds/staging-demo-user.sql`. Idempotent — safe to re-run after schema changes or after Module 3+ data lands.

| Field | Value |
| --- | --- |
| Email | `demo.owner@timberline.coffee` |
| Plan | Cedar & Crema (demo) |
| Subscription | Accelerator, active |
| Progress | Module 1 complete, Module 2 in progress |
| AI credits | 200 |
| Readiness score | 42 |
| Target opening | 2026-09-15 |

The password is intentionally NOT in the repo. It is rotated/managed in the board access email and the seed file's `demo_password` variable. To rotate, edit the seed, re-run it against the staging Supabase, and re-send the board email.

### Re-running the seed

Against the live staging Supabase project (no local CLI required):

1. Open the SQL editor at https://supabase.com/dashboard/project/ltmcttjftxzpgynhnrpg/sql/new
2. Paste the contents of `supabase/seeds/staging-demo-user.sql`
3. Edit the `demo_password` literal at the top of the `do $$` block before running
4. Run; the script upserts rows by stable UUID so it is safe to repeat

## Adding new seeded scenarios

When a Module ships, add the section keys to the `module_responses` insert block in the seed file, set the appropriate `status`, and re-run. Keep the demo persona's progress representative of "halfway through what's currently built" so the board always sees a populated dashboard.
