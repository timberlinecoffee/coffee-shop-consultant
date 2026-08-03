// TIM-1894: Canonical workspace-table typography + control sizing.
// TIM-3251: Updated canonical source — Menu ingredients tab is now the reference
// (inverts TIM-1894 which used Equipment as the reference). Typography, row
// height, color treatment, and quick-add row pattern all extracted from
// menu-workspace.tsx IngredientsTab / IngredientTableRow / QuickAddRow.
//
// Reference values (Menu ingredients tab):
//   body cell   -> text-xs            (TABLE_CELL_TEXT)
//   header cell -> text-[10px] font-semibold uppercase tracking-wider (TABLE_HEADER_TEXT)
//   action icon -> lucide size={13}, padding p-0.5
//   row padding -> py-4 (generous ~52px row height)
//   name col    -> font-medium text-[var(--foreground)]
//   price col   -> text-sm font-semibold text-[var(--teal)] tabular-nums
//   unit col    -> text-[var(--muted-foreground)]
//   alt stripe  -> even rows bg-[var(--background)], odd rows bg-white
//   quick-add   -> bg-[var(--teal-bg-100)] border-t border-[var(--teal-bg-500)]

/** Body-cell font size. Apply on the <table> element so every cell inherits. */
export const TABLE_CELL_TEXT = "text-xs";

/**
 * Header-cell typography (size + weight + transform + tracking).
 *
 * @deprecated for TABLE header rows — use TABLE_HEADER_CELL_CLS below, which
 * carries the teal band and the white text as well as the type. This constant
 * stays for the places that want header-shaped type WITHOUT the band (subtotal
 * rows, stat-tile eyebrows, faux headers in flex layouts).
 */
export const TABLE_HEADER_TEXT = "text-[10px] font-semibold uppercase tracking-wider";

// ── TIM-4114 (UX Phase 5): the table-header standard ────────────────────────
//
// Trent, 2026-08-03: "on the Equipment and Supplies page, the headers are a
// beige that's similar to the background, so it doesn't really separate it out.
// Maybe the headers should have the teal background with white letters for each
// of the category headers and the header rows... This should be applied across
// the entire platform."
//
// The audit behind it found ~20 distinct header treatments across 34 files, on
// seven different background values (none, --background, --surface-warm-100,
// --gray-100, --muted, --neutral-cool-50, --neutral-cool-100). Not one was
// teal; not one used white text. Same class of drift as the eleven workspace
// headers Phases 1–3 fixed, one layer further down.
//
// Two bands, both white-on-teal:
//   • the COLUMN header at the top of a table          → *_HEADER_ROW/CELL_CLS
//   • a CATEGORY band inside the body ("Espresso Machines") → *_GROUP_HEADER_*
//
// Type is 11px here, not the 10px of TABLE_HEADER_TEXT. White uppercase at 10px
// on a saturated ground is technically 8.3:1 but reads thin and slightly
// smeared; 11px is the smallest size that stays crisp. That one pixel is the
// only reason these constants restate the typography instead of composing it.
//
// Guarded by workspace-table-headers.test.mjs: a <thead> that hand-rolls its
// own background fails the build.

/**
 * The column-header row. Goes on the `<tr>` inside `<thead>`.
 * Pair with TABLE_HEADER_CELL_CLS on each `<th>`.
 */
export const TABLE_HEADER_ROW_CLS =
  "bg-[var(--table-header-bg)] text-[var(--table-header-fg)]";

/**
 * A column-header cell. Dividers are white-on-teal rather than a border token,
 * because every border token in the system is a light grey that vanishes here.
 */
// The background is repeated on the CELL, not just the row. Several of these
// tables use `<thead className="sticky top-0">`, and a sticky header paints from
// its cells — a background set only on the <tr> lets the body scroll through it.
// That was already why the old cells carried bg-[var(--background)].
export const TABLE_HEADER_CELL_CLS =
  "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider " +
  "bg-[var(--table-header-bg)] text-[var(--table-header-fg)] " +
  "border-r border-white/20 last:border-r-0 select-none";

/**
 * A category / group band inside the table body. The white hairlines are what
 * separate it from the column header when it is the first row, and from the
 * data rows above it everywhere else.
 */
export const TABLE_GROUP_HEADER_ROW_CLS =
  "bg-[var(--table-group-header-bg)] text-[var(--table-header-fg)] " +
  "border-y border-white/25";

/** Type inside a group band. Matches the column header so the two read as kin. */
export const TABLE_GROUP_HEADER_TEXT_CLS =
  "text-[11px] font-semibold uppercase tracking-wider text-[var(--table-header-fg)]";

/** Row action-button (delete / icon) pixel size for lucide icons. */
export const TABLE_ACTION_ICON_SIZE = 13;

/** Vertical padding on data cells — generous row height matching Menu ingredients tab. */
export const TABLE_ROW_PADDING = "py-4";

/** Price / cost / total column typography — dark teal, semibold, tabular. */
export const TABLE_PRICE_CLS = "text-sm font-semibold text-[var(--teal)] tabular-nums";

/** Unit / secondary-label column — muted grey, smaller. */
export const TABLE_UNIT_CLS = "text-[var(--muted-foreground)]";

/** Quick-add row: teal-tinted background matching Menu QuickAddRow. */
export const TABLE_QUICK_ADD_ROW_CLS = "bg-[var(--teal-bg-100)] border-t border-[var(--teal-bg-500)]";

/** Quick-add input: teal-tint border, white bg, focus ring. */
export const TABLE_QUICK_ADD_INPUT_CLS =
  "w-full text-xs bg-white border border-[var(--teal-tint-cfe)] rounded-md px-2 py-1.5 text-[var(--foreground)] placeholder-[var(--teal-accent-2)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors";
