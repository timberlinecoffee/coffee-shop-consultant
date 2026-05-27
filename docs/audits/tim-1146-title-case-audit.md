# TIM-1146 — Platform-wide Title Case Audit

Founder feedback on [TIM-1114]: two strings in the Location & Lease
shortlist view are not in Title Case. This document is the **third
title-case sweep** following [TIM-905] (static labels) and [TIM-1002]
(AI-generated and seed-data content). The focus here is **dynamic
template headers** that bypass both prior fixes — strings built from
counts, names, or sentence fragments.

## Method

Greped `src/components/`, `src/app/`, and workspace pages for:

- `<h1>` – `<h6>` text nodes
- `CardTitle` / `DialogTitle` / `SheetTitle` / `AlertTitle`
- `font-semibold` / `font-bold` paragraph and span headers
- `<label>` text where the label sits above a form input
- Template-literal subtitles built from counts and sentence fragments

Each hit was classified against [`docs/STYLE_GUIDE.md`](../STYLE_GUIDE.md).
Full sentences and 2-word button labels (`Save`, `Delete`, `Add location`)
stay sentence-case per the acceptance carve-out.

## Fixes

| File:line | Surface | Before | After |
|---|---|---|---|
| `src/components/location-lease/TradeoffPanel.tsx:290` | Dialog subtitle (founder-named) | `{count} shortlisted · visual comparison + AI recommendation` | `{count} Shortlisted · Visual Comparison + AI Recommendation` |
| `src/components/concept/PersonaSection.tsx:238` | Dialog h2 | `Sample persona` | `Sample Persona` |
| `src/components/launch-plan/MarketingKickoffChecklistCard.tsx:60` | Card h2 | `Marketing kickoff` | `Marketing Kickoff` |
| `src/components/launch-plan/HiringPlanCard.tsx:76` | Card h2 | `Hiring plan` | `Hiring Plan` |
| `src/components/launch-plan/SoftOpenPlanCard.tsx:80` | Card h2 | `Soft open plan` | `Soft Open Plan` |
| `src/components/launch-plan/LaunchTimelineCard.tsx:604` | Card h2 | `Launch timeline` | `Launch Timeline` |
| `src/app/copilot-demo/page.tsx:45` | Page h1 | `Co-pilot demo` | `Co-Pilot Demo` |
| `src/app/copilot-demo/page.tsx:66` | Page h1 | `CoPilotDrawer demo` | `CoPilotDrawer Demo` |
| `src/components/buildout/SectionedListGrid.tsx:1062` | Popover header | `Show / hide columns` | `Show / Hide Columns` |
| `src/components/concept/PersonaEditor.tsx:242` | Field group label | `What they value` | `What They Value` |
| `src/components/concept/PersonaEditor.tsx:274` | Collapsible header | `About them` | `About Them` |
| `src/components/concept/PersonaEditor.tsx:281` | Form label | `Age range` | `Age Range` |
| `src/components/concept/PersonaEditor.tsx:319` | Form label | `Income range` | `Income Range` |
| `src/components/concept/PersonaEditor.tsx:342` | Form label | `Daily context` | `Daily Context` |
| `src/components/concept/PersonaEditor.tsx:363` | Form label | `Visit frequency` | `Visit Frequency` |
| `src/components/concept/PersonaEditor.tsx:386` | Form label | `Spend per visit` | `Spend per Visit` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:173` | Form label | `Add ingredient` | `Add Ingredient` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:329` | Form label | `Package size` | `Package Size` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:355` | Form label | `Package cost ($)` | `Package Cost ($)` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:370` | Form label | `Cost per unit` | `Cost per Unit` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:615` | Form label | `Retail price ($)` | `Retail Price ($)` |
| `src/app/workspace/menu-pricing/menu-workspace.tsx:629` | Form label | `Cost of goods` | `Cost of Goods` |

## Kept as sentence case (NOT fixed — full sentences or short button labels)

These are intentional non-fixes per the [docs/STYLE_GUIDE.md] carve-outs:

| File:line | String | Reason |
|---|---|---|
| `src/app/dashboard/error.tsx:23` | `Something went wrong` | Full sentence (subject + verb) |
| `src/app/workspace/concept/concept-editor.tsx:637` | `Your concept is set.` | Full sentence |
| `src/app/workspace/inventory/inventory-workspace.tsx:55` | `Generate a starter supplies list` | Instructional CTA fragment ("Generate a/the/an …" pattern) |
| `src/app/workspace/launch-plan/launch-plan-workspace.tsx:793` | `Lead-time conflicts detected:` | Inline callout sentence with colon |
| `src/app/workspace/suppliers/suppliers-workspace.tsx:599` | `Choose {vendorName}?` | Instructional question |
| `src/app/workspace/menu-pricing/menu-workspace.tsx` various | `Confirm delete`, `Add location`, `Make primary` | 2-word button labels (existing convention) |

## Spot-checks (per acceptance #4)

- **Suppliers** (`src/app/workspace/suppliers/`): table headers `Name`,
  `Contact`, `Price / Unit`, `Minimum Order`, `Lead Time`, `Notes`,
  `Status` — all Title Case. h2 `Choose {vendorName}?` is sentence-case
  intentionally (instructional question).
- **Operations Playbook** (`src/app/workspace/operations-playbook/`):
  print h1 `Operations Playbook`, h2 section headers, h3 uppercase
  callouts — all Title Case or uppercase-tracked.
- **Dashboard** (`src/app/dashboard/page.tsx`): `Quick Links`,
  `Start Here`, `Coming Up`, `Export Business Plan` — all Title Case.

No regressions identified.

**Dead code skipped:** `src/components/workspace/FinancialsWorkspace.tsx`
contains `Total revenue`, `Gross profit`, `Fixed costs`, `Net profit / month`
P&L line labels but has no importers anywhere in the repo. Left untouched
to avoid scope creep — file should be deleted in a separate cleanup pass.

## Verification

Production smoke (acceptance #3): Location & Lease shortlist view with
2 shortlisted candidates; trade-off dialog opened; both the h2 title
"Shortlist Trade-Off" and the subtitle "{n} Shortlisted · Visual
Comparison + AI Recommendation" render in Title Case.
