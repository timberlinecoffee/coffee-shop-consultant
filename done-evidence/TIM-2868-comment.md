**Shipped.** `8dd5233` on `main`, prod `groundwork.cafe` (Vercel deploy `dpl_GvgtFy2fYTW56dMRDtbebjvgWF8x`, commit `56269e4` READY).

## Root cause

Same bug class as TIM-2860. The "Add new location" POST handler resolved the user's plan via `.from("coffee_shop_plans").select("id").eq("user_id", user.id).single()`. After TIM-1953 shipped multi-project for Pro, that chain throws on any account with 2+ plans — trent has 3 (Beaver & Beef, Beef Bagels, Sole Sisters). The route's `if (!plan)` arm 404'd, and the client `CandidateListCard.handleAdd`'s `if (!res.ok) return` silently swallowed it. Button "did nothing" from the user's perspective.

## Fix

- All 8 location-lease API routes (`candidates`, `[id]`, `bulk`, `lease-terms`, `scorecard-feedback`, `scores`, `area-analysis`, `tradeoff`) switched to `getActivePlanId()` (TIM-2377 canonical resolver). Honors `users.current_plan_id` with most-recent-plan fallback.
- Workspace page `src/app/(app)/workspace/location-lease/page.tsx` uses the same resolver so page + API agree on the active plan (TIM-2860 page+API resolver-parity rule). Previously page used `.order(created_at).limit(1)` (newest), API used `.single()` (404'd) — silent multi-plan corruption surface.
- Guard test `route.guard.test.mjs` asserts every location-lease route imports `getActivePlanId` and that none reintroduce the `.eq("user_id", ...).single()` pattern. 16/16 PASS.

## Live verification on groundwork.cafe (trent@simpler.coffee fixture)

**Desktop (1440×900, Chromium)**

- Open `/workspace/location-lease`, click "Add location" → POST returned **201** (previously 404).
- Response: `plan_id: "37f5d270-8c43-4ab2-b96c-e54ac504c893"` → matches trent's active project (Beaver & Beef, per TIM-2865 active-pointer restore).
- Screenshots: `scripts/shots/tim2868-before.png`, `scripts/shots/tim2868-after.png`
- Evidence: `done-evidence/TIM-2868-verify.json`

**Mobile (iPhone 14, 390×844)**

- Open `/workspace/location-lease`, tap aria-labeled "Add candidate" → POST returned **201**.
- Response: `plan_id: "37f5d270-8c43-4ab2-b96c-e54ac504c893"` (same active project).
- Screenshots: `scripts/shots/tim2868-mobile-before.png`, `scripts/shots/tim2868-mobile-after.png`
- Evidence: `done-evidence/TIM-2868-mobile-and-cleanup.json`

**Cleanup**

- 4 "New Location" test rows archived from trent's Beaver & Beef plan after verification (2 from this run + 2 leftover from earlier QA attempts).

## Standing engineering rules

- Rule 2 (server-side auth): plan ownership re-checked server-side via `getActivePlanId` + `plan_id` equality on candidate writes. Client gates remain UX-only.
- Rule 3 (validated input): `name` required + Title-case at the boundary; no raw user input touches DB.
- Rule 5 (graceful errors): route now returns canonical `{ error: "No plan found" }` 404 only when the user genuinely has no plan; the multi-plan false-404 surface is gone.

## Files

- `src/app/api/workspaces/location-lease/candidates/route.ts` (GET + POST)
- `src/app/api/workspaces/location-lease/candidates/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/workspaces/location-lease/candidates/bulk/route.ts`
- `src/app/api/workspaces/location-lease/candidates/[id]/lease-terms/route.ts`
- `src/app/api/workspaces/location-lease/candidates/[id]/scorecard-feedback/route.ts`
- `src/app/api/workspaces/location-lease/candidates/[id]/scores/route.ts`
- `src/app/api/workspaces/location-lease/candidates/[id]/area-analysis/route.ts`
- `src/app/api/workspaces/location-lease/tradeoff/route.ts`
- `src/app/(app)/workspace/location-lease/page.tsx`
- `src/app/api/workspaces/location-lease/candidates/route.guard.test.mjs` (new pinning test)

## Commits

- `56269e4` — fix(TIM-2868)
- `8dd5233` — verify(TIM-2868) live desktop + mobile

Per TIM-2866 acceptance, not self-closing — board confirmation card filed.
