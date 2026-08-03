"use client";

// TIM-3331: Shared section-aware row primitives for workspace tables.
// SectionHeaderRow, SectionSubtotalRow, GrandTotalRow — added to the shared
// component family (workspace-table.ts) per EM scope expansion on TIM-3331.
// Exportable for Menu, Supplies, Equipment, and future workspaces.

// TIM-4114 (UX Phase 5): SectionHeaderRow is the "Espresso Machines" band that
// groups rows beneath it on Equipment and Supplies — the exact thing Trent
// named. It used to sit on --surface-warm-100 (#f5f4f0) inside a white card on
// a #faf9f7 page, which is a 3% luminance step being asked to do the job of a
// structural divider. It now carries the platform teal band.
//
// Note the subtotal row directly below is deliberately NOT teal. Three teal
// bands per category (header, rows, subtotal) turns a table into a barcode.
// The band marks where a group STARTS; the subtotal is a quiet full stop.

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  TABLE_GROUP_HEADER_ROW_CLS,
  TABLE_GROUP_HEADER_TEXT_CLS,
} from "@/lib/workspace-table";

export function SectionHeaderRow({
  colSpan,
  title,
  collapsed,
  onToggle,
  onAddItem,
  canEdit,
}: {
  colSpan: number;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  onAddItem?: () => void;
  canEdit?: boolean;
}) {
  return (
    <tr className={TABLE_GROUP_HEADER_ROW_CLS}>
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1.5 group select-none"
          >
            {/* Chevron and title both sit on teal now, so the hover cue can no
                longer be "go teal". It is a fade instead. */}
            <span className="text-white/70 group-hover:text-white transition-colors">
              {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </span>
            <span
              className={`${TABLE_GROUP_HEADER_TEXT_CLS} group-hover:underline decoration-white/40 underline-offset-2`}
            >
              {title}
            </span>
          </button>
          {canEdit && onAddItem && (
            <button
              type="button"
              onClick={onAddItem}
              className="flex items-center gap-1 text-[10px] font-medium text-white/85 hover:text-white hover:bg-white/15 rounded px-1.5 py-0.5 transition-colors shrink-0"
            >
              <Plus size={10} />
              Add item
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function SectionSubtotalRow({
  colSpan,
  label,
  subtotalDisplay,
}: {
  colSpan: number;
  label: string;
  subtotalDisplay: string;
}) {
  return (
    <tr className="border-b border-[var(--neutral-cool-150)]" style={{ background: "rgba(var(--neutral-cool-100-rgb,240,240,245),0.4)" }}>
      <td colSpan={colSpan} className="px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            {label}
          </span>
          <span className="text-xs font-semibold text-[var(--foreground)] pr-1">
            {subtotalDisplay}
          </span>
        </div>
      </td>
    </tr>
  );
}

export function GrandTotalRow({
  colSpan,
  label,
  totalDisplay,
}: {
  colSpan: number;
  label: string;
  totalDisplay: string;
}) {
  return (
    <tr className="bg-[var(--teal-bg-pale,#f0fafa)] border-t-2 border-[var(--teal-tint)]">
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-[var(--foreground)] uppercase tracking-wide">
            {label}
          </span>
          <span className="text-xs font-bold text-[var(--foreground)] pr-1">
            {totalDisplay}
          </span>
        </div>
      </td>
    </tr>
  );
}
