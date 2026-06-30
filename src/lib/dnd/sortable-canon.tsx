"use client";

// TIM-3490: Shared sortable-list canon for every drag-to-reorder surface.
//
// Why this exists: 5 inline @dnd-kit implementations live in this codebase
// (SectionedListGrid, CategorySettingsPanel, menu-workspace, hiring v1,
// hiring v2). Each redeclares the same grip + lift + sensor profile inline
// and they have drifted (hiring v2 = 12px grip vs everyone-else 14px; no
// consumer configures a real mobile long-press today). The architecture
// rule from feedback_section_header_canon_and_shared_component_rule says
// extract once, not copy a 6th time.
//
// What this is NOT: a monolith <SortableList> that owns DndContext. Each
// consumer keeps its own DndContext because their onDragEnd writes to
// different backing stores (REST PATCH, optimistic SetState, server actions,
// etc.). This module owns visuals + sensors only.
//
// Re-export `useSortable` + `arrayMove` + the canonical strategy so callers
// don't have to import @dnd-kit themselves except for the DndContext wrapper.

import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

// Re-exports so consumers do `import { ... } from "@/lib/dnd/sortable-canon"`
// instead of three @dnd-kit packages individually.
export { verticalListSortingStrategy, arrayMove };

// ── SortableHandle ──────────────────────────────────────────────────────────
// The grip button. Spread your useSortable() `attributes` and `listeners`
// into the props (handle is the drag activator, not the whole row).

export interface SortableHandleProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "aria-label"> {
  ariaLabel?: string;
  size?: 12 | 14;
}

export const SortableHandle = forwardRef<HTMLButtonElement, SortableHandleProps>(
  function SortableHandle(
    { ariaLabel = "Drag to reorder", size = 14, className, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel}
        className={
          "cursor-grab active:cursor-grabbing text-[var(--neutral-cool-350)] " +
          "hover:text-[var(--neutral-cool-600)] transition-colors shrink-0 " +
          "touch-none" +
          (className ? ` ${className}` : "")
        }
        {...rest}
      >
        <GripVertical size={size} />
      </button>
    );
  },
);

// ── useSortableLift ─────────────────────────────────────────────────────────
// Canonical style object for a row that is being dragged. Pass the
// `transform`, `transition`, and `isDragging` returned by useSortable().

export interface SortableLiftInput {
  transform: { x: number; y: number; scaleX: number; scaleY: number } | null;
  transition: string | undefined;
  isDragging: boolean;
}

export function useSortableLift(input: SortableLiftInput): CSSProperties {
  return {
    transform: CSS.Transform.toString(input.transform),
    transition: input.transition,
    opacity: input.isDragging ? 0.5 : 1,
    zIndex: input.isDragging ? 10 : undefined,
  };
}

// ── useCanonicalSensors ─────────────────────────────────────────────────────
// PointerSensor + KeyboardSensor with a default 250ms touch long-press delay.
// Closes the mobile-long-press gap that every today-shipping consumer leaks.
// Callers can override `longPressMs` per surface (e.g. desktop-only lists set
// `longPressMs: 0` to skip the activation delay).

export interface CanonicalSensorsOptions {
  /**
   * Touch / coarse-pointer activation delay in ms. Defaults to 250 to satisfy
   * the TIM-3489 mobile DoD requirement. `0` disables the delay (mouse-only
   * use cases).
   */
  longPressMs?: number;
  /**
   * Pixels of movement tolerated during the delay window before the drag is
   * cancelled (so a scroll gesture doesn't kick off a drag by mistake).
   * Default 8px matches @dnd-kit's recommended floor.
   */
  tolerancePx?: number;
}

export function useCanonicalSensors(opts: CanonicalSensorsOptions = {}) {
  const delay = opts.longPressMs ?? 250;
  const tolerance = opts.tolerancePx ?? 8;
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: delay > 0 ? { delay, tolerance } : undefined,
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}

// ── SortableDropLine ────────────────────────────────────────────────────────
// Inline drop-indicator stripe rendered ABOVE the row when the dnd-kit
// active-over sentinel says this row will receive the drop. Use when a
// consumer wants a visible insertion line in addition to the default
// transform-shuffle animation. Optional — most consumers don't need it
// because the row-shuffle is already visible feedback.

export function SortableDropLine({ children }: { children?: ReactNode }) {
  return (
    <div
      role="presentation"
      className="relative -mt-1 mb-1 h-0.5 rounded-full bg-[var(--teal)] opacity-80"
    >
      {children}
    </div>
  );
}
