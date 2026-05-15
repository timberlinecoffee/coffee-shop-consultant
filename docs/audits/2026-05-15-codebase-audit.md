# Codebase Audit — My Coffee Shop Consultant
**Date:** 2026-05-15  
**Author:** CTO, Timberline Coffee School  
**Scope:** Full codebase audit, MVP gap analysis, 30-day roadmap, risk register

---

## 1. Codebase Audit Memo

### 1.1 What Is Built (Verified Working)

| Area | Status | Notes |
|------|--------|-------|
| Auth — Google OAuth | ✅ Built | `login-form.tsx` → Supabase OAuth, callback at `/auth/callback` |
| Auth — Email/Password | ✅ Built | Sign-in and sign-up in `login-form.tsx` |
| Auth — Sign-out | ✅ Built | `/auth/signout` POST route |
| Onboarding flow | ✅ Built | 8-question wizard, saves to `users.onboarding_data` + creates `coffee_shop_plans` row |
| Dashboard | ✅ Built | Readiness ring (SVG, dynamic), module grid (8 cards), milestone timeline, AI credits display |
| Module 1 — Concept & Positioning | ✅ Built | 5 sections: Shop Type, Your Why, Target Customer, Competitive Analysis, Concept Brief |
| Module 2 — Financial Modeling | ✅ Built | 4 sections: Revenue Modeling, Startup Costs, Break-Even Analysis, Operating Expenses |
| Module router (`/plan/[moduleNumber]`) | ✅ Built | Handles modules 1–8, redirects unknown numbers, loads responses + conversations from DB |
| AI coach API (`/api/coach`) | ✅ Built | Claude Sonnet 4.6, streaming-free (awaits full response), credit deduction, conversation persistence |
| Credit metering | ✅ Built | 50 credits/month Builder, unlimited Accelerator, `credit_transactions` ledger |
| Stripe checkout | ✅ Built | `create-checkout-session`, `create-portal-session`, webhook handler for sub lifecycle |
| Pricing page | ✅ Built | Builder $49/mo or $39/mo annual, Accelerator $99/mo or $79/mo annual |
| Signup/Login pages | ✅ Built | Separate pages, `?plan=builder` redirect hint supported |
| Account page | ✅ Built | Profile view |
| Billing page | ✅ Built | Stripe portal redirect |
| Supabase schema | ✅ Built | 12 tables, RLS on all, `handle_new_user` trigger, `updated_at` triggers |
| Security headers | ✅ Built | `vercel.json` — X-Frame-Options, CSP, nosniff, Referrer-Policy |
| Mobile bottom nav | ✅ Built | `bottom-tab-bar.tsx` |

### 1.2 What Is Half-Built

| Area | Status | Notes |
|------|--------|-------|
| Module 3 — Site Selection & Lease | ⚠️ Shell only | Listed in dashboard with `unlocked: true` but `totalSections: 0`. Navigation routes to `/plan/3` which renders `<ModuleClient>` but `MODULE_SECTIONS[3]` is undefined — shows blank or crashes. |
| Modules 4–8 | ⚠️ Shell only | Listed in dashboard as locked. Router accepts `/plan/4`–`/plan/8` but no sections defined. Same crash risk as Module 3 if a user navigates directly. |
| Dashboard "Your tools" quick links | ⚠️ Broken | 4 links: `/plan/equipment`, `/plan/financials`, `/plan/costs`, `/plan/milestones` — none of these routes exist. All 404. |
| Free tier gating | ⚠️ Partial | Dashboard and module pages load for free users. Coach API correctly blocks free tier. But free users can navigate to Module 1, see all content, and fill out all fields — effectively getting Builder value for free. No content gate in the section renders. |
| Export to PDF | ⚠️ Not built | Listed as a Builder feature on pricing page and landing page. No `/api/export` route or PDF generation exists. |
| Accelerator features — Trent Q&A, 1-on-1 call | ⚠️ No delivery mechanism | Listed on pricing. No scheduling, async Q&A thread, or delivery surface exists in the app. These are manual/email commitments with no in-app support. |
| `readiness_score` column | ⚠️ Stale | Schema has `readiness_score` on `users` table. Dashboard calculates score dynamically from `module_responses`. The DB column is set to 5 at onboarding and never updated — divergence between stored and displayed values. |
| `coffee_shop_plans.current_module` | ⚠️ Unused | Schema column exists but is never read or updated by the application. Progress is computed live. |
| Financial model DB tables | ⚠️ Schema only | `financial_models`, `equipment_lists`, `cost_tracker`, `milestones`, `menu_items`, `vendors` tables exist in schema but no read/write paths in the app. Module 2 saves to `module_responses`, not `financial_models`. |
| `module_responses.status` field | ⚠️ Inconsistent | Module 1/2 auto-save sets status from a local `sectionStatus` state, but the completion check in `page.tsx` uses `status === "complete"` while the module client marks sections `complete`. Worth verifying the exact string matches. |
| Signup page with plan hint | ⚠️ Partial | `/signup` page exists (prevents 404). `/login?plan=builder` is referenced but no logic captures the `plan` param post-auth to auto-trigger checkout. User lands on dashboard and must manually go to pricing. |

### 1.3 What Is Broken

| Issue | Severity | Detail |
|-------|----------|--------|
| Module 3 crash risk | 🔴 High | `MODULE_SECTIONS[3]` is `undefined`. `ModuleClient` renders sections via `MODULE_SECTIONS[moduleNumber]`. If a user visits `/plan/3`, the component will attempt to iterate `undefined` and throw a runtime error. No error boundary present. |
| `/plan/equipment`, `/plan/financials`, `/plan/costs`, `/plan/milestones` | 🔴 High | Four links on every dashboard are 404. A coffee shop owner who clicks any of these immediately hits a Next.js 404 page. Trust-destroying on first use. |
| `complete` vs `completed` status mismatch risk | 🟡 Medium | Schema constrains `module_responses.status` to `('not_started', 'in_progress', 'completed')`. The module client sets `complete` (not `completed`) on section finish. If this string doesn't match, sections never count as done and readiness score stays at 0. Needs live DB verification. |
| Email signup confirmation UX | 🟡 Medium | Email sign-up shows `alert("Check your email...")` — a browser `alert()` dialog. Jarring and unpolished for a paid SaaS product. |
| Anthropic API called directly from Next.js route | 🟡 Medium | `/api/coach` calls `api.anthropic.com` directly with the key in server env. No streaming — waits for full response (up to 800 tokens). Users experience 5–15 second freezes. Not a security bug but a significant UX/reliability problem. |
| CSP allows `unsafe-inline` on scripts | 🟡 Medium | `vercel.json` CSP includes `script-src 'self' 'unsafe-inline'`. This significantly weakens XSS protection. Should be replaced with a nonce or hash-based CSP once the Tailwind/Next inline requirements are understood. |
| No error handling on Anthropic API failure | 🟡 Medium | `/api/coach` returns a 500 with a generic message if Anthropic is down. No retry, no fallback message to user, no graceful degradation. |
| No `NEXT_PUBLIC_*` env validation | 🟡 Medium | App will silently fail at runtime if Supabase URL/anon key are missing. No startup validation. |
| `users.subscription_status` default is `free_trial` | 🟠 Low | Schema defaults to `'free_trial'` but application logic branches on `'free'`, `'builder'`, `'accelerator'`. `free_trial` is in the enum but never set or checked anywhere in the app code. Could create confusion. |

### 1.4 What Is Missing (Not in Codebase)

- **Modules 3–8 content** — zero sections, zero UI, zero AI prompts
- **BRD (Business Readiness Document) assembly** — Module 8's core deliverable. No generation, no export surface.
- **PDF export** — sold on pricing page, not built
- **Password reset flow** — email/password users cannot reset passwords
- **Email verification success page** — auth callback doesn't distinguish first-time email confirm vs. returning OAuth
- **Error boundaries** — no `error.tsx` pages anywhere; crashes show raw Next.js error screens to users
- **Loading states** — module page has no Suspense/skeleton; full server render means blank screen during DB fetch
- **Terms of Service / Privacy Policy pages** — referenced nowhere in the UI but required before any paid subscription
- **PostHog analytics** — CSP includes `us.i.posthog.com` but no PostHog client code exists
- **Admin/ops tooling** — no way to view users, trigger credit resets, manage subscriptions outside Supabase dashboard
- **Credit monthly reset job** — monthly credits reset on Stripe renewal webhook only. If a user cancels and resubscribes mid-month, or if webhook fails, credits are never reset.
- **Refund/churn email flow** — no transactional emails for welcome, payment failed, cancellation confirmation
- **Rate limiting on `/api/coach`** — no request throttle beyond credit metering; a user could burn 50 credits in seconds

### 1.5 Dependency & Security Risks

| Risk | Detail |
|------|--------|
| `next: 16.2.4` | Package.json says Next.js 16.2.4 but React is 19.2.4. Next.js 16 isn't an official release as of this audit — suspect this is `15.x` or a pre-release. Verify the actual installed version and check for CVEs. |
| `@supabase/ssr: 0.10.2` | Recent but check for breaking changes in cookie handling between 0.10.x and current. |
| `stripe: ^22.0.2` | Pinned to API version `2026-03-25.dahlia` — a preview/beta API version. This is non-standard and may not be stable. Should use a stable dated API version. |
| `anthropic` SDK not used | The coach API calls Anthropic via raw `fetch`, not the official `@anthropic-ai/sdk`. No prompt caching, no retry logic, no streaming support. |
| `STRIPE_SECRET_KEY` in server env | Correct pattern. Webhook uses `constructEvent` with secret — correct. |
| `ANTHROPIC_API_KEY` | Server-only, correct. But raw fetch means no SDK-level safety nets. |
| No `NEXT_PUBLIC_SITE_URL` | Stripe checkout `success_url` and `cancel_url` use `process.env.NEXT_PUBLIC_SITE_URL`. If unset, checkout redirects will break silently. |

### 1.6 Environment Variable Inventory

| Variable | Used In | Required | Notes |
|----------|---------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client/server | ✅ Yes | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client/server | ✅ Yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | `service.ts` (webhook) | ✅ Yes | Server-only |
| `ANTHROPIC_API_KEY` | `/api/coach` | ✅ Yes | Server-only |
| `STRIPE_SECRET_KEY` | Stripe routes | ✅ Yes | Server-only |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` | ✅ Yes | Server-only |
| `STRIPE_BUILDER_MONTHLY_PRICE_ID` | `stripe.ts` | ✅ Yes | |
| `STRIPE_BUILDER_ANNUAL_PRICE_ID` | `stripe.ts` | ✅ Yes | |
| `STRIPE_ACCELERATOR_MONTHLY_PRICE_ID` | `stripe.ts` | ✅ Yes | |
| `STRIPE_ACCELERATOR_ANNUAL_PRICE_ID` | `stripe.ts` | ✅ Yes | |
| `NEXT_PUBLIC_SITE_URL` | Stripe checkout URLs | ✅ Yes | Missing from vercel.json; must be set in Vercel dashboard |
| `STRIPE_PORTAL_CONFIGURATION_ID` | `create-portal-session` | ⚠️ Optional | Checkout uses it if set; falls back to default portal |

---

## 2. MVP Gap Analysis

**Definition of MVP:** A real coffee shop owner can sign up, pay, complete onboarding, complete at least one full module (Module 1), and find genuine value in their first 90 days.

Each gap is rated **S** (< 1 day), **M** (1–3 days), **L** (3–7 days) effort.

### P0 — Blockers (must fix before any paying customer)

| # | Gap | Effort | Empathy Test |
|---|-----|--------|-------------|
| P0-1 | **Module 3 crash**: `/plan/3` renders blank/crashes. Even though locked, Module 3 shows "Unlocked" in dashboard, inviting a click. | S | An owner clicks Module 3, gets a crash. They close the tab and don't come back. |
| P0-2 | **Broken quick-links on dashboard**: 4 tool links 404. Every user sees these on every visit. | S | "The equipment list button doesn't work. Is this thing broken?" |
| P0-3 | **Status string mismatch** (`complete` vs `completed`): If sections never count as done, readiness score stays at 0 and milestones never advance. Must verify against live DB. | S | Owner completes Module 1 Section 1 and sees 0% progress. Feels like they did something wrong. |
| P0-4 | **Free tier gates missing**: Free users can complete all of Module 1 without paying. Removes core revenue incentive. Builder subscribers who pay can't tell what they're getting extra. | M | "Wait, why would I pay $49? I already did everything for free." |
| P0-5 | **Password reset missing**: Email/password users who forget their password cannot recover their account. | S | Owner creates an account, forgets password, calls it abandoned. |
| P0-6 | **Terms of Service / Privacy Policy**: Required before taking payment. Stripe may reject the account. GDPR/CCPA exposure. | M | Legal requirement, not empathy gap — but a paying customer deserves to know the terms. |

### P1 — High Impact Before First Revenue

| # | Gap | Effort | Empathy Test |
|---|-----|--------|-------------|
| P1-1 | **AI coach response latency**: 5–15 second freezes with no loading indicator. | M | "I typed my question and the page froze. I thought it crashed." |
| P1-2 | **Email signup UX** (`alert()` dialog): Jarring. Should be an inline success state with clear next step. | S | "The pop-up was weird. Didn't feel like a real product." |
| P1-3 | **Module 1 completion experience**: No "you're done!" moment. Owner finishes Section 5 and... nothing happens. No celebration, no next-step prompt, no deliverable summary. | M | "I filled everything out. Now what?" |
| P1-4 | **`/login?plan=builder` doesn't auto-trigger checkout**: Owner clicks "Start building" → logs in → lands on dashboard with no checkout. High drop-off moment. | S | "I clicked the button to pay and ended up on my dashboard. Did it charge me?" |
| P1-5 | **No welcome email / transactional email**: No confirmation that subscription activated, no onboarding nudge, nothing. | M | "I paid $49 and got no confirmation email. Something feels off." |
| P1-6 | **No error boundaries**: Raw Next.js error screen if anything goes wrong. | S | Trust-destroying. A polished error page keeps the owner in the app. |

### P2 — Needed Within 30 Days to Retain Users

| # | Gap | Effort | Empathy Test |
|---|-----|--------|-------------|
| P2-1 | **Module 3 content** (Site Selection & Lease): Modules 1 and 2 take ~2 weeks for an active user. They'll hit the wall at Module 3 within 30 days. | L | "I finished the first two modules in two weekends. Where's the next one?" |
| P2-2 | **PDF export of Module 1 concept brief**: The concept brief (Section 5 of Module 1) is a real deliverable. Owners want to share it. Promised in pricing. | M | "I want to show my partner what I've built. How do I print this?" |
| P2-3 | **AI streaming**: Without streaming, coach feels broken during response generation. | M | Increases perceived responsiveness dramatically. |
| P2-4 | **Accelerator delivery surface**: Trent Q&A and 1-on-1 call have no in-app mechanism. These must be either fulfilled manually or built before Accelerator is sold. | M | "I paid $99 for a weekly Q&A with Trent. Where do I do that?" |
| P2-5 | **Supabase → Vercel deployment verified**: No `.env.local.example` and no confirmation the schema is applied to the production Supabase project. | S | Pre-launch ops gap, not owner-facing. |
| P2-6 | **Mobile module experience audit**: Module 1/2 sections have complex multi-column layouts (competitive analysis table, financial inputs). Need 375px QA pass. | S | "This is basically unusable on my phone." |

### P3 — Nice-to-Have Within 90 Days

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| P3-1 | Modules 4–8 content | L each | Long-term retention and upsell |
| P3-2 | Admin dashboard | L | Ops hygiene, not owner-facing |
| P3-3 | Credit purchase flow (top-ups) | M | Revenue expansion |
| P3-4 | PostHog analytics wire-up | S | Visibility into what owners are doing |
| P3-5 | `free_trial` → `free` status cleanup | S | Prevents future confusion |
| P3-6 | Rate limiting on `/api/coach` | S | Abuse prevention |

---

## 3. Sequenced 30-Day Roadmap Proposal

**Target:** First paying customer live by end of Week 4.  
**Parallel tracks:** IC A (product/UX), IC B (infra/platform).

### Week 1 — Stability & Legal (Days 1–7)
**Milestone: "Safe to Share"** — No crashes, no broken links, legal in order.

| Task | Owner | Effort | Parallel? |
|------|-------|--------|-----------|
| Fix Module 3 crash (guard `MODULE_SECTIONS[n]` with graceful empty state) | IC A | S | Yes |
| Fix 4 broken dashboard quick-links (stub pages with "Coming soon" or remove links) | IC A | S | Yes |
| Verify `complete` vs `completed` status string against live DB; fix if needed | IC B | S | Yes |
| Add password reset page | IC A | S | Yes |
| Implement error boundaries (`error.tsx` at root and module level) | IC A | S | Yes |
| Draft ToS and Privacy Policy (stub pages, real content from CEO/legal) | CEO | M | Yes |
| Confirm all env vars are set correctly in Vercel production | IC B | S | Yes |
| Apply Supabase schema to production project (if not already done) | IC B | S | Yes |

### Week 2 — Monetization Integrity (Days 8–14)
**Milestone: "Pay to Unlock"** — Free/Builder tiers are correctly gated; first checkout works end-to-end.

| Task | Owner | Effort | Parallel? |
|------|-------|--------|-----------|
| Add content gate: free users see Module 1 Section 1 only; rest requires Builder | IC A | M | No (depends on schema confirm) |
| Fix `?plan=builder` post-auth checkout trigger | IC A | S | Yes |
| Replace `alert()` with inline email-sent UI state | IC A | S | Yes |
| Wire up transactional email (Resend or Supabase SMTP): welcome + payment confirmed | IC B | M | Yes |
| Stripe end-to-end test: checkout → webhook → credits allocated → dashboard shows tier | IC B | M | No (depends on env vars set) |
| Replace `free_trial` default with `free` in schema | IC B | S | Yes |

### Week 3 — Module 1 Experience Polish (Days 15–21)
**Milestone: "Module 1 Complete"** — An owner finishes Module 1 and feels accomplished.

| Task | Owner | Effort | Parallel? |
|------|-------|--------|-----------|
| Add AI streaming to `/api/coach` (switch to `@anthropic-ai/sdk` with stream) | IC B | M | Yes |
| Add loading skeleton to module page during server fetch | IC A | S | Yes |
| Build Module 1 completion screen with concept brief summary + next-step CTA | IC A | M | No (depends on section status fix) |
| PDF export: concept brief (Module 1 Section 5) — html-to-pdf via Puppeteer or react-pdf | IC A | M | Yes |
| Mobile QA pass: Module 1 all 5 sections at 375px | IC A | S | No (after polish) |
| Coach UX: add "thinking..." indicator during AI response | IC A | S | Yes |

### Week 4 — Module 3 Stub + Launch (Days 22–30)
**Milestone: "First Paying Customer"** — App is live, stable, marketed.

| Task | Owner | Effort | Parallel? |
|------|-------|--------|-----------|
| Build Module 3 first section (Site Criteria) — enough to unlock the module | IC A | M | Yes |
| Accelerator delivery: set up Trent's async Q&A via email or simple form (not in-app) | CEO/Trent | S | Yes |
| PostHog wire-up for module start/complete events | IC B | S | Yes |
| Soft launch: invite 5 beta users, gather feedback | CEO | — | — |
| Fix any P0/P1 issues surfaced by beta | All | — | — |

---

## 4. Risk Register — Top 5 Blockers to First Paying Customer

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | **Free tier gating absent → no one converts** | High | Critical | Fix in Week 2. Builder paywall is the core business mechanic. Every day it's absent is a day the product trains users not to pay. |
| R2 | **Stripe price IDs not configured → checkout fails silently** | High | Critical | `tierFromPriceId()` returns `"free"` if env vars are empty strings. A user who pays gets silently downgraded to free. Verify all 4 price ID env vars in production before any marketing. |
| R3 | **Module 3 crash destroys trust on first exploration** | High | High | One-hour fix. If an owner clicks Module 3 on day one and gets a crash, they churn before paying. Fix before any user sees the app. |
| R4 | **No Terms of Service = legal exposure on first payment** | Medium | Critical | A paying customer with no ToS is a liability. Stripe may flag the account. Needs basic ToS/Privacy before collecting payment — even a minimal document. |
| R5 | **AI coach latency kills activation** | Medium | High | The coach is the product's core differentiator. If users experience 10-second freezes and no loading indicator, they assume the app is broken. Streaming or a progress indicator is an activation-rate issue, not a polish issue. |

---

## 5. Voice & Copy Audit (Directive Addendum 2)

Reviewed all customer-facing strings in landing page, onboarding, dashboard, module UI, pricing, and error states.

**Violations found:**

| Location | Issue | Current Copy | Suggested Fix |
|----------|-------|-------------|---------------|
| `login-form.tsx` | Browser `alert()` — not brand voice | `"Check your email to confirm your account!"` | Inline success state: "We sent a confirmation link to {email}. Check your inbox." |
| `dashboard/page.tsx` | Emoji in greeting violates Addendum 2 tone guidance (no emojis unless user-requested) | `"Hey {firstName} 👋"` | `"Hey {firstName},"` or `"Welcome back, {firstName}."` |
| `dashboard/page.tsx` | Platitude copy | `"Your coffee shop plan is waiting. Let's keep building."` | More specific: `"Pick up where you left off."` or `"Module 2 is next."` |
| `pricing/page.tsx` | Vague urgency | `"Get accelerated"` (CTA) | `"Start your plan"` — more direct, less hype |
| Module 1 section labels | "Your Why" | Acceptable for the coffee audience, directness is on-brand. | No change needed. |
| `onboarding-flow.tsx` | "We'll use it throughout the platform." | Reads as system-speak | "We'll use it throughout your plan." |
| `bottom-tab-bar.tsx` | Tab label "Plan" | Ambiguous — could be the 8-module plan or a generic menu | Consider "Modules" or "My Plan" |

**No violations found in:** Coach system prompt, FAQ copy, module section descriptions (well-written, direct, coffee-specific).

---

## Summary

The platform has a solid foundation: auth, Stripe, the DB schema, and Modules 1–2 are genuinely production-quality work. The gap to first paying customer is not wide — it's a focused 2-week sprint to fix the P0 blockers and add the paywall, followed by a Week 3 polish pass on the Module 1 completion experience.

The biggest risk is shipping a demo that converts zero free users because the paywall doesn't exist. Fix that first.
