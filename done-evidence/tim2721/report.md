# TIM-2721 — v2 review URL diagnosis

**Status:** Reproduced locally against prod (no ship-and-retest). v2 URLs DO render correctly under a fresh session for both Trent accounts. Board's reported logout + "never loads" is most plausibly stale-session + lost-`?ui=v2`-on-login-bounce, not a v2 cookie defect.

## How repro was run

`scripts/tim2721-repro-v2-logout.mjs` and `scripts/tim2721-repro-deep.mjs` — magiclink-mint a real session for `trent@simpler.coffee` and `trentrollings@gmail.com` (no password reset, same recipe as TIM-2686 / TIM-1838), inject the `@supabase/ssr` chunked base64 cookie into headless Chromium, then visit each `?ui=v2` URL while capturing:

- full request/response chain (status, location, set-cookie)
- console errors and page errors
- cookies before/after navigation (did sb-* cookies survive?)
- v2 DOM markers (SidebarV2 nav label "Main navigation", HomeV2 ProgressRing SVG `viewBox="0 0 96 96"`, FinancialsV2 "Financials v2 sections" nav)
- per-URL full-page screenshot

## What I observed

| URL | Final | Status | h1 | v2 markers | Failed sub-reqs |
|-----|-------|--------|-----|-----------|-----------------|
| `/dashboard?ui=v2` | same | 200 | "Welcome back, Trentrollings." (v2 — note period) | ProgressRing ✓, SidebarV2 ✓ | 1: `/workspace/build` 404 |
| `/workspace/financials?ui=v2` | same | 200 | "Financials" | SidebarV2 ✓, "Financials v2 sections" nav ✓ | 4: `/workspace/build` 404, Scout thread 404, 2 RSC prefetches |
| `/workspace/buildout-equipment?ui=v2` | same | 200 | "Equipment & Supplies" | SidebarV2 ✓ | 2 |
| `/workspace/launch-plan?ui=v2` | → `/launch-plan/milestones` | 200 | "Launch Milestones" | SidebarV2 ✓ | 2 |

**No logout. No 5xx. v2 renders on every URL** (see `deep-home-v2-desktop.png` and `deep-financials-v2-desktop.png` — SidebarV2 with Home/Plan/Build/Financials/Run, HomeV2 readiness ring at 0%, FinancialsV2 AccordionSection pattern from TIM-2587).

## DB state for the two Trent accounts (`scripts/tim2721-check-trent-flag.mjs`)

| email | `public.users.id` | `ui_revamp_v2` | `last_sign_in_at` |
|-------|-------------------|-----------------|-------------------|
| `trentrollings@gmail.com` (board primary) | `d30438c6-c9bd-4e9f-a6f4-8642038624b5` | **true** | 2026-06-10T06:24:28 |
| `trent@simpler.coffee` (test) | `a9d38122-7402-4490-b662-f05464134db8` | **false** | 2026-06-18T03:10:03 (magiclink) |

Board's primary account ALREADY has `ui_revamp_v2 = true` in the DB (per TIM-2598's per-account SQL flip on 2026-06-10). They do not need `?ui=v2` — `https://groundwork.cafe/dashboard` should render v2 by default for them.

## Hypotheses — rule in / rule out

| # | Hypothesis | Verdict |
|---|------------|---------|
| 1 | `?ui=v2` cookie set invalidates Supabase auth cookie | **Ruled out.** `gw_ui_revamp_override=v2` is set with `HttpOnly; SameSite=Lax; Path=/; Secure` — different cookie family from `sb-*`. Repro shows sb-cookie delta = 0 across all 6 navigations; cookie persists across requests. |
| 2 | Stale service worker / app shell | **Ruled out.** `public/` has no SW; `grep -rE 'ServiceWorker' src public` returns no hits. groundwork.cafe does not register a service worker. |
| 3 | v2 route runtime error → auth guard falls through to /login | **Ruled out.** Page-error count = 0 on every v2 URL. Only console noise is the known `/workspace/build` 404 (SidebarV2 placeholder nav, latent — already documented in TIM-2686 memo) and a Scout thread 404. Neither triggers an auth fall-through. |
| 4 | Login redirect lands on apex coming-soon (TIM-2327/TIM-2572 chain) | **Partial.** `src/app/(app)/layout.tsx:34` `redirect("/login")` STRIPS the original path AND `?ui=v2`. Login form defaults to `/dashboard` (no `?next=` preserved). So if session expires and board re-logs in, they land on `/dashboard` not `/workspace/financials`. That's a `next=`-preservation bug, not a coming-soon bug. |
| 5 | Flag mis-evaluating post-cookie-set | **Ruled out.** Cookie `gw_ui_revamp_override=v2` IS persisted (sees correct value on every subsequent request in my repro), and `resolveUiRevamp()` returns `true` on the immediate same-request layout render (h1 "Welcome back, Trentrollings." with the period — that's HomeV2 not v1). |

## Most plausible root cause

Board's `trentrollings@gmail.com` last logged in on 2026-06-10 (8 days ago). When they click `?ui=v2`, `src/proxy.ts:57` calls `supabase.auth.getUser()` which attempts a token refresh. If their refresh token has been rotated by another session (other browser, agent run, etc.) since the last visit on that device, the refresh fails and `_removeSession()` wipes all `sb-*` cookies — this is the documented TIM-2352 pattern, but on a workspace path it just bounces to `/login` instead of corrupting OAuth PKCE state. After re-login, they land on `/dashboard` (the `?ui=v2` + intended target was lost because the layout's `redirect("/login")` doesn't carry `?next=`).

The "never loads" symptom is harder to pin down without their browser state. Two candidates:
- Once on /dashboard they see HomeV2 (not the financials they wanted), don't recognize it, and assume the page never finished.
- A clicked SidebarV2 link routes to `/workspace/build` which is a 404 (placeholder NAV_ITEMS href documented in TIM-2686 memo).

## What this means for the board's ask

> 3. Fix pushed with the `?ui=v2` cookie opt-in working AND a fallback path (e.g. a logged-in-as-board admin route that flips the flag for the board's session only) so board can review v2 without the cookie-write side effect.

- **`?ui=v2` cookie opt-in IS working** — verified in repro. The cookie sets, persists, and the SSR layout reads it correctly on the same and subsequent requests.
- **Fallback path already exists**: 
  - **(a)** Board's primary account `trentrollings@gmail.com` already has `ui_revamp_v2 = true` in the database. No cookie write needed — `https://groundwork.cafe/dashboard` will render v2 by default.
  - **(b)** `RevertToggle` ships at `https://groundwork.cafe/account` (Preferences section). One click flips the user's DB row + sets the mirror cookie via `PATCH /api/account/ui-revamp`.

## Recommended action

**Board (Trent):** Open a clean browser window (or DevTools → Application → Clear site data for `groundwork.cafe`), then `https://groundwork.cafe/login`, sign in as `trentrollings@gmail.com`, then navigate WITHOUT `?ui=v2` to:

- https://groundwork.cafe/dashboard
- https://groundwork.cafe/workspace/financials
- https://groundwork.cafe/workspace/buildout-equipment
- https://groundwork.cafe/workspace/launch-plan

You will see v2 on every page because your DB flag is already `true`.

## Latent follow-ups (will file as child issues if board agrees)

1. **Preserve `?next=` through layout redirect**: `src/app/(app)/layout.tsx:34` currently does `redirect("/login")` which strips the original path. Should be `redirect(\`/login?next=\${encodeURIComponent(pathname + search)}\`)`. Login page already honors `?next=`.
2. **Fix SidebarV2 `/workspace/build` 404**: NAV_ITEMS `Build.href = "/workspace/build"` but no such route exists. Either create the route or point Build at `/workspace/launch-plan` (representative Build-stage landing per TIM-2686 GOTCHA).
3. **Session-resilience on token refresh failure**: TIM-2352 fix only covers `/auth/*` paths. For workspace paths a stale-refresh wipe still bounces to /login silently. Could surface "your session expired" instead of a bare bounce.
