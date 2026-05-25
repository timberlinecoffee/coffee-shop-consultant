"use client";

// TIM-1040: Launch Plan workspace — backward scheduling, AI generation,
// list + calendar views, regenerate-when-stale banner.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Rocket, Calendar, List, ChevronDown, ChevronRight, Check, X,
  Plus, RefreshCw, AlertTriangle, Pencil, Trash2, Info,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
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

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<MilestoneStatus, string> = {
  not_started: "bg-slate-100 text-slate-600",
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
    <div className={`border-b border-slate-100 last:border-0 transition-colors ${isDone ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Checkbox */}
        <button
          disabled={!canEdit}
          onClick={() => onStatusChange(milestone.id, isDone ? "not_started" : "done")}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            isDone
              ? "bg-green-500 border-green-500"
              : "border-slate-300 hover:border-green-400"
          } ${!canEdit ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
          title={isDone ? "Mark not started" : "Mark done"}
        >
          {isDone && <Check size={12} className="text-white" strokeWidth={3} />}
        </button>

        {/* Track dot */}
        <span className={`flex-shrink-0 w-2 h-2 rounded-full ${trackColor.dot}`} />

        {/* Title + description toggle */}
        <button
          className="flex-1 min-w-0 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <span className={`text-sm font-medium ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>
            {milestone.title}
          </span>
          {milestone.critical_path && (
            <span className="ml-2 text-xs text-amber-600 font-medium">Critical path</span>
          )}
        </button>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <DaysToGoPill targetDate={milestone.target_date} status={milestone.status} />
          <span className="hidden sm:inline text-xs text-slate-500">{formatDate(milestone.target_date)}</span>
          <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[milestone.status]}`}>
            {STATUS_LABELS[milestone.status]}
          </span>
          {milestone.ai_notes && (
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
              title="AI rationale"
            >
              <Info size={14} />
            </button>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => onEdit(milestone)}
                className="p-0.5 text-slate-400 hover:text-blue-500 transition-colors"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(milestone.id)}
                className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded description */}
      {expanded && milestone.description && (
        <div className="px-11 pb-3 text-sm text-slate-500">{milestone.description}</div>
      )}

      {/* AI notes tooltip */}
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
      <div className="text-center py-16 text-slate-400">
        <Rocket size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">Set your target launch date and we&apos;ll build a personalized milestone path.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-4">
        <div className="flex-1">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${milestones.length ? (doneCount / milestones.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <span className="text-sm text-slate-500 whitespace-nowrap">
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
          <div key={track} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
              <span className="text-xs text-slate-400 ml-auto">
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
                  <div className="px-4 py-3 text-sm text-slate-400">No milestones yet in this track.</div>
                )}
                {canEdit && (
                  <button
                    onClick={() => onAddMilestone(track)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-600 transition-colors w-full"
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
        <div key={`${month.year}-${month.month}`} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Month header */}
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              {MONTH_NAMES[month.month]} {month.year}
            </h3>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-slate-400">{d}</div>
            ))}
          </div>

          {/* Weeks */}
          {month.weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-slate-50 last:border-0">
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="min-h-[80px] bg-slate-50/50" />;
                }
                return (
                  <div
                    key={day.date}
                    ref={day.isToday ? todayRef : undefined}
                    className={`min-h-[80px] p-1.5 border-l border-slate-50 first:border-l-0 ${
                      day.isLaunchDay ? "bg-green-50 ring-2 ring-inset ring-green-400" :
                      day.isToday ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className={`text-xs font-medium mb-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      day.isToday ? "bg-blue-500 text-white" :
                      day.isLaunchDay ? "bg-green-500 text-white" :
                      "text-slate-400"
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">{isNew ? "Add Milestone" : "Edit Milestone"}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sign Lease for Primary Location"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does success look like? Any gotchas?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Track</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={track}
                onChange={(e) => setTrack(e.target.value as TrackKey)}
              >
                {VALID_TRACKS.map((t) => (
                  <option key={t} value={t}>{TRACK_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Target Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="founder"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 pb-4">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-sm font-medium bg-teal-600 text-white rounded-lg px-4 py-1.5 hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
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
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [launchDateInput, setLaunchDateInput] = useState(initialConfig.targetLaunchDate ?? "");
  const [editModal, setEditModal] = useState<{ milestone: Partial<Milestone> & { track: TrackKey }; isNew: boolean } | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [stalesBannerDismissed, setStalesBannerDismissed] = useState(false);

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
    setGenerateError(null);

    try {
      const res = await fetch("/api/launch-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          targetLaunchDate: launchDateInput,
          existingMilestones: milestones.map((m) => ({ id: m.id, user_edited: m.user_edited })),
        }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.code === "paywall") { setPaywallOpen(true); setGenerating(false); return; }
              if (payload.code === "error" || payload.code === "db_error" || payload.code === "parse_error") {
                setGenerateError(payload.message ?? "Generation failed. Try again.");
              }
              if (payload.milestones) {
                setMilestones(payload.milestones as Milestone[]);
                setConfig((c) => ({ ...c, lastGeneratedAt: payload.lastGeneratedAt ?? c.lastGeneratedAt }));
                setStalesBannerDismissed(false);
              }
            } catch { /* non-JSON lines */ }
          }
        }
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed. Try again.");
    } finally {
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
    <div className="min-h-screen bg-[#f7f8f6]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Rocket size={16} className="text-teal-700" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-800">Launch Plan</h1>
              <p className="text-xs text-slate-400">Backward-planned milestones from your target opening day</p>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                onClick={() => handleViewToggle("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === "list" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <List size={14} />
                List
              </button>
              <button
                onClick={() => handleViewToggle("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === "calendar" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Calendar size={14} />
                Calendar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* First-visit copy (no milestones, no launch date) */}
        {milestones.length === 0 && !config.lastGeneratedAt && (
          <div className="rounded-xl bg-white border border-slate-200 px-5 py-4 text-sm text-slate-500">
            Complete your Concept, Location, and Equipment sections first — your launch plan will be much more accurate.
          </div>
        )}

        {/* Stale banner */}
        {showStaleBanner && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
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
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-red-700">Lead-time conflicts detected:</p>
            {conflicts.map((c) => (
              <p key={c.milestoneId} className="text-xs text-red-600">
                <strong>{c.title}</strong> needs {c.requiredDays} days but only {c.availableDays} days available — adjust the timeline or your launch date.
              </p>
            ))}
          </div>
        )}

        {/* Target date + generate */}
        <div className="bg-white rounded-xl border border-slate-200 px-4 sm:px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Target Launch Date
              </label>
              <input
                type="date"
                value={launchDateInput}
                onChange={(e) => handleLaunchDateChange(e.target.value)}
                disabled={!canEdit}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-50"
              />
              {launchDateInput && (
                <p className="mt-1 text-xs text-slate-400">
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
                {generating
                  ? "Generating…"
                  : milestones.length > 0
                  ? "Regenerate Plan"
                  : "Generate Plan"}
              </button>
              {!canEdit && (
                <p className="text-xs text-slate-400 text-center">Upgrade to generate</p>
              )}
              {milestones.length > 0 && config.lastGeneratedAt && (
                <p className="text-xs text-slate-400 text-center">
                  Generated {formatDate(config.lastGeneratedAt)}
                </p>
              )}
            </div>
          </div>
          {generateError && (
            <p className="mt-2 text-xs text-red-600">{generateError}</p>
          )}
          {milestones.length > 0 && !generating && config.lastGeneratedAt && (
            <p className="mt-2 text-xs text-slate-400">
              After completing other sections, regenerate for a more tailored plan.
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
    </div>
  );
}
