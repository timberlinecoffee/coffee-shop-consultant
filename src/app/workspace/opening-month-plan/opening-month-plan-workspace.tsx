"use client";

// TIM-1449: Unified Opening Month Plan workspace combined Milestones +
// Playbook into one page with one Generate button.
// TIM-1521: Re-split under the renamed "Launch Plan" umbrella. The component
// stays a single source of truth, but now takes a `section` prop:
//   - "milestones": render only the dated, AI-generated launch-milestones
//     section with its own Generate CTA.
//   - "playbook":   render only the seed-driven Opening-Month Playbook
//     with its own Seed CTA.
//   - "all":        render both sections with the legacy unified CTA
//     (kept as a defensive fallback; no live page uses this today).
// Each sub-page owns its own CTA so a failure on one doesn't block the
// other.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Rocket, Calendar, List, ChevronDown, ChevronRight, Check, X,
  Plus, RefreshCw, AlertTriangle, Pencil, Trash2, Info, ClipboardList,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { LaunchPlanSubNav } from "@/components/launch-plan/LaunchPlanSubNav";
import { LaunchReadinessButton } from "@/components/launch-plan/LaunchReadinessButton";
import { PaywallModal } from "@/components/paywall-modal";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { consumeSseFrames } from "@/components/copilot/sse";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import {
  TRACK_KEYS, TRACK_LABELS, TRACK_COLORS,
  daysToGo, daysToGoColor, detectLeadTimeConflicts,
  buildCalendarMonths, MONTH_NAMES,
  type Milestone, type LaunchPlanConfig, type TrackKey, type MilestoneStatus,
} from "@/lib/launch-plan";
import type { LaunchItemStatus } from "@/types/supabase";

export type WorkspaceSection = "milestones" | "playbook" | "all";

interface Props {
  planId: string;
  initialMilestones: Milestone[];
  initialConfig: LaunchPlanConfig;
  initialSourcesUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  /** TIM-1521: which half of the suite to render. Defaults to "all" for
   *  back-compat with the legacy unified page. */
  section?: WorkspaceSection;
}

// ── Playbook types / buckets ────────────────────────────────────────────────

type PlaybookItem = {
  id: string;
  plan_id: string;
  day_offset: number;
  task: string;
  owner: string | null;
  status: LaunchItemStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PlaybookBucket = {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
};

const PLAYBOOK_BUCKETS: PlaybookBucket[] = [
  {
    key: "pre_open",
    label: "Pre-Open Weeks",
    description:
      "Training schedule, supplier first-orders, neighborhood walk-around, friends-and-family soft open.",
    min: -28,
    max: -1,
  },
  {
    key: "opening_week",
    label: "Opening Week",
    description:
      "Grand-open day, hours, marketing push, staffing schedule.",
    min: 0,
    max: 7,
  },
  {
    key: "first_30_days",
    label: "First 30 Days",
    description:
      "KPIs to watch, supplier delivery cadence, daily and weekly rituals, what to tweak.",
    min: 8,
    max: 30,
  },
];

const PLAYBOOK_STATUS_OPTIONS: LaunchItemStatus[] = ["pending", "in_progress", "done", "at_risk"];
const PLAYBOOK_STATUS_LABELS: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  at_risk: "At Risk",
};
const PLAYBOOK_STATUS_STYLES: Record<LaunchItemStatus, string> = {
  pending: "bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)]",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  at_risk: "bg-red-100 text-red-700",
};

function bucketFor(day: number): PlaybookBucket {
  for (const b of PLAYBOOK_BUCKETS) {
    if (day >= b.min && day <= b.max) return b;
  }
  return PLAYBOOK_BUCKETS[0];
}

function formatOffset(n: number): string {
  if (n === 0) return "Day 0";
  return n > 0 ? `Day +${n}` : `Day ${n}`;
}

function parseOffset(s: string, fallback: number): number {
  const n = parseInt(s.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-28, Math.min(30, n));
}

// ── Milestone helpers ────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function isStale(lastGeneratedAt: string | null, sourcesUpdatedAt: string | null): boolean {
  if (!lastGeneratedAt || !sourcesUpdatedAt) return false;
  return new Date(sourcesUpdatedAt) > new Date(lastGeneratedAt);
}

// ── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${
        type === "success" ? "bg-[var(--teal)] text-white" : "bg-red-600 text-white"
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  not_started: "bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)]",
  in_progress: "bg-blue-100 text-blue-700",
  blocked: "bg-red-100 text-red-700",
  done: "bg-green-100 text-green-700",
};
const STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

// ── Milestone row ─────────────────────────────────────────────────────────────

function DaysToGoPill({ targetDate, status }: { targetDate: string | null; status: MilestoneStatus }) {
  if (!targetDate || status === "done") return null;
  const days = daysToGo(targetDate);
  const color = daysToGoColor(days, status);
  const cls =
    color === "green" ? "bg-green-100 text-green-700" :
    color === "amber" ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  const label = days === 0 ? "Today" : days > 0 ? `${days}d` : `${Math.abs(days)}d overdue`;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

interface MilestoneRowProps {
  milestone: Milestone;
  canEdit: boolean;
  onStatusChange: (id: string, status: MilestoneStatus) => void;
  onEdit: (milestone: Milestone) => void;
  onDelete: (id: string) => void;
}

function MilestoneRow({ milestone, canEdit, onStatusChange, onEdit, onDelete }: MilestoneRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const isDone = milestone.status === "done";
  const trackColor = TRACK_COLORS[milestone.track];

  return (
    <div className={`border-b border-[var(--neutral-cool-100)] last:border-0 transition-colors ${isDone ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          disabled={!canEdit}
          onClick={() => onStatusChange(milestone.id, isDone ? "not_started" : "done")}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isDone
              ? "bg-green-500 border-green-500"
              : "border-[var(--neutral-cool-350)] hover:border-green-400"
          } ${!canEdit ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          title={isDone ? "Mark not started" : "Mark done"}
        >
          {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
        </button>

        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${trackColor.dot}`} />

        <button
          className="flex-1 min-w-0 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <span className={`text-sm font-medium ${isDone ? "line-through text-[var(--dark-grey)]" : "text-[var(--foreground)]"}`}>
            {milestone.title}
          </span>
          {milestone.critical_path && (
            <span className="ml-2 text-xs text-amber-600 font-medium">Critical path</span>
          )}
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <DaysToGoPill targetDate={milestone.target_date} status={milestone.status} />
          <span className="hidden sm:inline text-xs text-[var(--dark-grey)]">{formatDate(milestone.target_date)}</span>
          <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[milestone.status]}`}>
            {STATUS_LABELS[milestone.status]}
          </span>
          {milestone.ai_notes && (
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="p-0.5 text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] transition-colors"
              title="AI rationale"
            >
              <Info size={14} />
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(milestone)}
                className="p-0.5 text-[var(--dark-grey)] hover:text-blue-500 transition-colors"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(milestone.id)}
                className="p-0.5 text-[var(--dark-grey)] hover:text-red-500 transition-colors"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && milestone.description && (
        <div className="px-11 pb-3 text-sm text-[var(--muted-foreground)]">{milestone.description}</div>
      )}

      {showNotes && milestone.ai_notes && (
        <div className="mx-4 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <strong className="font-medium">Why this date:</strong> {milestone.ai_notes}
        </div>
      )}
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  milestones: Milestone[];
  canEdit: boolean;
  onStatusChange: (id: string, status: MilestoneStatus) => void;
  onEdit: (m: Milestone) => void;
  onDelete: (id: string) => void;
  onAddMilestone: (track: TrackKey) => void;
}

function ListView({ milestones, canEdit, onStatusChange, onEdit, onDelete, onAddMilestone }: ListViewProps) {
  const [collapsed, setCollapsed] = useState<Set<TrackKey>>(new Set());

  const byTrack = new Map<TrackKey, Milestone[]>();
  for (const m of milestones) {
    const arr = byTrack.get(m.track) ?? [];
    arr.push(m);
    byTrack.set(m.track, arr);
  }

  const toggleTrack = (t: TrackKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const doneCount = milestones.filter((m) => m.status === "done").length;

  if (milestones.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--dark-grey)]">
        <Rocket size={36} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Set your target opening date above, then click Generate Opening Month Plan to build a personalized milestone path.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-xl border border-[var(--border)] px-4 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="h-2 bg-[var(--neutral-cool-100)] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${milestones.length ? (doneCount / milestones.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <span className="text-sm text-[var(--muted-foreground)] whitespace-nowrap">
          {doneCount} of {milestones.length} complete
        </span>
      </div>

      {/* Tracks */}
      {TRACK_KEYS.map((track) => {
        const items = (byTrack.get(track) ?? []).sort((a, b) => {
          if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
          return a.order_index - b.order_index;
        });
        const isCollapsed = collapsed.has(track);
        const trackColor = TRACK_COLORS[track];
        const doneInTrack = items.filter((m) => m.status === "done").length;

        return (
          <div key={track} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              className={`w-full flex items-center gap-3 px-4 py-3 ${trackColor.bg} border-b ${trackColor.border} text-left`}
              onClick={() => toggleTrack(track)}
            >
              {isCollapsed ? (
                <ChevronRight size={16} className={trackColor.text} />
              ) : (
                <ChevronDown size={16} className={trackColor.text} />
              )}
              <span className={`text-sm font-semibold ${trackColor.text}`}>
                {TRACK_LABELS[track]}
              </span>
              <span className="text-xs text-[var(--dark-grey)] ml-auto">
                {doneInTrack}/{items.length}
              </span>
            </button>

            {!isCollapsed && (
              <>
                {items.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    canEdit={canEdit}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
                {items.length === 0 && (
                  <div className="px-4 py-3 text-sm text-[var(--dark-grey)]">No milestones yet in this track.</div>
                )}
                {canEdit && (
                  <button
                    onClick={() => onAddMilestone(track)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] transition-colors w-full"
                  >
                    <Plus size={14} />
                    Add milestone
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

interface CalendarViewProps {
  milestones: Milestone[];
  targetLaunchDate: string | null;
  onMilestoneClick: (m: Milestone) => void;
  onDateDrop: (milestoneId: string, newDate: string) => void;
}

function CalendarView({ milestones, targetLaunchDate, onMilestoneClick }: CalendarViewProps) {
  const months = buildCalendarMonths(milestones, targetLaunchDate, 2, 1);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div className="space-y-8">
      {months.map((month) => (
        <div key={`${month.year}-${month.month}`} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--neutral-cool-100)]">
            <h3 className="text-lg font-bold text-[var(--foreground)] leading-tight">
              {MONTH_NAMES[month.month]} {month.year}
            </h3>
          </div>

          <div className="grid grid-cols-7 border-b border-[var(--neutral-cool-100)]">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-[var(--dark-grey)]">{d}</div>
            ))}
          </div>

          {month.weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-[var(--neutral-cool-100)] last:border-0">
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="min-h-[80px] bg-[var(--background)]" />;
                }
                return (
                  <div
                    key={day.date}
                    ref={day.isToday ? todayRef : undefined}
                    className={`min-h-[80px] p-1.5 border-l border-[var(--neutral-cool-100)] first:border-l-0 ${
                      day.isLaunchDay ? "bg-green-50 ring-2 ring-inset ring-green-400" :
                      day.isToday ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      day.isToday ? "bg-blue-500 text-white" :
                      day.isLaunchDay ? "bg-green-500 text-white" :
                      "text-[var(--dark-grey)]"
                    }`}>
                      {day.dayNum}
                    </div>
                    {day.isLaunchDay && (
                      <div className="text-xs font-semibold text-green-700 mb-1">Opening Day</div>
                    )}
                    <div className="space-y-0.5">
                      {day.milestones.map((m) => {
                        const color = TRACK_COLORS[m.track];
                        return (
                          <button
                            key={m.id}
                            onClick={() => onMilestoneClick(m)}
                            className={`w-full text-left text-xs px-1.5 py-0.5 rounded ${color.bg} ${color.text} ${color.border} border truncate hover:opacity-80 transition-opacity`}
                            title={m.title}
                          >
                            {m.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Milestone editor modal ─────────────────────────────────────────────────────

const VALID_TRACKS = TRACK_KEYS;

interface EditModalProps {
  milestone: Partial<Milestone> & { track: TrackKey };
  onSave: (data: Partial<Milestone>) => Promise<void>;
  onClose: () => void;
  isNew: boolean;
}

const inputCls = "w-full rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors";
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";

function EditModal({ milestone, onSave, onClose, isNew }: EditModalProps) {
  const [title, setTitle] = useState(milestone.title ?? "");
  const [description, setDescription] = useState(milestone.description ?? "");
  const [track, setTrack] = useState<TrackKey>(milestone.track);
  const [targetDate, setTargetDate] = useState(milestone.target_date ?? "");
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status ?? "not_started");
  const [owner, setOwner] = useState(milestone.owner ?? "founder");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: description || null, track, target_date: targetDate || null, status, owner });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="text-base font-semibold text-[var(--foreground)]">{isNew ? "Add Milestone" : "Edit Milestone"}</h3>
          <button onClick={onClose} className="p-1 text-[var(--dark-grey)] hover:text-[var(--muted-foreground)]"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Title</label>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sign Lease for Primary Location"
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does success look like? Any gotchas?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Track</label>
              <select
                className={inputCls}
                value={track}
                onChange={(e) => setTrack(e.target.value as TrackKey)}
              >
                {VALID_TRACKS.map((t) => (
                  <option key={t} value={t}>{TRACK_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={status}
                onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Target Date</label>
              <input
                type="date"
                className={inputCls}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Owner</label>
              <input
                className={inputCls}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="founder"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 pb-4">
          <button onClick={onClose} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-sm font-medium bg-[var(--teal)] text-white rounded-lg px-4 py-1.5 hover:bg-[var(--teal-dark)] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────

export function OpeningMonthPlanWorkspace({
  planId, initialMilestones, initialConfig, initialSourcesUpdatedAt, canEdit, initialTrialMessagesUsed,
  section = "all",
}: Props) {
  const showMilestones = section === "milestones" || section === "all";
  const showPlaybook = section === "playbook" || section === "all";

  // Milestones state
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [config, setConfig] = useState<LaunchPlanConfig>(initialConfig);
  const [sourcesUpdatedAt] = useState<string | null>(initialSourcesUpdatedAt);
  const [view, setView] = useState<"list" | "calendar">(initialConfig.viewPreference);
  const [generating, setGenerating] = useState(false);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const [launchDateInput, setLaunchDateInput] = useState(initialConfig.targetLaunchDate ?? "");
  const [editModal, setEditModal] = useState<{ milestone: Partial<Milestone> & { track: TrackKey }; isNew: boolean } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [stalesBannerDismissed, setStalesBannerDismissed] = useState(false);

  // Playbook state. `playbookLoading` starts false when the playbook section
  // is hidden (TIM-1521 milestones sub-page), so the empty-state copy
  // doesn't briefly flash a "Loading…" the user can never resolve.
  const [playbookItems, setPlaybookItems] = useState<PlaybookItem[]>([]);
  const [playbookLoading, setPlaybookLoading] = useState(showPlaybook);

  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TIM-1450 (carried into TIM-1449 merge): auto-promote not_started →
  // in_progress once either half of the unified suite has content.
  const { promoteOnEdit } = useWorkspaceStatus();
  useEffect(() => {
    if (milestones.length > 0 || playbookItems.length > 0) {
      promoteOnEdit("opening_month_plan");
    }
  }, [milestones.length, playbookItems.length, promoteOnEdit]);

  function showToast(type: "success" | "error", msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, msg });
    toastTimerRef.current = setTimeout(() => setToast(null), 5_000);
  }

  const showStaleBanner =
    !stalesBannerDismissed &&
    config.lastGeneratedAt != null &&
    isStale(config.lastGeneratedAt, sourcesUpdatedAt);

  // ── Load playbook items ────────────────────────────────────────────────────
  const reloadPlaybook = useCallback(async () => {
    setPlaybookLoading(true);
    try {
      const res = await fetch("/api/opening-month-plan/soft-open-plan", { cache: "no-store" });
      if (!res.ok) throw new Error("Load failed");
      const body = (await res.json()) as { items: PlaybookItem[] };
      setPlaybookItems(body.items);
    } catch {
      showToast("error", "Couldn't load the playbook. Reload to retry.");
    } finally {
      setPlaybookLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showPlaybook) return;
    reloadPlaybook();
  }, [reloadPlaybook, showPlaybook]);

  // ── Save config ───────────────────────────────────────────────────────────────
  async function saveConfig(patch: Partial<LaunchPlanConfig>) {
    const updated = { ...config, ...patch };
    setConfig(updated);
    await fetch("/api/opening-month-plan/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function handleLaunchDateChange(newDate: string) {
    setLaunchDateInput(newDate);
    if (!newDate) return;
    await saveConfig({ targetLaunchDate: newDate });
  }

  async function handleViewToggle(v: "list" | "calendar") {
    setView(v);
    await saveConfig({ viewPreference: v });
  }

  // ── Generate Launch Milestones (AI, SSE) ───────────────────────────────────
  // TIM-1521: was bundled with the playbook seed in handleGenerateAll. Now its
  // own CTA on the Launch Milestones sub-page so an AI failure can't take the
  // playbook with it.
  async function handleGenerateMilestones() {
    if (!canEdit) { setPaywallOpen(true); return; }
    if (!launchDateInput) return;
    setGenerating(true);
    setToast(null);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 90_000);

    let milestonesUpdated = 0;
    let paywallHit = false;

    try {
      const res = await fetch("/api/opening-month-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          targetLaunchDate: launchDateInput,
          existingMilestones: milestones.map((m) => ({ id: m.id, user_edited: m.user_edited })),
        }),
        signal: abortController.signal,
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const { events, rest } = consumeSseFrames(buf);
        buf = rest;

        for (const { data } of events) {
          try {
            const payload = JSON.parse(data);
            if (payload.code === "paywall") {
              paywallHit = true;
              return;
            }
            if (
              payload.code === "error" ||
              payload.code === "db_error" ||
              payload.code === "parse_error" ||
              payload.code === "timeout" ||
              payload.code === "upstream_error"
            ) {
              showToast("error", payload.message ?? "Couldn't generate milestones. Try again or contact support.");
            }
            if (payload.milestones) {
              // TIM-1561: route through review modal before applying to state.
              const proposedMilestones = payload.milestones as Milestone[];
              const lastGeneratedAt = payload.lastGeneratedAt as string | undefined;
              openAIReviewModal({
                suggestions: [
                  {
                    id: "opening-month-milestones",
                    fieldId: "milestones",
                    fieldLabel: "Launch Milestones",
                    originalValue: JSON.stringify(milestones.map((m) => ({ title: m.title, target_date: m.target_date, track: m.track }))),
                    proposedValue: JSON.stringify(proposedMilestones.map((m) => ({ title: m.title, target_date: m.target_date, track: m.track }))),
                    isStructured: true,
                  },
                ],
                context: { workspace: "Opening Month Plan", section: "Launch Milestones" },
                onApply: async () => {
                  setMilestones(proposedMilestones);
                  setConfig((c) => ({ ...c, lastGeneratedAt: lastGeneratedAt ?? c.lastGeneratedAt }));
                  setStalesBannerDismissed(false);
                },
              });
              milestonesUpdated = proposedMilestones.length;
            }
          } catch { /* non-JSON lines */ }
        }
      }

      if (paywallHit) {
        setPaywallOpen(true);
      } else if (milestonesUpdated > 0) {
        showToast("success", "Launch Milestones generated. Edit anything that doesn't fit your shop.");
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      showToast(
        "error",
        isAbort
          ? "Generation timed out. Try again or contact support."
          : "Couldn't generate milestones. Try again or contact support.",
      );
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  }

  // ── Seed Opening Month Playbook (template, no AI) ──────────────────────────
  // TIM-1521: split out of the unified Generate. Idempotent on the server;
  // re-clicking won't duplicate rows.
  async function handleSeedPlaybook() {
    if (!canEdit) { setPaywallOpen(true); return; }
    setGenerating(true);
    setToast(null);
    try {
      const res = await fetch("/api/opening-month-plan/seed", { method: "POST" });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) {
        showToast("error", "Couldn't generate the playbook. Try again or contact support.");
        return;
      }
      await reloadPlaybook();
      showToast("success", "Opening Month Plan generated. Edit anything that doesn't fit your shop.");
    } catch {
      showToast("error", "Couldn't seed the playbook. Try again or contact support.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Legacy unified handler (defensive fallback for section="all") ──────────
  async function handleGenerateAll() {
    if (!canEdit) { setPaywallOpen(true); return; }
    if (!launchDateInput) return;
    await Promise.all([handleGenerateMilestones(), handleSeedPlaybook()]);
  }

  // ── Milestone CRUD ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, status: MilestoneStatus) => {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
    await fetch(`/api/opening-month-plan/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }, []);

  const handleEdit = useCallback((m: Milestone) => {
    setEditModal({ milestone: m, isNew: false });
  }, []);

  function openNewMilestone(track: TrackKey) {
    setEditModal({
      milestone: { track, target_date: launchDateInput || null },
      isNew: true,
    });
  }

  async function handleSaveEdit(data: Partial<Milestone>) {
    if (!editModal) return;
    if (editModal.isNew) {
      const res = await fetch("/api/opening-month-plan/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, track: editModal.milestone.track }),
      });
      if (res.ok) {
        const { milestone } = await res.json();
        setMilestones((prev) => [...prev, milestone]);
      }
    } else {
      const id = editModal.milestone.id!;
      const res = await fetch(`/api/opening-month-plan/milestones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { milestone } = await res.json();
        setMilestones((prev) => prev.map((m) => m.id === id ? milestone : m));
      }
    }
    setEditModal(null);
  }

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Remove this milestone?")) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/opening-month-plan/milestones/${id}`, { method: "DELETE" });
  }, []);

  // ── Playbook CRUD ───────────────────────────────────────────────────────────
  async function addPlaybookItem(bucket: PlaybookBucket) {
    if (!canEdit) {
      setPaywallOpen(true);
      return;
    }
    const defaultDay = bucket.key === "pre_open" ? -7 : bucket.min;
    const optimistic: PlaybookItem = {
      id: `temp-${Date.now()}`,
      plan_id: planId,
      day_offset: defaultDay,
      task: "New task",
      owner: null,
      status: "pending",
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setPlaybookItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/opening-month-plan/soft-open-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          day_offset: defaultDay,
          task: optimistic.task,
          owner: null,
          status: "pending",
          notes: null,
        }),
      });
      if (res.status === 402) {
        setPlaybookItems((prev) => prev.filter((r) => r.id !== optimistic.id));
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) throw new Error("Create failed");
      const body = (await res.json()) as { item: PlaybookItem };
      setPlaybookItems((prev) => prev.map((r) => (r.id === optimistic.id ? body.item : r)));
    } catch {
      setPlaybookItems((prev) => prev.filter((r) => r.id !== optimistic.id));
      showToast("error", "Couldn't add the task. Try again.");
    }
  }

  async function updatePlaybookItem(
    id: string,
    patch: Partial<Omit<PlaybookItem, "id" | "plan_id" | "created_at" | "updated_at">>,
  ) {
    const prev = playbookItems.find((r) => r.id === id);
    setPlaybookItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const res = await fetch(`/api/opening-month-plan/soft-open-plan/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 402) {
        if (prev) setPlaybookItems((rows) => rows.map((r) => (r.id === id ? prev : r)));
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) throw new Error("Update failed");
      const body = (await res.json()) as { item: PlaybookItem };
      setPlaybookItems((rows) => rows.map((r) => (r.id === id ? body.item : r)));
    } catch {
      if (prev) setPlaybookItems((rows) => rows.map((r) => (r.id === id ? prev : r)));
      showToast("error", "Couldn't save that change.");
    }
  }

  async function removePlaybookItem(id: string) {
    const prev = playbookItems.find((r) => r.id === id);
    if (!prev) return;
    setPlaybookItems((rows) => rows.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/opening-month-plan/soft-open-plan/${id}`, { method: "DELETE" });
      if (res.status === 402) {
        setPlaybookItems((rows) => [...rows, prev]);
        setPaywallOpen(true);
      } else if (!res.ok && res.status !== 204) {
        throw new Error("Delete failed");
      }
    } catch {
      setPlaybookItems((rows) => [...rows, prev]);
      showToast("error", "Couldn't remove that task.");
    }
  }

  // ── Lead-time conflicts ───────────────────────────────────────────────────────
  const conflicts = launchDateInput
    ? detectLeadTimeConflicts(milestones, launchDateInput)
    : [];

  const playbookGrouped = PLAYBOOK_BUCKETS.map((b) => ({
    bucket: b,
    rows: playbookItems
      .filter((r) => bucketFor(r.day_offset).key === b.key)
      .sort((a, b) => a.day_offset - b.day_offset || a.created_at.localeCompare(b.created_at)),
  }));

  const hasContent =
    (showMilestones && milestones.length > 0) ||
    (showPlaybook && playbookItems.length > 0);

  // TIM-1521: section-specific header copy + CTAs.
  const headerTitle =
    section === "milestones" ? "Launch Milestones"
      : section === "playbook" ? "Opening Month Plan"
      : "Opening Month Plan";
  const headerIcon = section === "playbook" ? ClipboardList : Rocket;
  const headerSubtitle =
    section === "milestones"
      ? "The dated, gating steps that get you to opening day. Lease, permits, build-out, equipment, hiring, training, soft-open dates. Can be a year or more out."
      : section === "playbook"
      ? "The tactical week-by-week playbook for the weeks before, opening week, and your first 30 days in the shop."
      : "The dated milestones that gate opening day, plus the tactical week-by-week playbook for the weeks before, opening week, and your first 30 days in the shop.";
  const ctaLabel =
    section === "milestones"
      ? (hasContent ? "Regenerate Launch Milestones" : "Generate Launch Milestones")
      : section === "playbook"
      ? (playbookItems.length > 0 ? "Regenerate Opening Month Plan" : "Generate Opening Month Plan")
      : (hasContent ? "Regenerate Opening Month Plan" : "Generate Opening Month Plan");
  const onCtaClick =
    section === "milestones" ? handleGenerateMilestones
      : section === "playbook" ? handleSeedPlaybook
      : handleGenerateAll;
  const ctaDisabled =
    generating ||
    !canEdit ||
    (section !== "playbook" && !launchDateInput);
  const coPilotFocusLabel =
    section === "milestones" ? "Launch Milestones"
      : section === "playbook" ? "Opening Month Plan"
      : "Opening Month Plan";

  return (
    <>
    {AIReviewModalNode}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            {(() => {
              const HeaderIcon = headerIcon;
              return <HeaderIcon className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />;
            })()}
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">{headerTitle}</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            {headerSubtitle}
          </p>
        </header>

        {/* TIM-1634: standard suite sub-nav between the two pages in this
            suite, replacing the old two-card landing. Only rendered for the
            split sub-pages; the legacy unified ("all") page has no sub-nav. */}
        {section !== "all" && (
          <LaunchPlanSubNav active={section === "milestones" ? "milestones" : "playbook"} />
        )}

        <div className="space-y-4">
          {/* First-visit copy — milestones-only (the playbook seed doesn't
              depend on upstream workspace context). */}
          {showMilestones && !hasContent && !config.lastGeneratedAt && !playbookLoading && (
            <div className="rounded-xl bg-white border border-[var(--border)] px-5 py-4 text-sm text-[var(--muted-foreground)]">
              Complete your Concept, Location, and Equipment sections first. Your launch milestones will be much more accurate.
            </div>
          )}

          {/* Stale banner — milestones-only */}
          {showMilestones && showStaleBanner && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-800">
                  Your concept, location, or equipment has changed since this plan was generated. Regenerate to refresh the milestones.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onCtaClick}
                  disabled={ctaDisabled}
                  className="text-xs font-medium text-amber-700 hover:text-amber-900 underline disabled:opacity-50"
                >
                  Regenerate
                </button>
                <button onClick={() => setStalesBannerDismissed(true)} className="text-amber-500 hover:text-amber-700">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Lead-time conflict warnings — milestones-only */}
          {showMilestones && conflicts.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-red-700">Lead-time conflicts detected:</p>
              {conflicts.map((c) => (
                <p key={c.milestoneId} className="text-xs text-red-600">
                  <strong>{c.title}</strong> needs {c.requiredDays} days but only {c.availableDays} days available. Adjust the timeline or your opening date.
                </p>
              ))}
            </div>
          )}

          {/* TIM-1521: section-specific CTA block. */}
          {section === "playbook" ? (
            /* Playbook: simple Seed CTA, no date input. */
            <div className="bg-white rounded-xl border border-[var(--border)] px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                Generate a starter playbook of pre-open, opening-week, and first-30-day tasks. Edit anything that doesn&apos;t fit your shop.
              </div>
              <div className="flex flex-col gap-1.5 sm:items-end">
                <button
                  onClick={onCtaClick}
                  disabled={ctaDisabled}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-dark)] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
                  {generating ? "Generating..." : ctaLabel}
                </button>
                {!canEdit && (
                  <p className="text-xs text-[var(--dark-grey)] text-center">Upgrade to generate</p>
                )}
              </div>
            </div>
          ) : (
            /* Milestones / unified: target date + generate. */
            <div className="bg-white rounded-xl border border-[var(--border)] px-4 sm:px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[var(--muted-foreground)] mb-1">
                    Target Opening Date
                  </label>
                  <input
                    type="date"
                    value={launchDateInput}
                    onChange={(e) => handleLaunchDateChange(e.target.value)}
                    disabled={!canEdit}
                    className="rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:opacity-50 transition-colors"
                  />
                  {launchDateInput && (
                    <p className="mt-1 text-xs text-[var(--dark-grey)]">
                      {daysToGo(launchDateInput) > 0
                        ? `${daysToGo(launchDateInput)} days until opening`
                        : daysToGo(launchDateInput) === 0
                        ? "Today is opening day"
                        : `${Math.abs(daysToGo(launchDateInput))} days past opening`}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={onCtaClick}
                    disabled={ctaDisabled}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-dark)] disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
                    {generating ? "Generating..." : ctaLabel}
                  </button>
                  {!canEdit && (
                    <p className="text-xs text-[var(--dark-grey)] text-center">Upgrade to generate</p>
                  )}
                  {milestones.length > 0 && config.lastGeneratedAt && (
                    <p className="text-xs text-[var(--dark-grey)] text-center">
                      Generated {formatDate(config.lastGeneratedAt)}
                    </p>
                  )}
                </div>
              </div>
              {hasContent && !generating && config.lastGeneratedAt && section === "all" && (
                <p className="mt-2 text-xs text-[var(--dark-grey)]">
                  Regenerating refreshes milestones and tops up the playbook if it&apos;s empty. Your edits are preserved.
                </p>
              )}
            </div>
          )}

          {/* ── Section 1: Milestones ─────────────────────────────────────── */}
          {showMilestones && (
          <section aria-labelledby="milestones-heading" className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-4 h-4 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
              <h2 id="milestones-heading" className="text-xl font-bold text-[var(--foreground)] leading-tight">
                Milestones
              </h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mb-3 leading-relaxed">
              The dated, gating steps that get you to opening day. Lease, permits, build-out, equipment, hiring, training, soft-open dates.
            </p>

            {/* View toggle */}
            <div className="flex items-center gap-0 mb-4 border-b border-[var(--border)]">
              <button
                onClick={() => handleViewToggle("list")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  view === "list"
                    ? "border-[var(--teal)] text-[var(--teal)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => handleViewToggle("calendar")}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  view === "calendar"
                    ? "border-[var(--teal)] text-[var(--teal)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <Calendar size={14} />
                Calendar
              </button>
            </div>

            {view === "list" ? (
              <ListView
                milestones={milestones}
                canEdit={canEdit}
                onStatusChange={handleStatusChange}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddMilestone={openNewMilestone}
              />
            ) : (
              <CalendarView
                milestones={milestones}
                targetLaunchDate={launchDateInput || null}
                onMilestoneClick={handleEdit}
                onDateDrop={() => {}}
              />
            )}
          </section>
          )}

          {/* TIM-1880: re-wire the cross-workspace launch readiness check
              (TIM-736). It was orphaned when the suite was restructured
              (TIM-1521/TIM-1634 turned the umbrella into a redirect). It lives
              at the foot of the Milestones tab — the default Launch Plan tab —
              and populates the dashboard readiness banner via
              POST /api/copilot/launch-readiness. */}
          {showMilestones && (
            <div className="pt-8">
              <LaunchReadinessButton planId={planId} />
            </div>
          )}

          {/* ── Section 2: Playbook ──────────────────────────────────────── */}
          {showPlaybook && (
          <section aria-labelledby="playbook-heading" className={section === "playbook" ? "pt-4" : "pt-8"}>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
              <h2 id="playbook-heading" className="text-xl font-bold text-[var(--foreground)] leading-tight">
                Playbook
              </h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mb-3 leading-relaxed">
              Week-by-week and day-by-day tasks for the weeks before opening, opening week, and the first 30 days.
            </p>

            <div className="space-y-4">
              {playbookItems.length === 0 && !playbookLoading && (
                <div className="rounded-xl bg-white border border-[var(--border)] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm text-[var(--foreground)] font-semibold">Start with a tactical playbook</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {section === "playbook"
                        ? "Use the Generate Opening Month Plan button above to drop in starter pre-open, opening-week, and first-30-day tasks. Edit anything that doesn't fit your shop."
                        : "Use Generate Opening Month Plan above to drop in starter pre-open, opening-week, and first-30-day tasks. Edit anything that doesn't fit your shop."}
                    </p>
                  </div>
                </div>
              )}

              {playbookGrouped.map(({ bucket, rows }) => (
                <div key={bucket.key} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
                  <header className="px-4 py-3 border-b border-[var(--neutral-cool-100)]">
                    <h3 className="text-lg font-bold text-[var(--foreground)] leading-tight">{bucket.label}</h3>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{bucket.description}</p>
                  </header>

                  {rows.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-[var(--dark-grey)]">No tasks yet in this stretch.</div>
                  ) : (
                    <ul className="divide-y divide-[var(--neutral-cool-100)]">
                      {rows.map((row) => (
                        <li key={row.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                          <label className="md:col-span-1 text-xs text-[var(--muted-foreground)]">
                            <span className="block mb-1">Day</span>
                            <input
                              type="number"
                              min={bucket.min}
                              max={bucket.max}
                              defaultValue={row.day_offset}
                              disabled={!canEdit}
                              onBlur={(e) => {
                                const next = parseOffset(e.target.value, row.day_offset);
                                if (next !== row.day_offset) updatePlaybookItem(row.id, { day_offset: next });
                              }}
                              className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] text-center disabled:opacity-60"
                            />
                          </label>
                          <label className="md:col-span-4 text-xs text-[var(--muted-foreground)]">
                            <span className="block mb-1">Task</span>
                            <input
                              type="text"
                              defaultValue={row.task}
                              disabled={!canEdit}
                              onBlur={(e) => e.target.value !== row.task && updatePlaybookItem(row.id, { task: e.target.value })}
                              className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                            />
                          </label>
                          <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                            <span className="block mb-1">Owner</span>
                            <input
                              type="text"
                              defaultValue={row.owner ?? ""}
                              disabled={!canEdit}
                              onBlur={(e) => updatePlaybookItem(row.id, { owner: e.target.value || null })}
                              placeholder="Founder"
                              className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                            />
                          </label>
                          <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                            <span className="block mb-1">Status</span>
                            <select
                              value={row.status}
                              disabled={!canEdit}
                              onChange={(e) => updatePlaybookItem(row.id, { status: e.target.value as LaunchItemStatus })}
                              className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                            >
                              {PLAYBOOK_STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {PLAYBOOK_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                            <span className="block mb-1">Notes</span>
                            <input
                              type="text"
                              defaultValue={row.notes ?? ""}
                              disabled={!canEdit}
                              onBlur={(e) => updatePlaybookItem(row.id, { notes: e.target.value || null })}
                              className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                            />
                          </label>
                          <div className="md:col-span-1 flex items-center justify-end gap-2 pt-5">
                            <span className={`hidden md:inline px-1.5 py-0.5 rounded text-xs font-medium ${PLAYBOOK_STATUS_STYLES[row.status]}`}>
                              {formatOffset(row.day_offset)}
                            </span>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removePlaybookItem(row.id)}
                                className="text-xs text-[var(--dark-grey)] hover:text-red-500 transition-colors"
                                title="Remove"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {canEdit && (
                    <button
                      onClick={() => addPlaybookItem(bucket)}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] transition-colors w-full border-t border-[var(--neutral-cool-100)]"
                    >
                      <Plus size={14} />
                      Add task to {bucket.label}
                    </button>
                  )}
                </div>
              ))}

              {playbookLoading && <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>}
            </div>
          </section>
          )}
        </div>
      </div>

      {/* CoPilot */}
      <CoPilotDrawer
        workspaceKey="opening_month_plan"
        planId={planId}
        currentFocus={{ anchor: "opening_month_plan", label: coPilotFocusLabel }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />

      {/* Edit modal */}
      {editModal && (
        <EditModal
          milestone={editModal.milestone}
          isNew={editModal.isNew}
          onSave={handleSaveEdit}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Paywall */}
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {/* Toast */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.msg}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
    </>
  );
}
