"use client";

import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLaunchPlanRows } from "./useLaunchPlanRows";
import type { LaunchItemStatus } from "@/types/supabase";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TimelineItem = {
  id: string;
  plan_id: string;
  milestone: string;
  target_date: string | null;
  status: LaunchItemStatus;
  depends_on: string | null;
  notes: string | null;
  order_index: number;
  digest: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type DrawerMode = { kind: "add" } | { kind: "edit"; item: TimelineItem };

interface FormValues {
  milestone: string;
  target_date: string;
  status: LaunchItemStatus;
  notes: string;
  depends_on: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: LaunchItemStatus[] = ["pending", "in_progress", "done", "at_risk"];

const STATUS_LABELS: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  at_risk: "At risk",
};

const STATUS_PILL: Record<LaunchItemStatus, string> = {
  pending: "bg-[#f0f0f0] text-[#6b6b6b]",
  in_progress: "bg-[#e8f4f5] text-[#155e63]",
  done: "bg-[#e6f4e6] text-[#2d6a2d]",
  at_risk: "bg-[#fde8e8] text-[#b1454a]",
};

const GANTT_ANCHORS = [
  { label: "T-90", offset: -90 },
  { label: "T-60", offset: -60 },
  { label: "T-30", offset: -30 },
  { label: "T-7", offset: -7 },
  { label: "Day 0", offset: 0 },
  { label: "Day+30", offset: 30 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function ganttPosition(targetDate: string, launchDate: string): number {
  const diff = daysBetween(launchDate, targetDate);
  const total = 120; // T-90 to Day+30 span
  const pos = ((diff + 90) / total) * 100;
  return Math.max(0, Math.min(100, pos));
}

function daysUntil(dateStr: string): number {
  return daysBetween(new Date().toISOString().slice(0, 10), dateStr);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Gantt Strip ───────────────────────────────────────────────────────────────

function GanttStrip({
  items,
  launchDate,
}: {
  items: TimelineItem[];
  launchDate: string | null;
}) {
  if (!launchDate) {
    return (
      <div className="mb-4 px-1 py-3 bg-[#faf9f7] rounded-xl border border-[#efefef] text-center">
        <p className="text-xs text-[#afafaf]">
          Set a target opening date in your profile to see the milestone timeline.
        </p>
      </div>
    );
  }

  const datedItems = items.filter((i) => i.target_date);

  return (
    <div className="mb-5">
      <div className="relative h-2 bg-[#efefef] rounded-full mb-1">
        {/* Anchor markers */}
        {GANTT_ANCHORS.map((a) => {
          const pct = ((a.offset + 90) / 120) * 100;
          return (
            <div
              key={a.label}
              className="absolute top-0 bottom-0 w-px bg-[#d0d0d0]"
              style={{ left: `${pct}%` }}
            />
          );
        })}
        {/* Milestone dots */}
        {datedItems.map((item) => {
          const pct = ganttPosition(item.target_date!, launchDate);
          return (
            <div
              key={item.id}
              title={`${item.milestone} — ${formatDate(item.target_date!)}`}
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm cursor-default transition-all ${
                item.status === "done"
                  ? "bg-[#2d6a2d]"
                  : item.status === "at_risk"
                  ? "bg-[#b1454a]"
                  : item.status === "in_progress"
                  ? "bg-[#155e63]"
                  : "bg-[#afafaf]"
              }`}
              style={{ left: `calc(${pct}% - 6px)` }}
            />
          );
        })}
      </div>
      {/* Anchor labels */}
      <div className="relative h-4">
        {GANTT_ANCHORS.map((a) => {
          const pct = ((a.offset + 90) / 120) * 100;
          return (
            <span
              key={a.label}
              className="absolute text-[9px] text-[#afafaf] -translate-x-1/2 leading-none"
              style={{ left: `${pct}%` }}
            >
              {a.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function TimelineRow({
  item,
  allItems,
  onEdit,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
}: {
  item: TimelineItem;
  allItems: TimelineItem[];
  onEdit: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  dragging: boolean;
}) {
  const dep = item.depends_on ? allItems.find((i) => i.id === item.depends_on) : null;

  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-start gap-2 rounded-lg border p-3 bg-white transition-opacity ${
        dragging ? "opacity-40 border-dashed border-[#155e63]" : "border-[#efefef]"
      }`}
    >
      {/* Drag handle */}
      <span
        className="mt-0.5 cursor-grab active:cursor-grabbing shrink-0 text-[#d0d0d0] hover:text-[#afafaf]"
        aria-label="Drag to reorder"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="3" r="1.5" />
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="4" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="4" cy="13" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#1a1a1a] truncate">{item.milestone}</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_PILL[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
          {item.target_date && (
            <span className="text-xs text-[#6b6b6b] shrink-0">{formatDate(item.target_date)}</span>
          )}
        </div>
        {dep && (
          <p className="text-[10px] text-[#afafaf] mt-0.5">
            Depends on: {dep.milestone}
          </p>
        )}
        {item.notes && (
          <p className="text-xs text-[#6b6b6b] mt-0.5 truncate">{item.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded text-[#afafaf] hover:text-[#155e63] hover:bg-[#e8f4f5] transition-colors"
          aria-label={`Edit ${item.milestone}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded text-[#afafaf] hover:text-red-500 hover:bg-red-50 transition-colors"
          aria-label={`Remove ${item.milestone}`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </li>
  );
}

// ─── Drawer ────────────────────────────────────────────────────────────────────

function RowDrawer({
  mode,
  allItems,
  onClose,
  onSubmit,
}: {
  mode: DrawerMode;
  allItems: TimelineItem[];
  onClose: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
}) {
  const editing = mode.kind === "edit" ? mode.item : null;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      milestone: editing?.milestone ?? "",
      target_date: editing?.target_date ?? "",
      status: editing?.status ?? "pending",
      notes: editing?.notes ?? "",
      depends_on: editing?.depends_on ?? "",
    },
  });

  const dependsOnId = watch("depends_on");
  const targetDate = watch("target_date");

  const eligibleDeps = allItems.filter((i) => editing ? i.id !== editing.id : true);

  const depItem = dependsOnId ? allItems.find((i) => i.id === dependsOnId) : null;

  function validate(values: FormValues): string | null {
    if (!values.target_date) return "Target date is required.";
    if (values.depends_on === (editing?.id ?? "")) return "A milestone cannot depend on itself.";
    if (values.depends_on && depItem?.target_date && values.target_date < depItem.target_date) {
      return `Target date must be ≥ dependency's date (${formatDate(depItem.target_date)}).`;
    }
    return null;
  }

  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onValid(values: FormValues) {
    const err = validate(values);
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);
    await onSubmit(values);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label={mode.kind === "add" ? "Add milestone" : "Edit milestone"}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-label="Close drawer"
      />

      {/* Drawer panel */}
      <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-xl overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#efefef]">
          <h2 className="font-semibold text-[#1a1a1a]">
            {mode.kind === "add" ? "Add milestone" : "Edit milestone"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[#afafaf] hover:text-[#1a1a1a]"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit(onValid)} className="flex-1 px-6 py-5 space-y-5">
          {/* Milestone name */}
          <div>
            <label htmlFor="rdf-milestone" className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Milestone *
            </label>
            <input
              id="rdf-milestone"
              type="text"
              placeholder="e.g. Permits submitted"
              className="block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63]"
              {...register("milestone", { required: true })}
            />
            {errors.milestone && (
              <p className="mt-1 text-xs text-[#b1454a]">Milestone is required.</p>
            )}
          </div>

          {/* Target date */}
          <div>
            <label htmlFor="rdf-target-date" className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Target date *
            </label>
            <input
              id="rdf-target-date"
              type="date"
              className="block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63]"
              {...register("target_date", { required: true })}
            />
            {errors.target_date && (
              <p className="mt-1 text-xs text-[#b1454a]">Target date is required.</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label htmlFor="rdf-status" className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Status
            </label>
            <select
              id="rdf-status"
              className="block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63] appearance-none"
              {...register("status")}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Depends on */}
          <div>
            <label htmlFor="rdf-depends-on" className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Depends on
            </label>
            <select
              id="rdf-depends-on"
              className="block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63] appearance-none"
              {...register("depends_on")}
            >
              <option value="">None</option>
              {eligibleDeps.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.milestone}{i.target_date ? ` (${formatDate(i.target_date)})` : ""}
                </option>
              ))}
            </select>
            {dependsOnId && depItem?.target_date && targetDate && targetDate < depItem.target_date && (
              <p className="mt-1 text-xs text-amber-600">
                Target date must be ≥ {formatDate(depItem.target_date)}.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="rdf-notes" className="block text-xs font-medium text-[#6b6b6b] mb-1">
              Notes
            </label>
            <textarea
              id="rdf-notes"
              rows={3}
              placeholder="Optional context or next steps"
              className="block w-full rounded-lg border border-[#efefef] bg-[#faf9f7] px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:border-[#155e63] focus:outline-none focus:ring-1 focus:ring-[#155e63] resize-none"
              {...register("notes")}
            />
          </div>

          {submitError && (
            <p className="text-xs text-[#b1454a] rounded-lg bg-red-50 px-3 py-2" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-[#155e63] text-white text-sm font-medium py-2.5 hover:bg-[#0f4a4e] disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "Saving…" : mode.kind === "add" ? "Add milestone" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 rounded-lg border border-[#efefef] text-sm text-[#6b6b6b] hover:bg-[#faf9f7] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Footer Summary ────────────────────────────────────────────────────────────

function FooterSummary({ items }: { items: TimelineItem[] }) {
  const counts = STATUS_OPTIONS.reduce<Record<LaunchItemStatus, number>>(
    (acc, s) => ({ ...acc, [s]: items.filter((i) => i.status === s).length }),
    { pending: 0, in_progress: 0, done: 0, at_risk: 0 },
  );

  const pendingWithDate = items
    .filter((i) => i.status === "pending" && i.target_date)
    .sort((a, b) => a.target_date!.localeCompare(b.target_date!));

  const earliest = pendingWithDate[0];
  const daysLeft = earliest ? daysUntil(earliest.target_date!) : null;

  return (
    <div className="mt-4 pt-4 border-t border-[#efefef] flex flex-wrap items-center gap-3 text-xs text-[#6b6b6b]">
      {STATUS_OPTIONS.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={`inline-block w-2 h-2 rounded-full ${
            s === "done" ? "bg-[#2d6a2d]" :
            s === "in_progress" ? "bg-[#155e63]" :
            s === "at_risk" ? "bg-[#b1454a]" :
            "bg-[#afafaf]"
          }`} />
          {counts[s]} {STATUS_LABELS[s].toLowerCase()}
        </span>
      ))}
      {daysLeft !== null && (
        <span className="ml-auto font-medium text-[#1a1a1a]">
          {daysLeft >= 0
            ? `${daysLeft}d until next pending milestone`
            : `${Math.abs(daysLeft)}d past next pending milestone`}
        </span>
      )}
    </div>
  );
}

// ─── Main Card ─────────────────────────────────────────────────────────────────

interface LaunchTimelineCardProps {
  launchDate?: string | null;
}

export function LaunchTimelineCard({ launchDate = null }: LaunchTimelineCardProps) {
  const {
    loading,
    items,
    error,
    paywall,
    addItem,
    updateItem,
    removeItem,
    clearError,
  } = useLaunchPlanRows<TimelineItem>("/api/launch-plan/timeline");

  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);

  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // ── Drag-and-drop reorder ─────────────────────────────────────────────────

  const handleDragStart = useCallback((id: string) => {
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    dragOverId.current = id;
  }, []);

  const handleDrop = useCallback(
    async (targetId: string) => {
      if (!draggingId || draggingId === targetId) {
        setDraggingId(null);
        return;
      }

      const sortedIds = sorted.map((i) => i.id);
      const fromIdx = sortedIds.indexOf(draggingId);
      const toIdx = sortedIds.indexOf(targetId);

      if (fromIdx === -1 || toIdx === -1) { setDraggingId(null); return; }

      const reordered = [...sortedIds];
      reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, draggingId);

      const updates = reordered.map((id, index) => ({ id, order_index: index }));

      // Optimistic update via individual updateItem calls
      await Promise.all(
        updates.map(({ id, order_index }) => updateItem(id, { order_index }))
      );

      // Batch persist
      await fetch("/api/launch-plan/timeline", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      setDraggingId(null);
    },
    [draggingId, sorted, updateItem],
  );

  // ── Drawer submit ─────────────────────────────────────────────────────────

  const handleDrawerSubmit = useCallback(
    async (values: FormValues) => {
      if (!drawer) return;

      const sharedPayload = {
        milestone: values.milestone,
        target_date: values.target_date || null,
        status: values.status,
        notes: values.notes || null,
        depends_on: values.depends_on || null,
      };

      if (drawer.kind === "add") {
        await addItem({ ...sharedPayload, order_index: items.length, digest: {} });
      } else {
        await updateItem(drawer.item.id, sharedPayload);
      }

      setDrawer(null);
    },
    [drawer, addItem, updateItem],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <section className="bg-white rounded-2xl border border-[#efefef] p-6">
        <header className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-lg text-[#1a1a1a]">Launch timeline</h2>
            <p className="text-xs text-[#6b6b6b]">
              Milestone sequence from T-90 through Day+30 opening.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawer({ kind: "add" })}
            disabled={loading}
            className="px-3 py-1.5 text-sm rounded-md bg-[#155e63] text-white hover:bg-[#0f4a4e] disabled:opacity-50 transition-colors"
          >
            + Add milestone
          </button>
        </header>

        <GanttStrip items={sorted} launchDate={launchDate} />

        {loading ? (
          <p className="text-sm text-[#6b6b6b] py-4">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-[#6b6b6b] italic py-4">
            No milestones yet — add your first to start sequencing.
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {sorted.map((item) => (
              <TimelineRow
                key={item.id}
                item={item}
                allItems={sorted}
                dragging={draggingId === item.id}
                onEdit={() => setDrawer({ kind: "edit", item })}
                onRemove={() => removeItem(item.id)}
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(e) => handleDragOver(e, item.id)}
                onDrop={() => handleDrop(item.id)}
              />
            ))}
          </ul>
        )}

        <FooterSummary items={sorted} />

        {(error || paywall) && (
          <div className="mt-3 text-xs">
            {paywall ? (
              <a href="/pricing" className="text-[#155e63] underline">Upgrade to save</a>
            ) : (
              <span className="text-[#b1454a] flex items-center gap-2" role="alert">
                {error}
                <button type="button" onClick={clearError} className="underline">Dismiss</button>
              </span>
            )}
          </div>
        )}
      </section>

      {drawer && (
        <RowDrawer
          mode={drawer}
          allItems={sorted}
          onClose={() => setDrawer(null)}
          onSubmit={handleDrawerSubmit}
        />
      )}
    </>
  );
}
