# Cross-Component Data Sync Standard (TIM-1694)

How one component/workspace consumes data owned by another and keeps the
Business Plan congruent. This is the platform standard — new cross-component
dependencies follow it; existing ones are being audited against it (TIM-1695).

## Decision: default to auto-sync on load

There are two sanctioned mechanisms. Pick by the *direction* and *destructiveness*
of the data flow, not by surface.

### 1. Auto-sync on load (shared-read) — the default

Use when component B derives values from component A's data and the propagation
is **pure data** (no AI generation, no overwrite of values the user typed into B).
B reads A's current data at load/assembly time and computes derived values
automatically. No button required.

- The consumer reads the source at render/assembly time and recomputes. It never
  persists a stale snapshot of the source.
- Show a provenance label on the derived value: **"Synced from `<source>`"**
  (e.g. "Synced from Menu"). Provenance is required, not optional.
- Examples in the codebase:
  - Menu → Financials COGS blended pct — `computeMenuBlendedCogsPct` fed as
    `ProjectionContext.menu_blended_cogs_pct` (TIM-1117; threaded into the
    Business Plan assembler in TIM-1694).
  - Equipment → Financials capex synthetic lines (TIM-1253).
  - Source workspaces → Business Plan section assembly (TIM-1498) via
    `assemble*` functions in `src/lib/business-plan.ts`.

### 2. Opt-in linked sync with review — only when overwrite is possible

Use when the flow is **bidirectional** or would **overwrite values the user
entered** in the consumer. Gate it behind an explicit link toggle (off by
default) plus per-change review (pull/push with a visible diff). Nothing is
overwritten silently.

- Example: Salaries ↔ Org Structure (`OrgSyncPanel`, `src/lib/org-sync.ts`,
  TIM-1259) — pull org roles into Salaries / push salaries back, each reviewed.

## Hard rules

- **Pure data propagation auto-syncs. AI-generated content never does.** The
  `[AI never auto-applies]` rule covers AI suggestions only — they require an
  explicit user accept. Menu → COGS is data sync, so it auto-syncs.
- **No persisted stale snapshots.** A consumer that caches the source's values
  must recompute on load, or it drifts (this was the TIM-1694 COGS bug: the
  Business Plan assembler passed an empty context, so menu-linked COGS lines had
  no rate and rendered $0).
- **Provenance is required.** Every cross-component-derived value shows its
  source. Where the user can also edit the value locally, provide a manual
  **"Refresh from `<source>`"** control alongside the auto-sync.

## UI affordance (Groundwork)

Any new sync affordance (provenance label, refresh control, link toggle) is a UI
change and MUST go through the Groundwork UI Consistency Protocol against the
style guide (TIM-1537). Reuse existing components — do not invent a new badge or
button. The provenance label matches the existing "Synced from …" / shared-read
treatment already used in the Financials workspace.
