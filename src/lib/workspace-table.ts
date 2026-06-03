// TIM-1894: Canonical workspace-table typography + control sizing.
//
// Single source of truth, sourced from the Equipment table (EquipmentGrid.tsx) —
// the board-designated reference. EVERY workspace data table must use these
// tokens so cell/header font size and action-button size can never drift again.
//
// Board requirement (TIM-1886 Item 4): "The font in the tables across the
// platform should be the same — use the Equipment table as the reference."
//
// Reference values, measured from EquipmentGrid:
//   body cell   -> text-xs            (cellCls)
//   header cell -> text-[10px] font-semibold uppercase tracking-wide (headerCellCls)
//   action icon -> lucide size={13}, padding p-0.5

/** Body-cell font size. Apply on the <table> element so every cell inherits. */
export const TABLE_CELL_TEXT = "text-xs";

/** Header-cell typography (size + weight + transform + tracking). */
export const TABLE_HEADER_TEXT = "text-[10px] font-semibold uppercase tracking-wide";

/** Row action-button (delete / icon) pixel size for lucide icons. */
export const TABLE_ACTION_ICON_SIZE = 13;
