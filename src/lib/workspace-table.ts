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

/** Header-cell typography (size + weight + transform + tracking). */
export const TABLE_HEADER_TEXT = "text-[10px] font-semibold uppercase tracking-wider";

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
