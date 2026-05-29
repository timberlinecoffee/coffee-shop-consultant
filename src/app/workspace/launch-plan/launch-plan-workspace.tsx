"use client";

// TIM-1040: Launch Plan workspace — backward scheduling, AI generation,
// list + calendar views, regenerate-when-stale banner.
// TIM-1057: UX cohesion fix (platform hex tokens, rounded-2xl cards, in-page header)
//           + generate fix (AbortController timeout, consumeSseFrames, Toast on error).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Rocket, Calendar, List, ChevronDown, ChevronRight, Check, X,
  Plus, RefreshCw, AlertTriangle, Pencil, Trash2, Info,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { consumeSseFrames } from "@/components/copilot/sse";
import {
  TRACK_KEYS, TRACK_LABELS, TRACK_COLORS,
  daysToGo, daysToGoColor, detectLeadTimeConflicts,
  buildCalendarMonths, MONTH_NAMES,
  normalizeLaunchPlanConfig,
  type Milestone, type LaunchPlanConfig, type TrackKey, type MilestoneStatus,
} from "@/lib/launch-plan";

interface Props {
  planId: string;
  initialMilestones: Milestone[];
  initialConfig: LaunchPlanConfig;
  initialSourcesUpdatedAt: string | null;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

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
      <div className="text-center py-16 text-[var(--dark-grey)]">
        <Rocket size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Set your target launch date and we&apos;ll build a personalized milestone path.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-2xl border border-[var(--border)] px-4 py-3 flex items-center gap-4">
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
          <div key={track} className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
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
        <div key={`${month.year}-${month.month}`} className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--neutral-cool-100)]">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
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
                      <div className="text-xs font-semibold text-green-700 mb-1">Launch Day</div>
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

const inputCls = "w-full rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus:outline-none focus:border-[var(--teal)] transition-colors";
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

export function LaunchPlanWorkspace({
  planId, initialMilestones, initialConfig, initialSourcesUpdatedAt, canEdit, initialTrialMessagesUsed,
}: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  const [config, setConfig] = useState<LaunchPlanConfig>(initialConfig);
  const [sourcesUpdatedAt] = useState<string | null>(initialSourcesUpdatedAt);
  const [view, setView] = useState<"list" | "calendar">(initialConfig.viewPreference);
  const [generating, setGenerating] = useState(false);
  const [launchDateInput, setLaunchDateInput] = useState(initialConfig.targetLaunchDate ?? "");
  const [editModal, setEditModal] = useState<{ milestone: Partial<Milestone> & { track: TrackKey }; isNew: boolean } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [stalesBannerDismissed, setStalesBannerDismissed] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, msg });
    toastTimerRef.current = setTimeout(() => setToast(null), 5_000);
  }

  const showStaleBanner =
    !stalesBannerDismissed &&
    config.lastGeneratedAt != null &&
    isStale(config.lastGeneratedAt, sourcesUpdatedAt);

  // ── Save config ───────────────────────────────────────────────────────────────
  async function saveConfig(patch: Partial<LaunchPlanConfig>) {
    const updated = { ...config, ...patch };
    setConfig(updated);
    await fetch("/api/launch-plan/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // ── Launch date change ───────────────────────────────────────────────────────
  async function handleLaunchDateChange(newDate: string) {
    setLaunchDateInput(newDate);
    if (!newDate) return;
    await saveConfig({ targetLaunchDate: newDate });
  }

  // ── View toggle ───────────────────────────────────────────────────────────────
  async function handleViewToggle(v: "list" | "calendar") {
    setView(v);
    await saveConfig({ viewPreference: v });
  }

  // ── Generate milestones ───────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!canEdit) { setPaywallOpen(true); return; }
    if (!launchDateInput) return;
    setGenerating(true);
    setToast(null);

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 90_000);

    try {
      const res = await fetch("/api/launch-plan/generate", {
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
              setPaywallOpen(true);
              return;
            }
            if (
              payload.code === "error" ||
              payload.code === "db_error" ||
              payload.code === "parse_error" ||
              payload.code === "timeout" ||
              payload.code === "upstream_error"
            ) {
              showToast("error", payload.message ?? "Couldn't generate plan — try again or contact support.");
            }
            if (payload.milestones) {
              setMilestones(payload.milestones as Milestone[]);
              setConfig((c) => ({ ...c, lastGeneratedAt: payload.lastGeneratedAt ?? c.lastGeneratedAt }));
              setStalesBannerDismissed(false);
            }
          } catch { /* non-JSON lines */ }
        }
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      showToast(
        "error",
        isAbort
          ? "Generation timed out — try again or contact support."
          : "Couldn't generate plan — try again or contact support."
      );
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
    }
  }

  // ── Status change ──────────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, status: MilestoneStatus) => {
    setMilestones((prev) => prev.map((m) => m.id === id ? { ...m, status } : m));
    await fetch(`/api/launch-plan/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }, []);

  // ── Edit ───────────────────────────────────────────────────────────────────────
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
      const res = await fetch("/api/launch-plan/milestones", {
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
      const res = await fetch(`/api/launch-plan/milestones/${id}`, {
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

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Remove this milestone?")) return;
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/launch-plan/milestones/${id}`, { method: "DELETE" });
  }, []);

  // ── Lead-time conflicts ───────────────────────────────────────────────────────
  const conflicts = launchDateInput
    ? detectLeadTimeConflicts(milestones, launchDateInput)
    : [];

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">

        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[var(--foreground)]" style={{ fontSize: "28px" }}>Launch Plan</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Backward-planned milestones from your target opening day.
          </p>
        </header>

        {/* View toggle */}
        <div className="flex items-center gap-0 mb-6 border-b border-[var(--border)]">
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

        <div className="space-y-4">
          {/* First-visit copy */}
          {milestones.length === 0 && !config.lastGeneratedAt && (
            <div className="rounded-2xl bg-white border border-[var(--border)] px-5 py-4 text-sm text-[var(--muted-foreground)]">
              Complete your Concept, Location, and Equipment sections first. Your launch plan will be much more accurate.
            </div>
          )}

          {/* Stale banner */}
          {showStaleBanner && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-800">
                  Your concept, location, or equipment has changed since this plan was generated. Regenerate to update milestones.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleGenerate}
                  disabled={generating || !launchDateInput}
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

          {/* Lead-time conflict warnings */}
          {conflicts.length > 0 && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-red-700">Lead-time conflicts detected:</p>
              {conflicts.map((c) => (
                <p key={c.milestoneId} className="text-xs text-red-600">
                  <strong>{c.title}</strong> needs {c.requiredDays} days but only {c.availableDays} days available. Adjust the timeline or your launch date.
                </p>
              ))}
            </div>
          )}

          {/* Target date + generate */}
          <div className="bg-white rounded-2xl border border-[var(--border)] px-4 sm:px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-[var(--muted-foreground)] mb-1">
                  Target Launch Date
                </label>
                <input
                  type="date"
                  value={launchDateInput}
                  onChange={(e) => handleLaunchDateChange(e.target.value)}
                  disabled={!canEdit}
                  className="rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--teal)] disabled:opacity-50 transition-colors"
                />
                {launchDateInput && (
                  <p className="mt-1 text-xs text-[var(--dark-grey)]">
                    {daysToGo(launchDateInput) > 0
                      ? `${daysToGo(launchDateInput)} days until launch`
                      : daysToGo(launchDateInput) === 0
                      ? "Today is launch day"
                      : `${Math.abs(daysToGo(launchDateInput))} days past launch`}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleGenerate}
                  disabled={generating || !launchDateInput || !canEdit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-dark)] disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
                  {generating
                    ? "Generating..."
                    : milestones.length > 0
                    ? "Regenerate Plan"
                    : "Generate Plan"}
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
            {milestones.length > 0 && !generating && config.lastGeneratedAt && (
              <p className="mt-2 text-xs text-[var(--dark-grey)]">
                After completing other sections, regenerate for a more accurate plan.
              </p>
            )}
          </div>

          {/* Main view */}
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
        </div>
      </div>

      {/* CoPilot */}
      <CoPilotDrawer
        workspaceKey="launch_plan"
        planId={planId}
        currentFocus={{ anchor: "launch_plan", label: "Launch Plan" }}
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
  );
}
