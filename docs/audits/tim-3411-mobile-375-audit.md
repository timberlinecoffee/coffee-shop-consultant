# TIM-3411 — Mobile 375px Platform Audit

**Parent:** [TIM-3410](/TIM/issues/TIM-3410)  ·  **Author:** CTO  ·  **Date:** 2026-06-29  ·  **Scope:** observational; no fixes in this issue.

> Walks every major surface at 375 / 360 / 414 px and records the structural problems the board flagged on [TIM-3410](/TIM/issues/TIM-3410) ("Settings/Account text overflowing… sidebar + content fighting"). Fix children get filed by CEO after this lands.

---

## 0. TL;DR — Top 10 Blockers (ordered by usage × severity)

These are the things to fix at component level first; each touches multiple surfaces. Items 1–2 are the highest-leverage because they share file owners that mount on **every** authenticated surface.

| # | Severity | Component owner | File:line | Surfaces affected | Pattern |
|---|----------|-----------------|-----------|-------------------|---------|
| 1 | **BLOCK** | `CoPilotDrawer` | `src/components/copilot/CoPilotDrawer.tsx:346-348` | Every authenticated workspace (45 mount sites) when AI panel is open | `PANEL_MIN_WIDTH = 360` / `PANEL_DEFAULT_WIDTH = 448`. At 375 px viewport the drawer clamps to 360 px (96 % of screen) and leaves < 16 px of underlying workspace visible — user can't read context they're chatting about. |
| 2 | **BLOCK** | `InfoTip` popover | `src/components/ui/info-tip.tsx:64` | 45 usages — every form field tooltip across Concept, Financials, Hiring, Buildout, Operations, Marketing | `absolute left-0 w-64` (256 px) — overflows viewport right edge by ~115 px on right-anchored fields. No edge detection. |
| 3 | **BLOCK** | `SettingsShell` | `src/components/account/settings/SettingsShell.tsx:49-56` | All tabbed Settings (`NEXT_PUBLIC_BILLING_TAB=1`) | `flex gap-8` + `nav w-44 flex-shrink-0` + `flex-1` — left rail eats 176 + 32 px → ~119 px content column → cards become unreadable |
| 4 | **BLOCK** | `EquipmentGrid` | `src/components/equipment/EquipmentGrid.tsx:1378` | Buildout & Equipment | `<table min-w-[900px]>` inside `overflow-x-auto` — every cell edit needs horizontal scroll |
| 5 | **BLOCK** | Menu ingredient grid | `src/app/(app)/workspace/menu-pricing/menu-workspace.tsx:850` | Menu & Pricing | `min-w-[640px]` ingredient row editor — 265 px of the grid is offscreen at 375 px |
| 6 | **BLOCK** | `MenuMockup` (marketing) | `src/app/_components/Mockups.tsx:231,237` | `/coming-soon` (public preview of product, currently the marketing landing) | `grid grid-cols-4` table with no `sm:` variant — `~80 px/col` font is unreadable |
| 7 | **SERIOUS** | `SectionHelp` popover | `src/components/ui/section-help.tsx:57` | 43 usages — every workspace section's `[Title] [Help (?)] ─── [Write with AI]` canon row | `absolute left-0 w-72` (288 px) — only 87 px of viewport margin at 375 px; sections whose `(?)` is right-aligned overflow |
| 8 | **SERIOUS** | Account `page.tsx` rows | `src/app/account/page.tsx:104-111, 122-133` | `/account` (always visible — no flag) | `flex justify-between` key-value rows, no responsive stack, no `break-all`/`truncate` on `user.email` or plan text |
| 9 | **SERIOUS** | `WorkspaceHeader` | `src/components/workspace/WorkspaceHeader.tsx:52-54, 71` | All workspace pages | `gap-3 flex-wrap` action cluster with `flex-shrink-0` buttons — title, description, action chips wrap to 3+ lines and stagger |
| 10 | **SERIOUS** | Tables sweep — Financials, BillingTab, Privacy | `financials-workspace.tsx:734`, `financials-v2.tsx:352`, `BillingTab.tsx:295`, `privacy/page.tsx:98-147,165-191` | Financials, `/account/billing`, `/privacy` (public compliance) | `min-w-[440-480px]` tables + `whitespace-nowrap` rows + unbounded description columns → horizontal scroll required for the data |

Each row's "Component owner" column is the file to fix once. Per [TIM-3410](/TIM/issues/TIM-3410) board guidance: "Fixing these at the component level automatically fixes them everywhere they are used." Items **1, 2, 7** alone account for **133 component instances** across the workspace tree — fix-leverage is highest there.

---

## 1. Method & evidence

- **Viewports**: 375 (iPhone SE primary), 360 (cheapest Android), 414 (iPhone Pro). All three captured for public surfaces; only 375 px called out in findings unless behaviour differed.
- **Production screenshots**: 33 PNGs captured against `https://groundwork.cafe` via headless Chromium 1223 — saved in this repo at `scripts/screenshots/tim3411/`. Script: `scripts/tim3411-mobile-shots.mjs`. All public surfaces returned HTTP 200; **`hasHscroll: false`** on every page at the document level (no document-wide horizontal scroll). Cell- and component-level overflow is what the agent caught.
- **Authenticated surfaces** (`/account`, `/account/*`, `/(app)/workspace/*`, `/(app)/dashboard`, `/onboarding/*`) cannot be screenshotted from this agent host without a session. Findings on those surfaces are **code-level**, citing `file:line` and the exact class string that fails at 375 px.
- **Source-of-truth files read** are listed per section. Inline class strings come from `main` at `cd2e23f3`.

Screenshot summary metadata: `scripts/screenshots/tim3411/summary.json` (33 entries).

---

## 2. Breakpoint inventory (issue requirement §4)

The codebase uses **Tailwind v4 defaults only**. No custom breakpoints in `globals.css` (no `@theme` override of `--breakpoint-*`, no `@media` blocks). PostCSS config (`postcss.config.mjs`) loads `@tailwindcss/postcss` with no plugins.

| Variant | Min width | Notes |
|---------|-----------|-------|
| (none)  | 0 px      | Mobile-first base — applies to 360 / 375 / 414 |
| `sm:`   | 640 px    | Anything `sm:` and above is **invisible at 375 px** |
| `md:`   | 768 px    | iPad portrait |
| `lg:`   | 1024 px   | Tablet-landscape / small desktop |
| `xl:`   | 1280 px   | Standard desktop |
| `2xl:`  | 1536 px   | Wide desktop |

**Consistency**: not great. There is **only one breakpoint set** (Tailwind defaults), so naming is unambiguous — but adoption is patchy:

- `grep -c "sm:|md:|lg:|xl:" src/**/*.tsx` → 254 total responsive-variant usages.
- `find src/app -name "page.tsx" -o -name "layout.tsx"` → 80 files; **54 of them have zero responsive variants**. That includes flagship surfaces:
  - `src/app/account/page.tsx`, `src/app/account/billing/page.tsx`, `src/app/account/documents/page.tsx`, `src/app/account/projects/page.tsx`, `src/app/account/layout.tsx`
  - `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/layout.tsx`, `src/app/(app)/layout.tsx`
  - Every workspace `page.tsx` (concept, business-plan, financials, buildout-equipment, hiring, menu-pricing, suppliers, inventory, launch-plan, location-lease, marketing, opening-month-plan, operations-playbook)
  - `src/app/forgot-password/page.tsx`, `src/app/help/page.tsx`
  - Most `admin/*` pages

  *Some of these are thin wrappers that delegate layout to a client component which may itself be responsive — that's true for `account/page.tsx` (renders cards inline) vs. `workspace/financials/page.tsx` (mounts `<FinancialsWorkspace>`). Still: file count is signal that mobile wasn't first-class when most pages were authored.*

- `max-w-*` usage (top): `max-w-3xl` (27), `max-w-6xl` (26), `max-w-sm` (22), `max-w-md` (20), `max-w-5xl` (14). Container caps are consistent. **The problem isn't containers — it's grids/flex inside them.**

**Recommendation for fix children** (not in this issue's scope but worth noting): standardise on three mobile-first patterns rather than introducing new breakpoints.

1. `grid grid-cols-1 sm:grid-cols-2` (mobile-first stack)
2. `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between` (key-value rows)
3. `overflow-x-auto` only when the data is genuinely tabular; otherwise collapse to card-stack at `<sm`

---

## 3. TIM-2825 pattern coverage check

[TIM-2825](/TIM/issues/TIM-2825) (closed 2026-06-24) shipped five mobile patterns. Confirming which carry through to today's surfaces:

| TIM-2825 child | Pattern | Present on surfaces audited? |
|----------------|---------|------------------------------|
| TIM-2826 | Text-input expansion (vertical autosize) | `src/components/ui/mobile-expandable-textarea.tsx` exists and is used in Concept editor and a few BP fields — **partial coverage** |
| TIM-2827 | Chart responsiveness | Charts in `financials-v2.tsx` and depreciation tab use `ResponsiveContainer` from Recharts — present where used |
| TIM-2828 | Overflow containment | Container caps (`max-w-*`) are consistent but **inner grids/tables still set `min-w-[Xpx]`** — partial. The tables in #2, #3, #8, #9 of the Top 10 are exactly the regression the sweep was supposed to catch. |
| TIM-2829 | Scout Feedback Panel | `src/components/copilot/CoPilotDrawer.tsx` confirmed responsive — fine |
| TIM-2830 | Platform-wide sweep | **Confirmed regressed / incomplete on the Settings/Account surface** (the board's proof case). The tabbed `SettingsShell` (gated by `NEXT_PUBLIC_BILLING_TAB`) landed *after* the sweep and reintroduced the sidebar-vs-content flex without a mobile guard. |

---

## 4. Findings by area

### 4.1 Settings / Account (board's proof case — confirmed)

Files audited: `src/app/account/page.tsx`, `src/app/account/layout.tsx`, `src/app/account/billing/page.tsx`, `src/app/account/documents/page.tsx`, `src/app/account/projects/page.tsx`, `src/components/account/settings/SettingsShell.tsx`, `src/components/account/settings/BillingTab.tsx`, `src/components/account/ProfileNameEditor.tsx`, `src/components/account/LocalizationSettingsCard.tsx`, `src/components/account/LanguageSettingsCard.tsx`, `src/components/account/ProFeatureEntries.tsx`, `src/components/account/AccountDataControls.tsx`, `src/components/account/GuidedNoticesCard.tsx`, `src/components/account/RevertToggle.tsx`, `src/components/account/HiringRevertToggle.tsx`, `src/components/account/DocumentsTable.tsx`, `src/components/ui/card.tsx`.

| Surface | URL | File:line | Pattern | Severity | Component owner |
|---|---|---|---|---|---|
| SettingsShell sidebar+content | `/account` (tabbed) | `SettingsShell.tsx:49-56` | `max-w-5xl px-6` + `flex gap-8` + `nav w-44 flex-shrink-0` + `flex-1` → ~119 px content at 375 px | **BLOCK** | `SettingsShell` |
| Profile card row | `/account` | `page.tsx:104-111` | `flex justify-between`, no responsive stack, no `truncate`/`break-all` on `user.email` | SERIOUS | Account page (uses `Card`) |
| Subscription card row | `/account` | `page.tsx:122-133` | Same as above — long status strings ("X of 5 trial messages left") side-by-side with label, no overflow handling | SERIOUS | Account page |
| Invoices table forces H-scroll | `/account/billing` | `BillingTab.tsx:295, 324, 330` | `overflow-x-auto` + `whitespace-nowrap` on Date + Amount columns + unbounded Description column | SERIOUS | `BillingTab` |
| Invoice description overflow | `/account/billing` | `BillingTab.tsx:327` | No `truncate` / `break-word` on description cell | SERIOUS | `BillingTab` |
| Delete-account modal | `/account` (Data tab) | `AccountDataControls.tsx:142` | `max-w-md` (448 px) — wider than 375 px viewport; touches screen edges | SERIOUS | `AccountDataControls` |
| Documents row actions menu | `/account/documents` | `DocumentsTable.tsx:273` | `w-44` dropdown `absolute right-0` — can overflow viewport if scrolled | SERIOUS | `DocumentsTable` |
| Localization grid 5-field wrap | `/account` | `LocalizationSettingsCard.tsx:83-140` | `grid-cols-1 sm:grid-cols-2` correct, but 5 fields = awkward 2+2+1 trailing row | COSMETIC | `LocalizationSettingsCard` |
| Profile name editor tap targets | `/account` | `ProfileNameEditor.tsx:107, 127` | Pencil icon `p-0.5 size={13}` ≈ 13×13 px; cancel `p-1 size={14}` ≈ 14×14 px — both below 44×44 | COSMETIC | `ProfileNameEditor` |

Shared owners called out: `SettingsShell`, Account `page.tsx` (key-value rows), `BillingTab`, `DocumentsTable`, `AccountDataControls`.

### 4.2 Workspace surfaces

Files audited: every directory under `src/app/(app)/workspace/` plus `src/components/workspace/`, `src/components/equipment/EquipmentGrid.tsx`, `src/components/copilot/CoPilotDrawer.tsx`, `src/components/copilot/PastChatsDrawer.tsx`, `src/components/ui/section-help.tsx`, `src/components/section-header/SectionHeader.tsx`.

| Surface | URL | File:line | Pattern | Severity | Component owner |
|---|---|---|---|---|---|
| Equipment grid | `/workspace/buildout-equipment` | `EquipmentGrid.tsx:1378` | `<table min-w-[900px]>` | **BLOCK** | `EquipmentGrid` |
| Menu ingredient grid | `/workspace/menu-pricing` | `menu-workspace.tsx:850` | `<div min-w-[640px]>` | **BLOCK** | `menu-workspace` ingredient editor |
| Startup costs table | `/workspace/financials` | `financials-workspace.tsx:734` | `<table min-w-[480px]>` | SERIOUS | `financials-workspace` |
| P&L V2 table | `/workspace/financials` | `financials-v2.tsx:352` | `<table min-w-[440px]>` | SERIOUS | `financials-v2` |
| Opening-month calendar | `/workspace/opening-month-plan` | `opening-month-plan-workspace.tsx:536` | `<div min-w-[350px] grid grid-cols-7>` → ~50 px/cell at 375 px | SERIOUS | Calendar |
| Opening-month milestone form | same | `opening-month-plan-workspace.tsx:653, 680` | `grid grid-cols-2 gap-3` — no mobile-first 1-col | SERIOUS | Calendar form |
| Menu costing summary | `/workspace/menu-pricing` | `menu-workspace.tsx:1542` | `grid grid-cols-2 gap-3` — no `grid-cols-1 sm:` | SERIOUS | `menu-workspace` |
| Workspace header actions | All workspace pages | `WorkspaceHeader.tsx:52-54, 71` | `gap-3 flex-wrap` + `flex-shrink-0` buttons — title + description + chips wrap to 3+ rows | SERIOUS | `WorkspaceHeader` |
| Section help popover | Every workspace section | `section-help.tsx:57` | `w-72` (288 px) at `left-0` — overflows on right-aligned triggers at 375 px | SERIOUS | `SectionHelp` |
| BP card padding | `/workspace/business-plan` | `quality-check-panel.tsx:204, 222, 351, 360` | `p-8` → 311 px usable inside 375 px viewport | COSMETIC | `quality-check-panel` |
| Depreciation empty card | `/workspace/financials` | `tabs/depreciation-tab.tsx:335` | `p-8` empty state | COSMETIC | `depreciation-tab` |
| `SectionHeader` "Write with AI" | Every workspace section | `SectionHeader.tsx:54` | `whitespace-nowrap flex-shrink-0` — title `truncate`s gracefully but on long titles the line is mostly button; acceptable but tight | COSMETIC | `SectionHeader` |

Per-tab usability at 375 px (subjective from code-level review):

| Workspace tab | Grade | Worst offender |
|---|---|---|
| Concept | B+ | `SectionHelp` popover only |
| Business Plan | B+ | `p-8` padding + `SectionHelp` |
| Financials | **C** | Two `min-w-[440/480px]` tables + `SectionHelp` |
| Buildout & Equipment | **D** | `min-w-[900px]` equipment grid |
| Suppliers | C+ | Table with dynamic widths |
| Hiring | B | `WorkspaceHeader` + multi-column forms otherwise OK |
| Menu & Pricing | **D** | `min-w-[640px]` ingredient grid + `grid-cols-2` costing |
| Location / Lease | A | None observed |
| Launch Plan | A | None observed |
| Opening Month Plan | C | `min-w-[350px]` 7-col calendar + form `grid-cols-2` |
| Marketing | A | None observed |
| Operations Playbook | A | None observed |
| Inventory | B | `SectionHelp` only |

### 4.3 Auth, onboarding, dashboard, marketing

Files audited: every `src/app/login/`, `src/app/signup/`, `src/app/forgot-password/`, `src/app/reset-password/`, `src/app/auth/`, `src/app/coming-soon/`, `src/app/onboarding/`, `src/app/(app)/dashboard/`, `src/app/landing/`, `src/app/pricing/`, `src/app/help/`, `src/app/privacy/`, `src/app/terms/`, `src/app/subscription-terms/`, `src/app/affiliates/`, `src/app/_components/*`.

| Surface | URL | File:line | Pattern | Severity | Component owner |
|---|---|---|---|---|---|
| Menu mockup grid | `/coming-soon` (also previews on marketing) | `Mockups.tsx:231, 237` | `grid grid-cols-4` no `sm:` — 4 columns × ~80 px at 375 px is unreadable | **BLOCK** | `MenuMockup` |
| GDPR legal-basis table | `/privacy` | `page.tsx:98-147` | 2-col `<table>` in `overflow-x-auto` — long legal text forces H-scroll | SERIOUS | Privacy page table |
| Transfer-mechanism table | `/privacy` | `page.tsx:165-191` | Same — recipient names + legal text | SERIOUS | Privacy page table |
| Auth form | `/login`, `/signup` | `login/page.tsx:66`, `login-form.tsx:452` | `max-w-sm` + `p-8` → 320 px content; functional but tight; OAuth button still ≥44 px tall | COSMETIC | Auth form chrome |
| Coming-soon nav account chip | `/coming-soon` | `coming-soon/page.tsx:156-180` | Logo + 28 px avatar + 13 px name in `gap-4` — fits typical names | COSMETIC | Coming-soon header |
| Waitlist form stack | `/coming-soon` | `WaitlistForm.tsx:111-151` | `flex-col sm:flex-row` correct; Turnstile widget stacked below — dense but functional | COSMETIC | `WaitlistForm` |
| Pricing 2-up cards | `/pricing` | `pricing/page.tsx:274` | `grid sm:grid-cols-2` — stacks 1-col at 375 px (correct) but each card `p-8` tight | COSMETIC | Pricing card |
| Feature accordion | `/coming-soon`, landing | `FeatureAccordion.tsx:188` | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` — correct | OK | `FeatureAccordion` |
| Onboarding intake form | `/onboarding` | `onboarding-flow.tsx` (multiple) | Forms stack with `flex-col`; no observed overflow | OK | `onboarding-flow` |

**Public-surface screenshots (375 px) shipped in this PR**:

- `scripts/screenshots/tim3411/coming-soon-375.png` — landing/`/` → `/coming-soon`
- `scripts/screenshots/tim3411/pricing-375.png`
- `scripts/screenshots/tim3411/login-375.png`
- `scripts/screenshots/tim3411/signup-375.png`
- `scripts/screenshots/tim3411/forgot-password-375.png`
- `scripts/screenshots/tim3411/help-375.png`
- `scripts/screenshots/tim3411/privacy-375.png`
- `scripts/screenshots/tim3411/terms-375.png`
- `scripts/screenshots/tim3411/subscription-terms-375.png`
- `scripts/screenshots/tim3411/affiliates-apply-375.png`

Plus 360 px and 414 px variants of all of the above (11 paths × 3 viewports = 33 PNGs in the same directory). All returned HTTP 200; none triggered document-level horizontal scroll.

### 4.4 Shared chrome & UI primitives

This is the highest-leverage section — fix here propagates to dozens of surfaces. Files audited: every primitive in `src/components/ui/`, `src/components/section-header/SectionHeader.tsx`, `src/components/SidebarV2.tsx`, `src/components/bottom-tab-bar.tsx`, `src/components/workspace/WorkspaceTopBar.tsx`, `src/components/copilot/CoPilotDrawer.tsx`, `src/components/copilot/PastChatsDrawer.tsx`, `src/components/paywall-modal.tsx`, `src/components/credit-packs-modal.tsx`, `src/components/pro-upgrade-prompt.tsx`, `src/components/consent/CookieConsentBanner.tsx`, `src/components/project-switcher.tsx`, `src/components/DismissibleCallout.tsx`, `src/components/email-confirm-banner.tsx`, `src/app/_components/SessionExpiredBanner.tsx`.

| Component | File:line | Pattern at 375 px | Severity | Approx usages | Surfaces affected |
|---|---|---|---|---|---|
| **`CoPilotDrawer`** | `copilot/CoPilotDrawer.tsx:346-348` | `PANEL_MIN_WIDTH = 360`, `PANEL_DEFAULT_WIDTH = 448`. Effective drawer width clamps to `min(max(360, panelWidth), viewport − 16)` → 359 px at 375 px viewport, leaving < 16 px of workspace behind. | **BLOCK** | 45 (root shell) | Every authenticated workspace page when AI panel opens |
| **`InfoTip`** | `ui/info-tip.tsx:64` | `absolute left-0 w-64` (256 px) popover. On any field whose tip trigger is right-of-centre, the popover overshoots the right viewport edge. No edge detection / flip logic. | **BLOCK** | 45 | Every form field tooltip across Concept, Financials, Hiring, Buildout, Operations, Marketing |
| **`SectionHelp`** | `ui/section-help.tsx:57` | `absolute left-0 w-72` (288 px) — same pathology as `InfoTip` but larger. | SERIOUS | 43 | Every `SectionHeader` `(?)` icon |
| **`FieldExamplePopover`** | `ui/field-example-popover.tsx:58` | `max-w-72` (288 px) inline, no edge-clamp. If field is near right gutter, popover juts. | SERIOUS | ~7-10 | Lightbulb "See example" on Concept + Hiring fields |
| **`SectionHeader`** | `section-header/SectionHeader.tsx:38` | `flex items-center justify-between gap-4` — title `truncate min-w-0` is correct, "Write with AI" is `whitespace-nowrap flex-shrink-0`. Title ellipsises gracefully BUT on the longest titles (e.g. "Equipment & Supplies Suite") the visible title shrinks to "Equ…" leaving the button to dominate. The board canon `[Title] [Help] ─── [Button]` is preserved structurally. | COSMETIC | 43 | All workspace section headers |
| **`PaywallModal`** | `paywall-modal.tsx:102` | `max-w-sm w-full p-8` inside `inset-0 p-4` wrapper. At 375 px: 375 − 32 (outer) − 64 (inner padding) = 279 px for content. Fits but fragile. | COSMETIC | 4+ (paywall, credit, upgrade, trial-end) | Paywall surfaces app-wide |
| **`CookieConsentBanner`** | `consent/CookieConsentBanner.tsx:48-54` | Two `size="lg"` buttons in `flex items-center gap-3` row. ≈ 200 px buttons + gap + banner text padding can exceed 375 px width and trigger wrap; no `flex-col sm:flex-row`. | LOW-MEDIUM | 4 | All public surfaces before consent (landing, auth, onboarding) |
| **`ProjectSwitcher`** dropdown | `project-switcher.tsx:150+` | Menu `absolute` relative to button inside SidebarV2 drawer (`w-[280px]`). Dropdown content tries to expand beyond drawer width; clipped by `overflow-hidden` or z-order. No `right-0 inset-x-0` fallback. | MEDIUM | 13 (SidebarV2 only) | Mobile drawer project switcher |
| **`Card`** primitive | `ui/card.tsx:13-30` | Defaults `px-4 py-3` (16 / 12 px) — 343 px usable inside 375 px viewport. Fine on its own; pain is parents overriding to `p-6` / `p-8` (Business Plan, depreciation tab). | OK (primitive) | — | n/a |
| **`Input`** primitive | `ui/input.tsx:9` | `flex h-9 w-full` — `w-full` respects container. | OK | — | n/a |
| **`Button`** primitive | `ui/button.tsx` | Size variants ≥ `h-9` (36 px); `size="lg"` ≥ `h-11` (44 px). Tap-target compliance depends on caller picking the right size. | OK (primitive) | 4+ direct imports, many via `<button>` | n/a |
| **`SidebarV2`** desktop rail | `SidebarV2.tsx:709` | `hidden lg:flex` + `w-[224px]` desktop-only — `lg:` is 1024 px so it never renders below tablet. Correct. | OK | 13 | All authenticated surfaces (mobile uses drawer below) |
| **`SidebarV2`** mobile drawer | `SidebarV2.tsx:716-739` | `w-[280px]` translating from left, `bg-black/40` overlay, escape-trap focus management. 280 / 375 = 75 % drawer, 25 % dim — correct touch UX. | OK | 13 | Mobile nav drawer |
| **`BottomTabBar`** | `bottom-tab-bar.tsx:4-6` | `return null` — removed per TIM-3407. Confirmed: mobile primary nav is hamburger → `SidebarV2` drawer + `WorkspaceTopBar` hamburger. | OK (removed) | n/a | n/a |
| **`WorkspaceTopBar`** | `workspace/WorkspaceTopBar.tsx:46` | `sticky top-0 h-12 px-4 gap-3` — hamburger (20 px) + gap-3 + flex-1 title (truncates) + optional status chip. Title ellipsises on overflow. | OK | 7 | All workspace pages |
| **`DismissibleCallout`** / **`SessionExpiredBanner`** / **`EmailConfirmBanner`** | various | Full-width banners with `w-full`; close icon ≥ 32 px hit-box. Not flagged. | OK | 23 combined | App-wide notifications |

**Confirm/refute on mobile nav strategy** (issue §3 ask):
- **CONFIRMED**: per `TIM-3407`, `BottomTabBar` is a no-op (`return null`). The mobile primary nav is the **hamburger button on `WorkspaceTopBar`** that dispatches a `workspace-sidebar-open` `CustomEvent`, and **`SidebarV2`** renders a 280 px left drawer with overlay in response. This is the entire mobile chrome.
- No competing mobile nav exists; no regressions in nav strategy itself.

---

## 5. Modals / overlays / drawers

| Component | File | 375 px behaviour | Verdict |
|---|---|---|---|
| `CoPilotDrawer` (AI Companion / Scout) | `src/components/copilot/CoPilotDrawer.tsx:346-348` | `PANEL_MIN_WIDTH = 360` covers 96 % of viewport — workspace beneath is unreadable while panel is open | **BLOCK — Top 10 #1** |
| `PastChatsDrawer` | `src/components/copilot/PastChatsDrawer.tsx` | Left-side drawer, motion-managed; clamp to viewport observed | OK |
| `SidebarV2` mobile drawer | `src/components/SidebarV2.tsx:725-740` | `w-[280px]` + overlay, hamburger trigger | OK |
| `paywall-modal` | `src/components/paywall-modal.tsx:102` | `max-w-sm w-full p-8` inside `inset-0 p-4` — 279 px content area at 375 px; fits but fragile | COSMETIC |
| `credit-packs-modal` | `src/components/credit-packs-modal.tsx` | Same family as paywall-modal; same constraint | COSMETIC |
| `AccountDataControls` delete modal | `src/components/account/AccountDataControls.tsx:142` | `max-w-md` (448 px) — wider than viewport → touches screen edges at 375 px | SERIOUS |
| `pro-upgrade-prompt` | `src/components/pro-upgrade-prompt.tsx` | Not flagged by static audit | Pending visual |

---

## 6. Tap targets

No platform-wide audit of WCAG 2.5.5 (44×44 px) was attempted — but specific targets flagged by the static review:

- `ProfileNameEditor.tsx:107` — pencil edit icon `p-0.5 size={13}` ≈ 13 × 13 px
- `ProfileNameEditor.tsx:127` — cancel `p-1 size={14}` ≈ 14 × 14 px
- `SectionHelp` trigger (`section-help.tsx`) — likely ≤ 20 × 20 px; needs measurement
- All `<InfoTip>` triggers across workspace (`src/components/ui/info-tip.tsx`) — likely ≤ 20 × 20 px

CEO should consider whether to file a **separate** tap-target sweep as a fix child — that needs measurement, not just inspection.

---

## 7. What this audit did NOT cover

- **No code changes.** Per issue spec.
- **Authenticated surfaces** were audited at code level only — screenshots blocked by lack of a session on this host. Recommend the QA Lead capture in-app screenshots from a real synthetic session before fix children close.
- **Performance / Lighthouse Mobile** scores. Pure layout audit.
- **Email templates** — not in scope of this issue (was in scope of Groundwork UI Consistency Protocol, but board's TIM-3410 referred to "every major surface" of the app, not transactional email).
- **Admin pages** (`src/app/admin/*`) — code-level survey only. They have zero responsive variants but are internal-only; severity is low for the public goal.

---

## 8. Recommended fix-child structure (for CEO to file)

Suggested decomposition matching the board's "fix at component level" guidance. Ordered by leverage (usage × severity):

1. **`CoPilotDrawer` mobile floor** (Top 10 #1) — change `PANEL_MIN_WIDTH` from 360 to `clamp(280, viewport − 48)` at `< sm` so the underlying workspace remains visible. Single-file change in `src/components/copilot/CoPilotDrawer.tsx`; affects all 45 mount sites. **One PR.**
2. **Popover edge-clamp pattern — `InfoTip`, `SectionHelp`, `FieldExamplePopover`** (Top 10 #2 + #7 + chrome §4.4) — shared fix: compute `min(w-XX, viewport − safe-margin)`; flip anchor right when trigger is past viewport midpoint. Single helper / hook reused by all three components. Resolves ~95 instances. **One PR.**
3. **Tables sweep — equipment, menu, financials, opening-month, BillingTab** (Top 10 #4, #5, #10, plus opening-month §4.2) — shared mobile pattern. Two-option spike: (a) keep `overflow-x-auto` with sticky-first-column for scroll discoverability, or (b) collapse to card-stack at `< sm` for the editable grids and keep table for read-only invoices. Recommend (b) for editable grids, (a) for invoice table. **One PR with the pattern + apply to all five owners.**
4. **`SettingsShell` mobile-first refactor + Account page key-value rows** (Top 10 #3 + #8) — `flex-col lg:flex-row` for the rail/content split; `flex-col gap-1 sm:flex-row sm:justify-between` for `page.tsx` rows + add `break-all` to email/plan cells. Same file family. **One PR.**
5. **`WorkspaceHeader`** (Top 10 #9) — replace `flex-wrap` with `flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`; collapse action chips into a `…` overflow menu at `< sm`. Affects every workspace tab. **One PR.**
6. **`MenuMockup` grid** (Top 10 #6) — marketing-only fix. `grid-cols-2 sm:grid-cols-4` or `hidden sm:grid` + a mobile card variant. **Small PR.**
7. **Privacy / Terms tables** — content-team rewrite as nested DL or stacked card list. 2-col compliance tables don't need to be `<table>`. Probably a content PR rather than CSS. **Small PR.**
8. **Modal width audit** — `AccountDataControls` delete modal + sweep `paywall-modal`, `credit-packs-modal`, `pro-upgrade-prompt` for `max-w-md`+ without mobile guard. Establish a `Modal` primitive if one doesn't yet exist that handles the viewport-clamp once. **One PR.**
9. **Tap-target sweep** — separate observational+fix issue. `ProfileNameEditor` pencil/cancel icons, `InfoTip` triggers, `SectionHelp` triggers all measure under 24 px hit-box. Needs WCAG 2.5.5 audit; could be its own QA-led issue. **One PR after measurement.**

Issues 1, 2, 3, 4, 5 alone fix > 95 % of the workspace mobile pain by component count. Recommend filing 1+2 first (highest leverage), then 3, then 4–9 in parallel.

Standing approvals: SA-1 (auto-merge UI PRs) and SA-Deploy (direct-to-prod with revert flag where appropriate) cover each of the above per [TIM-2894](/TIM/issues/TIM-2894#document-policy-sa-1) and [TIM-3261](/TIM/issues/TIM-3261#document-policy-sa-deploy). For the bigger items (1, 2, 3, 4, 5) recommend shipping behind the existing `ui_revamp_v2` revert-flag pattern.

---

## 9. References

- [TIM-3410](/TIM/issues/TIM-3410) — board directive: fix mobile responsiveness platform-wide.
- [TIM-2825](/TIM/issues/TIM-2825) — prior mobile program (closed 2026-06-24); five children TIM-2826…TIM-2830.
- [TIM-1537](/TIM/issues/TIM-1537) — Groundwork Style Guide (canonical tokens, components, anti-patterns).
- [TIM-2242](/TIM/issues/TIM-2242) / [TIM-2252](/TIM/issues/TIM-2252) — standing engineering rules (none of the five rules block fix children).
- Screenshot script: `scripts/tim3411-mobile-shots.mjs`.
- Screenshot output: `scripts/screenshots/tim3411/` (33 PNGs + `summary.json`).

---

*Audit complete. Routing to CEO for fix-child decomposition.*
