"use client";

// TIM-3953: Hiring & Onboarding v3 — port to Suppliers workspace layout.
// Shell tightening: 220px sidebar, WorkspaceHeader, Suppliers active state,
// stateful AccordionV3 (replaces <details>/<summary>), MoreVertical delete menu,
// General entry at sidebar index 0. v1 (hiring-workspace.tsx) preserved as
// revert path. No schema migration.

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  Trash2,
  GripVertical,
  Globe,
  ClipboardCheck,
  Users,
  Award,
  FileText,
  BookOpen,
  AlertTriangle,
  Sparkles,
  Pencil,
  Check,
  Copy,
  X,
  Download,
  MoreVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type OrgRole,
  type InterviewCandidate,
  type InterviewQuestion,
  type InterviewScore,
  type InterviewScorecard,
  type CompetencyFormTemplate,
  type OnboardingPlanInstance,
  type OnboardingTask,
  type StaffCompetency,
  type StaffFile,
  type CompetencyEvaluation,
  type OnboardingPhase,
  type PlanHiringSettings,
  type HiringRequirementSet,
  type HiringCountry,
  DEFAULT_ONBOARDING_TASKS,
  PHASE_LABELS,
  PHASE_ORDER,
  HIRING_COUNTRY_OPTIONS,
} from "@/lib/hiring";
import {
  type MinWageInfo,
  formatHourlyWage,
  isBelowMinimumWage,
} from "@/lib/wages/minimum-wage";
import {
  type PersonnelLine,
  type PersonnelPayBasis,
  personnelLoadedMonthlyCents,
} from "@/lib/financial-projection";
import { progressPct } from "@/lib/formatters";
import { usePaywallGuard } from "@/lib/use-paywall-guard";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import { PaywallModal } from "@/components/paywall-modal";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { SectionHeader } from "@/components/section-header";
import { SectionHelp } from "@/components/ui/section-help";
import { AIAssistCallout } from "@/components/ai-assist/AIAssistCallout";
import { useAIReviewModal } from "@/hooks/useAIReviewModal";
import { ScorecardGridPanel } from "@/components/hiring/ScorecardGridPanel";

interface Props {
  planId: string;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
  initialRoles: OrgRole[];
  initialCandidates: InterviewCandidate[];
  initialQuestions: InterviewQuestion[];
  initialScores: InterviewScore[];
  initialOnboardingInstances: OnboardingPlanInstance[];
  initialOnboardingTasks: OnboardingTask[];
  initialCompetencies: StaffCompetency[];
  initialStaffFiles: StaffFile[];
  initialCompetencyEvals: CompetencyEvaluation[];
  initialHiringSettings: PlanHiringSettings;
  initialRequirementSets: HiringRequirementSet[];
  minimumWage?: MinWageInfo | null;
}

const INDENT_PX = 16;
const INDENT_STEP = 18;
const MAX_DEPTH = 4;

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
const sectionLabelCls =
  "text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3 leading-tight";

type JdFields = {
  title: string;
  summary: string;
  responsibilities: string;
  requirements: string;
  comp: string;
};

const JD_FIELD_DEFS: Array<{ key: keyof JdFields; label: string; multiline: boolean }> = [
  { key: "title", label: "Title", multiline: false },
  { key: "summary", label: "Summary", multiline: true },
  { key: "responsibilities", label: "Responsibilities", multiline: true },
  { key: "requirements", label: "Requirements", multiline: true },
  { key: "comp", label: "Compensation & Benefits", multiline: true },
];

const PAY_BASIS_LABEL: Record<PersonnelPayBasis, string> = {
  annual: "Annual Salary",
  monthly: "Monthly Salary",
  hourly: "Hourly",
};

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

function computeDueDateLabel(startDate: string | null, dueOffsetDays: number | null): string | null {
  if (!startDate || dueOffsetDays === null) return null;
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + dueOffsetDays);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type FlatNode = { role: OrgRole; depth: number };

function buildChildMap(roles: OrgRole[]): Map<string | null, OrgRole[]> {
  const map = new Map<string | null, OrgRole[]>();
  for (const r of roles) {
    const key = r.parent_role_id ?? null;
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }
  return map;
}

function flattenTree(
  roles: OrgRole[],
  childMap: Map<string | null, OrgRole[]>,
): FlatNode[] {
  const out: FlatNode[] = [];
  const visit = (parent: string | null, depth: number) => {
    const children = childMap.get(parent) ?? [];
    for (const r of children) {
      out.push({ role: r, depth });
      visit(r.id, depth + 1);
    }
  };
  visit(null, 0);
  const seen = new Set(out.map((n) => n.role.id));
  for (const r of roles) {
    if (!seen.has(r.id)) out.push({ role: r, depth: 0 });
  }
  return out;
}

// ── PDF download button ───────────────────────────────────────────────────────

function HiringPdfButton({
  templateId,
  queryParams,
  label,
  iconTitle,
}: {
  templateId: string;
  queryParams: Record<string, string>;
  label: string;
  iconTitle?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [paywalled, setPaywalled] = useState(false);
  const { guardedFetch, paywallReason, dismissPaywall } = usePaywallGuard();

  const handleClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams(queryParams).toString();
      const url = `/api/pdf/${templateId}${qs ? `?${qs}` : ""}`;
      const res = await guardedFetch(url);
      if (!res) { setPaywalled(true); return; }
      if (!res.ok) return;
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const filename = m?.[1] ?? `${templateId}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.pdf`;
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
    } finally {
      setExporting(false);
    }
  }, [exporting, guardedFetch, templateId, queryParams]);

  return (
    <>
      <WorkspaceActionButton
        variant="secondary"
        onClick={handleClick}
        disabled={exporting}
        title={iconTitle ?? label}
      >
        <Download size={WORKSPACE_ACTION_ICON_SIZE} />
        {label}
      </WorkspaceActionButton>
      {paywalled && (
        <PaywallModal
          open={paywalled}
          reason={paywallReason}
          onClose={() => { setPaywalled(false); dismissPaywall(); }}
        />
      )}
    </>
  );
}

function ScorecardWorksheetButton({ scorecardId }: { scorecardId: string }) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState("");
  const [exporting, setExporting] = useState(false);
  const [paywalled, setPaywalled] = useState(false);
  const { guardedFetch, paywallReason, dismissPaywall } = usePaywallGuard();

  const download = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({ scorecard_id: scorecardId });
      if (names.trim()) params.set("candidates", names.trim());
      const res = await guardedFetch(`/api/pdf/hiring_scorecard_worksheet?${params}`);
      if (!res) { setPaywalled(true); return; }
      if (!res.ok) return;
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disp);
      const filename = m?.[1] ?? `scorecard-worksheet.pdf`;
      const urlObj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = urlObj;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(urlObj);
      setOpen(false);
    } finally {
      setExporting(false);
    }
  }, [exporting, guardedFetch, scorecardId, names]);

  if (!open) {
    return (
      <button
        type="button"
        title="Print interview worksheet (with candidate columns)"
        onClick={() => setOpen(true)}
        className="text-[var(--dark-grey)] hover:text-[var(--teal)] p-1"
      >
        <FileText size={12} />
      </button>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="text-xs border border-[var(--border-medium)] rounded px-2 py-0.5 w-36 focus-visible:outline-none focus:border-[var(--teal)]"
          placeholder="Alice, Bob, Carol"
          value={names}
          onChange={(e) => setNames(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") download();
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <WorkspaceActionButton
          variant="secondary"
          onClick={download}
          disabled={exporting}
          title="Download worksheet"
        >
          <Download size={WORKSPACE_ACTION_ICON_SIZE} />
        </WorkspaceActionButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[var(--dark-grey)] hover:text-[var(--foreground)] p-0.5"
        >
          <X size={11} />
        </button>
      </div>
      {paywalled && (
        <PaywallModal
          open={paywalled}
          reason={paywallReason}
          onClose={() => { setPaywalled(false); dismissPaywall(); }}
        />
      )}
    </>
  );
}

// ── Hiring Laws panel ─────────────────────────────────────────────────────────

function HiringLawsPanel({
  initialSettings,
  initialRequirementSets,
}: {
  initialSettings: PlanHiringSettings;
  initialRequirementSets: HiringRequirementSet[];
}) {
  const [settings, setSettings] = useState<PlanHiringSettings>(initialSettings);
  const [requirementSets, setRequirementSets] = useState<HiringRequirementSet[]>(initialRequirementSets);
  const [saving, setSaving] = useState(false);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const effectiveCountry = settings.effective_country;
  const countryLabel = HIRING_COUNTRY_OPTIONS.find((o) => o.code === effectiveCountry)?.label ?? effectiveCountry;

  const grouped = useMemo(() => {
    const map: Record<string, HiringRequirementSet[]> = {};
    for (const r of requirementSets) {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push(r);
    }
    return map;
  }, [requirementSets]);

  async function changeCountry(code: HiringCountry | "") {
    const newCode = code === "" ? null : code;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/hiring/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiring_country: newCode }),
      });
      if (!res.ok) return;
      const updated: PlanHiringSettings = await res.json();
      setSettings(updated);
      setExpandedCategories({});
      const effective = updated.effective_country;
      if (effective) {
        setLoadingReqs(true);
        try {
          const rRes = await fetch(`/api/workspaces/hiring/requirement-sets?country=${encodeURIComponent(effective)}`);
          if (rRes.ok) setRequirementSets(await rRes.json());
        } finally {
          setLoadingReqs(false);
        }
      } else {
        setRequirementSets([]);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Hiring Laws"
        helpContent="Jurisdiction-specific hiring requirements. Select your country to load the relevant rules. General guidance only — verify current obligations with a licensed professional."
        className="mb-4"
      />

      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">Hiring Jurisdiction</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {settings.hiring_country ? "Override set." : "Auto-detected from your signed or primary location candidate."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-[var(--muted-foreground)]" />
              <select
                value={settings.hiring_country ?? ""}
                onChange={(e) => changeCountry(e.target.value as HiringCountry | "")}
                disabled={saving}
                className="text-sm border border-[var(--border-medium)] rounded-lg px-3 py-1.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] bg-white disabled:opacity-60"
              >
                <option value="">Auto-detect</option>
                {HIRING_COUNTRY_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {effectiveCountry ? (
          <div className="px-5 py-3 bg-[var(--teal-tint-500)]">
            <p className="text-xs text-[var(--teal)] font-medium">
              Showing requirements for: {countryLabel} ({effectiveCountry})
            </p>
          </div>
        ) : (
          <div className="px-5 py-3 bg-[var(--warning-bg-6)] border-t border-[var(--border)]">
            <p className="text-xs text-[var(--warning-dark)] font-medium flex items-center gap-1.5">
              <AlertTriangle size={12} />
              No country detected. Add a location candidate or select a jurisdiction above to see requirements.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-800 mb-1">General Guidance Only</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Not legal advice. Requirements and rates change frequently. Verify current obligations with a licensed professional in your jurisdiction before acting.
        </p>
      </div>

      {loadingReqs ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[var(--dark-grey)]">Loading requirements...</p>
        </div>
      ) : requirementSets.length === 0 && effectiveCountry ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[var(--dark-grey)]">No requirements found for {countryLabel}.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const expanded = expandedCategories[category] !== false;
          return (
            <div key={category} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full px-5 py-4 border-b border-[var(--border)] flex items-center justify-between hover:bg-[var(--background)] transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{category}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {items.length} requirement{items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {expanded && (
                <ul className="divide-y divide-[var(--border)]">
                  {items.map((req) => (
                    <li key={req.id} className="px-5 py-4">
                      <p className="text-sm font-medium text-[var(--foreground)]">{req.title}</p>
                      {req.body && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{req.body}</p>
                      )}
                      {req.citation_url && (
                        <a
                          href={req.citation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--teal)] hover:underline mt-1 inline-block"
                        >
                          Source
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── AccordionV3 — stateful (replaces <details>/<summary> from v2) ─────────────
// Uses useState so sibling AI action buttons can be placed without
// button-in-button HTML violations.

function AccordionV3({
  id,
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div
      id={`section-${id}`}
      className={`rounded-xl border border-[var(--border)] bg-white overflow-hidden${open ? " shadow-sm" : ""}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between cursor-pointer px-4 py-3 select-none hover:bg-[var(--background)] transition-colors"
      >
        <div className="text-left min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{subtitle}</div>
        </div>
        <span
          className={`shrink-0 text-[var(--dark-grey)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </button>
      {open && <div className="border-t border-[var(--border)]">{children}</div>}
    </div>
  );
}

// ── Delete-role confirmation dialog ──────────────────────────────────────────

function DeleteRoleDialog({
  roleTitle,
  onConfirm,
  onCancel,
}: {
  roleTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete role"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Delete role?</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Delete <strong className="text-[var(--foreground)]">{roleTitle || "this role"}</strong> and
          all associated content? This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-4 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-sm font-semibold bg-[var(--destructive)] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────────

export function HiringWorkspaceV3(props: Props) {
  const [roles, setRoles] = useState<OrgRole[]>(props.initialRoles);
  const [questions, setQuestions] = useState<InterviewQuestion[]>(props.initialQuestions);
  const [onboardingInstances, setOnboardingInstances] = useState<OnboardingPlanInstance[]>(
    props.initialOnboardingInstances,
  );
  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>(
    props.initialOnboardingTasks,
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    props.initialRoles[0]?.id ?? null,
  );
  const [selectedView, setSelectedView] = useState<"general" | "role">(
    props.initialRoles.length > 0 ? "role" : "general",
  );
  const [addingRole, setAddingRole] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const roleToDelete = useMemo(
    () => (deleteConfirmId ? (roles.find((r) => r.id === deleteConfirmId) ?? null) : null),
    [deleteConfirmId, roles],
  );

  const updateSelectedRole = useCallback(
    async (patch: Partial<OrgRole>) => {
      if (!selectedRole) return;
      const id = selectedRole.id;
      setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      if (id.startsWith("local_")) return;
      try {
        await fetch(`/api/workspaces/hiring/roles?planId=${props.planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
      } catch {
        // swallow — user can refresh
      }
    },
    [selectedRole, props.planId],
  );

  const addRole = useCallback(async () => {
    if (!props.canEdit) return;
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setAddingRole(false);
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/hiring/roles?planId=${props.planId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_title: trimmed, headcount: 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: OrgRole };
      if (data.data) {
        setRoles((prev) => [...prev, data.data!]);
        setSelectedRoleId(data.data.id);
        setSelectedView("role");
      }
    } catch {
      // swallow — input stays open so user can retry
    }
    setNewTitle("");
    setAddingRole(false);
  }, [newTitle, props.canEdit, props.planId]);

  const confirmDelete = useCallback(
    async (id: string) => {
      if (!props.canEdit) return;
      try {
        await fetch(`/api/workspaces/hiring/roles?planId=${props.planId}&id=${id}`, {
          method: "DELETE",
        });
      } catch {
        setDeleteConfirmId(null);
        return;
      }
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setSelectedRoleId((prev) => (prev === id ? null : prev));
      setDeleteConfirmId(null);
    },
    [props.canEdit, props.planId],
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
      <WorkspaceHeader
        Icon={Users}
        title="Hiring & Onboarding"
        description="Roles, interview questions, scorecards, competency forms, and onboarding plans."
        actions={
          <>
            {props.canEdit && (
              <WorkspaceActionButton
                variant="secondary"
                onClick={() => setAddingRole(true)}
              >
                <Plus size={WORKSPACE_ACTION_ICON_SIZE} />
                Add role
              </WorkspaceActionButton>
            )}
            <AskScoutButton
              workspaceKey="hiring"
              focusLabel="hiring plan"
              hasContent={roles.length > 0}
            />
          </>
        }
      />

      {/* 220px sidebar grid — matches Suppliers canonical layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6">
        <nav
          aria-label="Hiring sections"
          className="rounded-xl border border-[var(--border)] bg-white overflow-hidden self-start"
        >
          <ul className="divide-y divide-[var(--border)]">
            {/* General entry — always at index 0 */}
            <li className="relative">
              <button
                type="button"
                onClick={() => setSelectedView("general")}
                className={`w-full text-left px-4 py-3 flex items-start justify-between gap-2 transition-colors border-l-2 ${
                  selectedView === "general"
                    ? "bg-[var(--teal-tint-500)] border-l-[var(--teal)]"
                    : "border-l-transparent hover:bg-[var(--neutral-cool-50)]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-medium truncate ${
                      selectedView === "general" ? "text-[var(--teal)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    General
                  </span>
                  <span className="text-[11px] text-[var(--dark-grey)] mt-0.5 block">
                    Hiring laws &amp; jurisdiction
                  </span>
                </div>
              </button>
            </li>

            {/* Sortable role rows */}
            <HiringRoleNavV3
              planId={props.planId}
              roles={roles}
              canEdit={props.canEdit}
              selectedRoleId={selectedView === "role" ? selectedRoleId : null}
              onSelectRole={(id) => {
                setSelectedRoleId(id);
                setSelectedView("role");
              }}
              onRolesChange={setRoles}
              onDeleteRole={(id) => setDeleteConfirmId(id)}
            />

            {/* Add role affordance */}
            {props.canEdit && (
              <li>
                {addingRole ? (
                  <div className="px-3 py-2.5 flex items-center gap-2">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onBlur={addRole}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addRole();
                        else if (e.key === "Escape") {
                          setAddingRole(false);
                          setNewTitle("");
                        }
                      }}
                      placeholder="Role title"
                      className="flex-1 text-sm bg-transparent border border-[var(--border)] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--teal)]"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingRole(true)}
                    className="w-full text-left px-4 py-3 flex items-center gap-2 text-xs font-semibold text-[var(--teal)] hover:bg-[var(--neutral-cool-50)] transition-colors"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add role
                  </button>
                )}
              </li>
            )}
          </ul>
        </nav>

        <section className="min-w-0">
          {selectedView === "general" ? (
            <HiringLawsPanel
              initialSettings={props.initialHiringSettings}
              initialRequirementSets={props.initialRequirementSets}
            />
          ) : selectedRole ? (
            <RolePageV3
              role={selectedRole}
              roles={roles}
              planId={props.planId}
              canEdit={props.canEdit}
              minimumWage={props.minimumWage ?? null}
              questions={questions}
              onQuestionsChange={setQuestions}
              onboardingInstances={onboardingInstances}
              onboardingTasks={onboardingTasks}
              onOnboardingInstancesChange={setOnboardingInstances}
              onOnboardingTasksChange={setOnboardingTasks}
              onUpdateRole={updateSelectedRole}
              onDeleteRole={() => setDeleteConfirmId(selectedRole.id)}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-white px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
              Pick a role on the left, or add one to get started.
            </div>
          )}
        </section>
      </div>

      {deleteConfirmId && roleToDelete && (
        <DeleteRoleDialog
          roleTitle={roleToDelete.role_title}
          onConfirm={() => confirmDelete(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}

// ── Role page (right side) ────────────────────────────────────────────────────

type RolePageProps = {
  role: OrgRole;
  roles: OrgRole[];
  planId: string;
  canEdit: boolean;
  minimumWage: MinWageInfo | null;
  questions: InterviewQuestion[];
  onQuestionsChange: (next: InterviewQuestion[] | ((prev: InterviewQuestion[]) => InterviewQuestion[])) => void;
  onboardingInstances: OnboardingPlanInstance[];
  onboardingTasks: OnboardingTask[];
  onOnboardingInstancesChange: (next: OnboardingPlanInstance[] | ((prev: OnboardingPlanInstance[]) => OnboardingPlanInstance[])) => void;
  onOnboardingTasksChange: (next: OnboardingTask[] | ((prev: OnboardingTask[]) => OnboardingTask[])) => void;
  onUpdateRole: (patch: Partial<OrgRole>) => void;
  onDeleteRole: () => void;
};

function RolePageV3(props: RolePageProps) {
  const { role } = props;
  return (
    <div>
      <SectionHeader
        title={role.role_title || "Untitled role"}
        helpContent="Every hiring-and-onboarding component for this role is grouped below. Click a section to expand it."
        className="mb-4"
      />
      <div className="space-y-2">
        <AccordionV3 id="basics" title="Role basics" subtitle="Title, headcount, parent, notes" defaultOpen>
          <RoleBasicsSection
            role={role}
            roles={props.roles}
            canEdit={props.canEdit}
            onUpdate={props.onUpdateRole}
            onDelete={props.onDeleteRole}
          />
        </AccordionV3>
        <AccordionV3 id="comp" title="Compensation" subtitle="Pay basis, amount, hours, benefits">
          <RoleCompensationSection
            role={role}
            canEdit={props.canEdit}
            minimumWage={props.minimumWage}
            onUpdate={props.onUpdateRole}
          />
        </AccordionV3>
        <AccordionV3 id="jd" title="Job description" subtitle="Title, summary, responsibilities, requirements">
          <RoleJobDescriptionSection
            role={role}
            planId={props.planId}
            canEdit={props.canEdit}
            onUpdate={props.onUpdateRole}
          />
        </AccordionV3>
        <AccordionV3 id="interview" title="Interview questions" subtitle="Per-role question bank">
          <RoleInterviewQuestionsSection
            role={role}
            planId={props.planId}
            canEdit={props.canEdit}
            questions={props.questions}
            onQuestionsChange={props.onQuestionsChange}
          />
        </AccordionV3>
        <AccordionV3 id="scorecard" title="Interview scorecard" subtitle="Candidate × competency grid">
          <RoleScorecardSection
            role={role}
            planId={props.planId}
            canEdit={props.canEdit}
            questions={props.questions}
          />
        </AccordionV3>
        <AccordionV3 id="competency" title="Competency forms" subtitle="Staff skill check-ins">
          <RoleCompetencyFormsSection role={role} planId={props.planId} canEdit={props.canEdit} />
        </AccordionV3>
        <AccordionV3 id="onboarding" title="Onboarding plan" subtitle="First 90 days task list">
          <RoleOnboardingSection
            role={role}
            planId={props.planId}
            canEdit={props.canEdit}
            instances={props.onboardingInstances}
            tasks={props.onboardingTasks}
            onInstancesChange={props.onOnboardingInstancesChange}
            onTasksChange={props.onOnboardingTasksChange}
          />
        </AccordionV3>
      </div>
    </div>
  );
}

// ── Role basics ──────────────────────────────────────────────────────────────

function RoleBasicsSection({
  role,
  roles,
  canEdit,
  onUpdate,
  onDelete,
}: {
  role: OrgRole;
  roles: OrgRole[];
  canEdit: boolean;
  onUpdate: (patch: Partial<OrgRole>) => void;
  onDelete: () => void;
}) {
  const parentOptions = roles.filter((r) => r.id !== role.id);
  return (
    <section className="px-4 py-4">
      <SectionHeader title="Role Details" className="mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Role title</label>
          <input
            className={inputCls}
            value={role.role_title}
            onChange={(e) => onUpdate({ role_title: e.target.value })}
            placeholder="e.g. Head Barista"
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className={labelCls}>Headcount</label>
          <input
            className={inputCls}
            type="number"
            min={1}
            value={role.headcount}
            onChange={(e) => onUpdate({ headcount: parseInt(e.target.value, 10) || 1 })}
            disabled={!canEdit}
          />
        </div>
        <div>
          <label className={labelCls}>Reports to</label>
          <select
            className={inputCls}
            value={role.parent_role_id ?? ""}
            onChange={(e) => onUpdate({ parent_role_id: e.target.value || null })}
            disabled={!canEdit}
          >
            <option value="">None (top-level)</option>
            {parentOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.role_title || "Unnamed role"}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <input
            className={inputCls}
            value={role.notes ?? ""}
            onChange={(e) => onUpdate({ notes: e.target.value || null })}
            placeholder="Optional notes"
            disabled={!canEdit}
          />
        </div>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 flex items-center gap-1 text-xs text-[var(--dark-grey)] hover:text-[var(--error)] transition-colors"
        >
          <Trash2 size={12} />
          Delete role
        </button>
      )}
    </section>
  );
}

// ── Compensation ─────────────────────────────────────────────────────────────

function RoleCompensationSection({
  role,
  canEdit,
  minimumWage,
  onUpdate,
}: {
  role: OrgRole;
  canEdit: boolean;
  minimumWage: MinWageInfo | null;
  onUpdate: (patch: Partial<OrgRole>) => void;
}) {
  const [compLine, setCompLine] = useState<PersonnelLine | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compDirty, setCompDirty] = useState(false);
  const [compSaving, setCompSaving] = useState(false);
  const [compPayBasis, setCompPayBasis] = useState<PersonnelPayBasis>("monthly");
  const [compPayAmount, setCompPayAmount] = useState<number | "">(0);
  const [compHoursPerWeek, setCompHoursPerWeek] = useState<number | "">(30);
  const [compBenefitsPct, setCompBenefitsPct] = useState<number | "">(0);

  const compHourlyForCompare = (() => {
    if (typeof compPayAmount !== "number" || compPayAmount <= 0) return 0;
    if (compPayBasis === "hourly") return Math.round(compPayAmount * 100);
    const hoursPerWeek = typeof compHoursPerWeek === "number" && compHoursPerWeek > 0 ? compHoursPerWeek : 40;
    const monthlyHours = (hoursPerWeek * 52) / 12;
    if (monthlyHours <= 0) return 0;
    if (compPayBasis === "monthly") return Math.round((compPayAmount * 100) / monthlyHours);
    if (compPayBasis === "annual") return Math.round((compPayAmount * 100) / 12 / monthlyHours);
    return 0;
  })();
  const compWageBelowFloor = isBelowMinimumWage(compHourlyForCompare, minimumWage ?? null);

  useEffect(() => {
    if (role.id.startsWith("local_")) return;
    setCompLoading(true);
    fetch(`/api/workspaces/financials/role-comp?org_role_id=${encodeURIComponent(role.id)}`)
      .then((r) => (r.ok ? r.json() : { line: null }))
      .then((data: { line: PersonnelLine | null }) => {
        const l = data.line;
        if (l) {
          setCompLine(l);
          setCompPayBasis(l.pay_basis);
          setCompPayAmount(l.pay_amount_cents / 100);
          setCompHoursPerWeek(l.hours_per_week ?? 30);
          setCompBenefitsPct(l.benefits_pct);
        }
      })
      .finally(() => setCompLoading(false));
  }, [role.id]);

  async function saveComp() {
    if (!canEdit) return;
    setCompSaving(true);
    try {
      const res = await fetch("/api/workspaces/financials/role-comp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_role_id: role.id,
          role_title: role.role_title,
          headcount: role.headcount,
          pay_basis: compPayBasis,
          pay_amount_cents: Math.round((typeof compPayAmount === "number" ? compPayAmount : 0) * 100),
          hours_per_week: compPayBasis === "hourly" ? (typeof compHoursPerWeek === "number" ? compHoursPerWeek : 30) : undefined,
          benefits_pct: typeof compBenefitsPct === "number" ? compBenefitsPct : 0,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { line: PersonnelLine; monthly_cost_cents: number };
        setCompLine(data.line);
        onUpdate({ monthly_cost_cents: data.monthly_cost_cents });
        setCompDirty(false);
      }
    } finally {
      setCompSaving(false);
    }
  }

  const { formatMinor } = useCurrency();
  const compPreviewCents =
    typeof compPayAmount === "number" && compPayAmount > 0
      ? personnelLoadedMonthlyCents({
          id: compLine?.id ?? "preview",
          role: role.role_title,
          headcount: role.headcount,
          pay_basis: compPayBasis,
          pay_amount_cents: Math.round(compPayAmount * 100),
          hours_per_week: compPayBasis === "hourly" ? (typeof compHoursPerWeek === "number" ? compHoursPerWeek : 30) : undefined,
          benefits_pct: typeof compBenefitsPct === "number" ? compBenefitsPct : 0,
          cost_category: compLine?.cost_category ?? "overhead",
        })
      : null;

  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="Compensation" className="mb-0" />
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {compLoading && <span className="text-[10px] text-[var(--dark-grey)]">Loading…</span>}
          {!compLoading && compLine === null && !compDirty && (
            <span className="text-[10px] text-[var(--dark-grey)]">Not set.</span>
          )}
          {compPreviewCents !== null && (
            <span className="text-xs font-semibold text-[var(--teal)]">
              {formatMinor(compPreviewCents)}/mo
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 items-end bg-white border border-[var(--neutral-cool-200)] rounded-lg p-3">
        <div className="w-36">
          <label className={labelCls}>Pay basis</label>
          <select
            className={inputCls}
            value={compPayBasis}
            disabled={!canEdit || compLoading}
            onChange={(e) => {
              const v = e.target.value as PersonnelPayBasis;
              setCompPayBasis(v);
              if (v === "hourly" && typeof compHoursPerWeek !== "number") setCompHoursPerWeek(30);
              setCompDirty(true);
            }}
          >
            {(Object.keys(PAY_BASIS_LABEL) as PersonnelPayBasis[]).map((b) => (
              <option key={b} value={b}>{PAY_BASIS_LABEL[b]}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className={labelCls}>{compPayBasis === "hourly" ? "Rate / hour" : "Pay amount"}</label>
          <MoneyInput
            className={inputCls}
            min={0}
            step={compPayBasis === "hourly" ? 0.25 : 100}
            value={compPayAmount}
            disabled={!canEdit || compLoading}
            onChange={(e) => {
              setCompPayAmount(e.target.value === "" ? "" : parseFloat(e.target.value));
              setCompDirty(true);
            }}
          />
        </div>
        {compPayBasis === "hourly" && (
          <div className="w-28">
            <label className={labelCls}>Hours / week</label>
            <input
              className={inputCls}
              type="number"
              min={0}
              max={168}
              step={1}
              value={compHoursPerWeek}
              disabled={!canEdit || compLoading}
              onChange={(e) => {
                setCompHoursPerWeek(e.target.value === "" ? "" : parseFloat(e.target.value));
                setCompDirty(true);
              }}
            />
          </div>
        )}
        <div className="w-24">
          <label className={labelCls}>Benefits %</label>
          <div className="relative">
            <input
              className={inputCls + " pr-6"}
              type="number"
              min={0}
              max={100}
              step={1}
              value={compBenefitsPct}
              disabled={!canEdit || compLoading}
              onChange={(e) => {
                setCompBenefitsPct(e.target.value === "" ? "" : parseFloat(e.target.value));
                setCompDirty(true);
              }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">%</span>
          </div>
        </div>
        {canEdit && compDirty && (
          <button
            type="button"
            onClick={saveComp}
            disabled={compSaving}
            className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
          >
            {compSaving ? "Saving…" : "Save comp"}
          </button>
        )}
      </div>
      {compWageBelowFloor && minimumWage && (
        <p
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/5 px-3 py-2 text-xs leading-snug text-[var(--error)]"
        >
          <AlertTriangle size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
          <span>
            {formatHourlyWage(compHourlyForCompare, minimumWage.currency)}/hr is below {minimumWage.jurisdictionLabel}&apos;s {minimumWage.year} minimum wage of {formatHourlyWage(minimumWage.hourlyMinorUnits, minimumWage.currency)}/hr. This wage is non-compliant.
          </span>
        </p>
      )}
    </section>
  );
}

// ── Job description ──────────────────────────────────────────────────────────

function RoleJobDescriptionSection({
  role,
  planId,
  canEdit,
  onUpdate,
}: {
  role: OrgRole;
  planId: string;
  canEdit: boolean;
  onUpdate: (patch: Partial<OrgRole>) => void;
}) {
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();
  const [jdFields, setJdFields] = useState<JdFields | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdLoaded, setJdLoaded] = useState(false);
  const [jdDirty, setJdDirty] = useState(false);
  const [aiAssistJdField, setAiAssistJdField] = useState<{
    fieldKey: keyof JdFields;
    fieldLabel: string;
    currentValue: string;
    onApply: (v: string) => void;
  } | null>(null);

  useEffect(() => {
    if (jdLoaded || jdLoading) return;
    setJdLoading(true);
    const defaults: JdFields = {
      title: role.role_title || "",
      summary: "",
      responsibilities: "",
      requirements: "",
      comp: "",
    };
    setJdFields(defaults);
    const run = async () => {
      if (role.jd_template_id) {
        try {
          const res = await fetch(
            `/api/workspaces/hiring/roles?planId=${planId}&jd_id=${role.jd_template_id}`,
          );
          if (res.ok) {
            const data = await res.json();
            setJdFields({
              title: data.title ?? role.role_title ?? "",
              summary: data.summary ?? "",
              responsibilities: data.responsibilities ?? "",
              requirements: data.requirements ?? "",
              comp: data.comp ?? "",
            });
          }
        } catch { /* defaults */ }
      }
      setJdLoading(false);
      setJdLoaded(true);
    };
    run();
  }, [role.id, role.jd_template_id, role.role_title, planId, jdLoaded, jdLoading]);

  async function saveJd() {
    if (!jdFields) return;
    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: role.id, jd: jdFields }),
    });
    if (res.ok) {
      const updated = (await res.json()) as OrgRole;
      onUpdate({ jd_template_id: updated.jd_template_id });
      setJdDirty(false);
    }
  }

  return (
    <section className="px-4 py-4">
      <SectionHeader title="Job Description" className="mb-3" />
      {jdLoading ? (
        <p className="text-sm text-[var(--dark-grey)]" role="status">Loading…</p>
      ) : (
        <>
          <div className="space-y-4">
            {JD_FIELD_DEFS.map(({ key, label, multiline }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls}>{label}</label>
                  {multiline && canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        setAiAssistJdField({
                          fieldKey: key,
                          fieldLabel: label,
                          currentValue: jdFields?.[key] ?? "",
                          onApply: (v) => {
                            setJdFields((prev) => (prev ? { ...prev, [key]: v } : prev));
                            setJdDirty(true);
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-2 py-0.5 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Sparkles size={10} aria-hidden="true" />
                      Write with AI
                    </button>
                  )}
                </div>
                {multiline ? (
                  <textarea
                    rows={4}
                    className={inputCls + " resize-none"}
                    value={jdFields?.[key] ?? ""}
                    onChange={(e) => {
                      setJdFields((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                      setJdDirty(true);
                    }}
                    disabled={!canEdit}
                  />
                ) : (
                  <input
                    className={inputCls}
                    value={jdFields?.[key] ?? ""}
                    onChange={(e) => {
                      setJdFields((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
                      setJdDirty(true);
                    }}
                    disabled={!canEdit}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3">
            {jdFields && role.jd_template_id ? (
              <HiringPdfButton
                templateId="hiring_job_description"
                queryParams={{ role_id: role.id }}
                label="Print JD"
              />
            ) : (
              <span />
            )}
            {canEdit && (
              <button
                type="button"
                onClick={saveJd}
                disabled={!jdDirty}
                className="text-sm font-semibold bg-[var(--teal)] text-white px-5 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
              >
                Save JD
              </button>
            )}
          </div>
        </>
      )}
      {aiAssistJdField && (
        <AIAssistCallout
          open={true}
          onClose={() => setAiAssistJdField(null)}
          fieldLabel={aiAssistJdField.fieldLabel}
          moduleLabel="Hiring & Onboarding"
          fieldKey={aiAssistJdField.fieldKey}
          workspaceKey="hiring"
          planId={planId}
          currentValue={aiAssistJdField.currentValue}
          onApply={aiAssistJdField.onApply}
          openAIReviewModal={openAIReviewModal}
        />
      )}
      {AIReviewModalNode}
    </section>
  );
}

// ── Interview questions ───────────────────────────────────────────────────────

function RoleInterviewQuestionsSection({
  role,
  planId,
  canEdit,
  questions,
  onQuestionsChange,
}: {
  role: OrgRole;
  planId: string;
  canEdit: boolean;
  questions: InterviewQuestion[];
  onQuestionsChange: (next: InterviewQuestion[] | ((prev: InterviewQuestion[]) => InterviewQuestion[])) => void;
}) {
  const [roleScorecards, setRoleScorecards] = useState<InterviewScorecard[]>([]);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string | null>(null);
  const [loadingScorecards, setLoadingScorecards] = useState(false);

  useEffect(() => {
    setLoadingScorecards(true);
    fetch(`/api/workspaces/hiring/scorecards?role_id=${role.id}`)
      .then((r) => r.json())
      .then((sc: unknown) => {
        const list = Array.isArray(sc) ? (sc as InterviewScorecard[]) : [];
        setRoleScorecards(list);
        const def = list.find((s) => s.is_default) ?? list[0] ?? null;
        setSelectedScorecardId(def?.id ?? null);
      })
      .finally(() => setLoadingScorecards(false));
  }, [role.id]);

  const roleQuestions = questions.filter((q) => {
    if (selectedScorecardId) return q.scorecard_id === selectedScorecardId;
    return (q.role_id === role.id || q.role_id === null) && !q.scorecard_id;
  });

  async function addQuestion() {
    const optimistic: InterviewQuestion = {
      id: makeLocalId(),
      plan_id: planId,
      role_id: role.id,
      scorecard_id: selectedScorecardId,
      prompt: "",
      weight: 3,
      order_index: questions.length,
    };
    onQuestionsChange((prev) => [...prev, optimistic]);
    const res = await fetch(`/api/workspaces/hiring/questions?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        role_id: role.id,
        scorecard_id: selectedScorecardId,
        prompt: "",
        weight: 3,
        order_index: questions.length,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as InterviewQuestion;
      onQuestionsChange((prev) => prev.map((q) => (q.id === optimistic.id ? created : q)));
    } else {
      onQuestionsChange((prev) => prev.filter((q) => q.id !== optimistic.id));
    }
  }

  async function updateQuestion(id: string, patch: Partial<InterviewQuestion>) {
    onQuestionsChange((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    await fetch(`/api/workspaces/hiring/questions?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteQuestion(id: string) {
    const snapshot = questions;
    onQuestionsChange((prev) => prev.filter((q) => q.id !== id));
    const res = await fetch(`/api/workspaces/hiring/questions?planId=${planId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) onQuestionsChange(snapshot);
  }

  return (
    <section className="px-4 py-4 space-y-4">
      {roleScorecards.length > 0 && (
        <div>
          <label className={labelCls}>Scorecard variant</label>
          <select
            className={inputCls}
            value={selectedScorecardId ?? ""}
            onChange={(e) => setSelectedScorecardId(e.target.value || null)}
          >
            {roleScorecards.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}{sc.is_default ? " (Default)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-2">
            Manage scorecard variants from the Competency forms section below.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Interview Questions</p>
            <SectionHelp title="Interview Questions">Template questions and weights for this scorecard.</SectionHelp>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] shrink-0"
            >
              <Plus size={13} />
              Add question
            </button>
          )}
        </div>

        {loadingScorecards ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--dark-grey)]">Loading…</p>
          </div>
        ) : roleQuestions.length === 0 ? (
          <div className="py-8 text-center px-5">
            <p className="text-sm text-[var(--dark-grey)]">
              {selectedScorecardId
                ? "No questions in this scorecard yet. Add one above."
                : "No questions yet. Add interview questions above."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neutral-cool-100)]">
            {roleQuestions.map((q) => (
              <div key={q.id} className="px-5 py-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      className="w-full text-sm text-[var(--foreground)] bg-transparent border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none py-0.5 disabled:hover:border-transparent"
                      value={q.prompt}
                      onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                      placeholder="Interview question..."
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-[var(--muted-foreground)]">Weight</span>
                    <select
                      className="text-xs border border-[var(--border-medium)] rounded px-1 py-0.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)]"
                      value={q.weight}
                      onChange={(e) => updateQuestion(q.id, { weight: parseInt(e.target.value, 10) })}
                      disabled={!canEdit}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => deleteQuestion(q.id)}
                        className="text-[var(--dark-grey)] hover:text-[var(--error)] p-0.5"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Scorecard ────────────────────────────────────────────────────────────────

function RoleScorecardSection({
  role,
  planId,
  canEdit,
  questions,
}: {
  role: OrgRole;
  planId: string;
  canEdit: boolean;
  questions: InterviewQuestion[];
}) {
  const [scorecards, setScorecards] = useState<InterviewScorecard[]>([]);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScorecards([]);
    setSelectedScorecardId(null);
    setRenaming(null);
    fetch(`/api/workspaces/hiring/scorecards?role_id=${role.id}`)
      .then((r) => r.json())
      .then((sc: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(sc) ? (sc as InterviewScorecard[]) : [];
        setScorecards(list);
        const def = list.find((s) => s.is_default) ?? list[0] ?? null;
        setSelectedScorecardId(def?.id ?? null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role.id]);

  const scorecardQuestions = selectedScorecardId
    ? questions.filter((q) => q.scorecard_id === selectedScorecardId)
    : [];

  async function addScorecard() {
    const res = await fetch("/api/workspaces/hiring/scorecards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "New Scorecard", order_index: scorecards.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as InterviewScorecard;
      setScorecards((prev) => [...prev, created]);
      setSelectedScorecardId(created.id);
      setRenaming(created.id);
      setRenameValue(created.name);
    }
  }

  async function duplicateScorecard(id: string) {
    const res = await fetch("/api/workspaces/hiring/scorecards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "duplicate", id }),
    });
    if (res.ok) {
      const copy = (await res.json()) as InterviewScorecard;
      setScorecards((prev) => [...prev, copy]);
      setSelectedScorecardId(copy.id);
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim() || "Scorecard";
    setScorecards((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setRenaming(null);
    await fetch("/api/workspaces/hiring/scorecards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteScorecard(id: string) {
    const next = scorecards.filter((s) => s.id !== id);
    setScorecards(next);
    if (selectedScorecardId === id) {
      const fallback = next.find((s) => s.is_default) ?? next[0] ?? null;
      setSelectedScorecardId(fallback?.id ?? null);
    }
    await fetch(`/api/workspaces/hiring/scorecards?id=${id}`, { method: "DELETE" });
  }

  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="Scorecards" className="mb-0" />
        {canEdit && (
          <button
            type="button"
            onClick={addScorecard}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:underline ml-4 flex-shrink-0"
          >
            <Plus size={12} /> New
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-[var(--dark-grey)]">Loading…</p>
      ) : scorecards.length === 0 ? (
        <p className="text-xs text-[var(--dark-grey)]">
          No scorecards yet. Click <span className="font-semibold">+ New</span> above to create one.
        </p>
      ) : (
        <div className="space-y-2">
          {scorecards.map((sc) => (
            <div
              key={sc.id}
              className={`flex items-center gap-2 border rounded-lg px-3 py-2 bg-white ${
                sc.id === selectedScorecardId
                  ? "border-[var(--teal)] ring-1 ring-[var(--teal)]"
                  : "border-[var(--border)]"
              }`}
            >
              {renaming === sc.id ? (
                <>
                  <input
                    autoFocus
                    className="flex-1 text-sm border border-[var(--border-medium)] rounded px-2 py-1 focus-visible:outline-none focus:border-[var(--teal)]"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(sc.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                  <button type="button" onClick={() => saveRename(sc.id)} className="text-[var(--teal)] p-1">
                    <Check size={13} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedScorecardId(sc.id)}
                    className="flex-1 min-w-0 text-left text-sm text-[var(--foreground)] truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] rounded"
                    aria-pressed={sc.id === selectedScorecardId}
                  >
                    <span className="truncate">{sc.name}</span>
                    {sc.is_default && (
                      <span className="ml-2 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-bg-50)] px-1.5 py-0.5 rounded-full">Default</span>
                    )}
                  </button>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        title="Rename"
                        onClick={() => { setRenaming(sc.id); setRenameValue(sc.name); }}
                        className="text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        title="Duplicate"
                        onClick={() => duplicateScorecard(sc.id)}
                        className="text-[var(--dark-grey)] hover:text-[var(--teal)] p-1"
                      >
                        <Copy size={12} />
                      </button>
                      <HiringPdfButton
                        templateId="hiring_scorecard_blank"
                        queryParams={{ scorecard_id: sc.id }}
                        label=""
                        iconTitle="Print blank scorecard"
                      />
                      <ScorecardWorksheetButton scorecardId={sc.id} />
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deleteScorecard(sc.id)}
                        className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedScorecardId && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Scorecard Grid</p>
            <SectionHelp title="Scorecard Grid">
              Rate each candidate (rows) on each competency (columns) on a 1–5 scale.
              Weighted totals appear automatically.
            </SectionHelp>
          </div>
          <div className="px-4 py-4 overflow-x-auto">
            <ScorecardGridPanel
              scorecardId={selectedScorecardId}
              planId={planId}
              questions={scorecardQuestions}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ── Competency forms ─────────────────────────────────────────────────────────

function RoleCompetencyFormsSection({
  role,
  planId,
  canEdit,
}: {
  role: OrgRole;
  planId: string;
  canEdit: boolean;
}) {
  const [forms, setForms] = useState<CompetencyFormTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (loaded || loading) return;
    setLoading(true);
    fetch(`/api/workspaces/hiring/competency-forms?role_id=${role.id}`)
      .then((r) => r.json())
      .then((cf: unknown) => setForms(Array.isArray(cf) ? (cf as CompetencyFormTemplate[]) : []))
      .finally(() => { setLoading(false); setLoaded(true); });
  }, [role.id, loaded, loading]);

  async function addCompForm() {
    const res = await fetch("/api/workspaces/hiring/competency-forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "General", order_index: forms.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as CompetencyFormTemplate;
      setForms((prev) => [...prev, created]);
      setRenaming(created.id);
      setRenameValue(created.name);
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim() || "General";
    setForms((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    setRenaming(null);
    await fetch("/api/workspaces/hiring/competency-forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteForm(id: string) {
    setForms((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/workspaces/hiring/competency-forms?id=${id}`, { method: "DELETE" });
  }

  return (
    <section className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader title="Competency Forms" className="mb-0" />
        {canEdit && (
          <button
            type="button"
            onClick={addCompForm}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:underline ml-4 flex-shrink-0"
          >
            <Plus size={12} /> New
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-[var(--dark-grey)]">Loading…</p>
      ) : forms.length === 0 ? (
        <p className="text-xs text-[var(--dark-grey)]">No competency form template yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {forms.map((cf) => (
            <div key={cf.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-white">
              {renaming === cf.id ? (
                <>
                  <input
                    autoFocus
                    className="flex-1 text-sm border border-[var(--border-medium)] rounded px-2 py-1 focus-visible:outline-none focus:border-[var(--teal)]"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(cf.id);
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                  <button type="button" onClick={() => saveRename(cf.id)} className="text-[var(--teal)] p-1">
                    <Check size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-[var(--foreground)] truncate">{cf.name}</span>
                  <HiringPdfButton
                    templateId="hiring_competency_blank"
                    queryParams={{ form_template_id: cf.id }}
                    label=""
                    iconTitle="Print blank form"
                  />
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        title="Rename"
                        onClick={() => { setRenaming(cf.id); setRenameValue(cf.name); }}
                        className="text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deleteForm(cf.id)}
                        className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Onboarding ────────────────────────────────────────────────────────────────

function RoleOnboardingSection({
  role,
  planId,
  canEdit,
  instances,
  tasks,
  onInstancesChange,
  onTasksChange,
}: {
  role: OrgRole;
  planId: string;
  canEdit: boolean;
  instances: OnboardingPlanInstance[];
  tasks: OnboardingTask[];
  onInstancesChange: (next: OnboardingPlanInstance[] | ((prev: OnboardingPlanInstance[]) => OnboardingPlanInstance[])) => void;
  onTasksChange: (next: OnboardingTask[] | ((prev: OnboardingTask[]) => OnboardingTask[])) => void;
}) {
  const roleInstances = useMemo(
    () => instances.filter((i) => i.role_id === role.id),
    [instances, role.id],
  );
  const [selectedId, setSelectedId] = useState<string | null>(roleInstances[0]?.id ?? null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newHireName, setNewHireName] = useState("");
  const [newStartDate, setNewStartDate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<OnboardingPhase>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const { openAIReviewModal: openTaskAIReviewModal, AIReviewModalNode: TaskAIReviewModalNode } = useAIReviewModal();
  const [aiAssistTask, setAiAssistTask] = useState<{
    taskId: string;
    taskName: string;
    currentValue: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedId && roleInstances.length > 0) setSelectedId(roleInstances[0].id);
    if (selectedId && !roleInstances.some((i) => i.id === selectedId)) {
      setSelectedId(roleInstances[0]?.id ?? null);
    }
  }, [roleInstances, selectedId]);

  const selectedInstance = roleInstances.find((i) => i.id === selectedId) ?? null;
  const instanceTasks = tasks.filter((t) => t.instance_id === selectedId);

  function togglePhase(phase: OnboardingPhase) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }

  async function createPlan() {
    if (!newHireName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/workspaces/hiring/onboarding?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        hire_name: newHireName,
        role_id: role.id,
        start_date: newStartDate || null,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as OnboardingPlanInstance;
      onInstancesChange((prev) => [...prev, created]);
      setSelectedId(created.id);

      const taskPayloads = DEFAULT_ONBOARDING_TASKS.map((t, i) => ({
        instance_id: created.id,
        phase: t.phase,
        task: t.task,
        detail: t.detail,
        due_offset_days: t.due_offset_days,
        completed_at: null,
        notes: null,
        order_index: i,
      }));
      const seedRes = await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: taskPayloads }),
      });
      if (seedRes.ok) {
        const seeded = (await seedRes.json()) as OnboardingTask[];
        onTasksChange((prev) => [...prev, ...seeded]);
      }
    }
    setNewHireName("");
    setNewStartDate("");
    setShowNewForm(false);
    setCreating(false);
  }

  async function toggleTask(task: OnboardingTask) {
    const completed_at = task.completed_at ? null : new Date().toISOString();
    onTasksChange((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed_at } : t)));
    await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, completed_at }),
    });
  }

  async function updateTask(id: string, patch: Partial<OnboardingTask>) {
    onTasksChange((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteTask(id: string) {
    const snapshot = tasks;
    onTasksChange((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) onTasksChange(snapshot);
  }

  async function addTask(phase: OnboardingPhase) {
    if (!selectedId) return;
    const phaseTasks = instanceTasks.filter((t) => t.phase === phase);
    const optimistic: OnboardingTask = {
      id: makeLocalId(),
      instance_id: selectedId,
      phase,
      task: "",
      detail: null,
      due_offset_days: null,
      completed_at: null,
      notes: null,
      order_index: phaseTasks.length,
    };
    onTasksChange((prev) => [...prev, optimistic]);
    const res = await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tasks: [
          {
            instance_id: selectedId,
            phase,
            task: "",
            detail: null,
            due_offset_days: null,
            completed_at: null,
            notes: null,
            order_index: phaseTasks.length,
          },
        ],
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as OnboardingTask[];
      onTasksChange((prev) => [...prev.filter((t) => t.id !== optimistic.id), ...created]);
    } else {
      onTasksChange((prev) => prev.filter((t) => t.id !== optimistic.id));
    }
  }

  async function deleteInstance(id: string) {
    const snapshot = instances;
    onInstancesChange((prev) => prev.filter((i) => i.id !== id));
    onTasksChange((prev) => prev.filter((t) => t.instance_id !== id));
    if (selectedId === id) setSelectedId(roleInstances.find((i) => i.id !== id)?.id ?? null);
    const res = await fetch(`/api/workspaces/hiring/onboarding?planId=${planId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) onInstancesChange(snapshot);
  }

  return (
    <section className="px-4 py-4 space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--foreground)]">Onboarding Plans</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)]"
            >
              <Plus size={13} />
              New plan
            </button>
          )}
        </div>

        {showNewForm && (
          <div className="px-4 py-4 border-b border-[var(--border)] bg-[var(--background)] space-y-3">
            <p className={sectionLabelCls}>New onboarding plan</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Hire name</label>
                <input
                  className={inputCls}
                  value={newHireName}
                  onChange={(e) => setNewHireName(e.target.value)}
                  placeholder="e.g. Alex Johnson"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelCls}>Start date</label>
                <input
                  className={inputCls}
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={creating || !newHireName.trim()}
                onClick={createPlan}
                className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create plan"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {roleInstances.length === 0 && !showNewForm ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--dark-grey)]">
              No onboarding plans for {role.role_title || "this role"} yet. Create one above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neutral-cool-100)]">
            {roleInstances.map((inst) => {
              const instTasks = tasks.filter((t) => t.instance_id === inst.id);
              const completed = instTasks.filter((t) => t.completed_at).length;
              const total = instTasks.length;
              const pct = progressPct(completed, total);
              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedId(inst.id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-4 transition-colors ${
                    selectedId === inst.id ? "bg-[var(--teal-tint-500)]" : "hover:bg-[var(--background)]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">{inst.hire_name}</p>
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {inst.start_date
                        ? `Starts ${new Date(`${inst.start_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : "No start date"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-[var(--neutral-cool-200)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--teal)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {completed}/{total}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteInstance(inst.id);
                      }}
                      className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedInstance && (
        <div className="space-y-3">
          {PHASE_ORDER.map((phase) => {
            const phaseTasks = instanceTasks
              .filter((t) => t.phase === phase)
              .sort((a, b) => a.order_index - b.order_index);
            const isCollapsed = collapsedPhases.has(phase);
            const doneCount = phaseTasks.filter((t) => t.completed_at).length;
            return (
              <div key={phase} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => togglePhase(phase)}
                  className="w-full px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] hover:bg-[var(--gray-250)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={14} className="text-[var(--teal)]" />
                    ) : (
                      <ChevronDown size={14} className="text-[var(--teal)]" />
                    )}
                    <span className="text-xs font-semibold text-[var(--teal)]">{PHASE_LABELS[phase]}</span>
                  </div>
                  <span className="text-[10px] text-[var(--dark-grey)]">
                    {doneCount}/{phaseTasks.length} done
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {phaseTasks.length === 0 ? (
                      <div className="px-4 py-3">
                        <p className="text-xs text-[var(--dark-grey)]">No tasks in this phase.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--neutral-cool-100)]">
                        {phaseTasks.map((t) => {
                          const isExpanded = expandedTaskId === t.id;
                          const dueDate = computeDueDateLabel(selectedInstance.start_date, t.due_offset_days);
                          return (
                            <div key={t.id} className="px-4 py-3 space-y-2">
                              <div className="flex flex-wrap items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => canEdit && toggleTask(t)}
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    t.completed_at
                                      ? "bg-[var(--teal)] border-[var(--teal)]"
                                      : "border-[var(--neutral-cool-350)] hover:border-[var(--teal)]"
                                  } ${!canEdit ? "cursor-default" : "cursor-pointer"}`}
                                  aria-label={t.completed_at ? "Mark incomplete" : "Mark complete"}
                                >
                                  {t.completed_at && <Check size={10} className="text-white" />}
                                </button>
                                <div className="flex-1 min-w-[140px]">
                                  <input
                                    className={`w-full text-sm bg-transparent border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none py-0.5 disabled:hover:border-transparent ${
                                      t.completed_at ? "line-through text-[var(--dark-grey)]" : "text-[var(--foreground)]"
                                    }`}
                                    value={t.task}
                                    onChange={(e) => updateTask(t.id, { task: e.target.value })}
                                    placeholder="Task description..."
                                    disabled={!canEdit}
                                  />
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                                  <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                    <span className="whitespace-nowrap">Due: Day</span>
                                    <input
                                      className="w-12 text-xs border border-[var(--border-medium)] rounded px-1.5 py-0.5 text-[var(--foreground)] text-center focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)]"
                                      type="number"
                                      value={t.due_offset_days ?? ""}
                                      onChange={(e) =>
                                        updateTask(t.id, {
                                          due_offset_days: e.target.value ? parseInt(e.target.value, 10) : null,
                                        })
                                      }
                                      placeholder="—"
                                      disabled={!canEdit}
                                    />
                                  </div>
                                  {dueDate && (
                                    <span className="text-[10px] text-[var(--dark-grey)] whitespace-nowrap">{dueDate}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                                    className="text-[var(--dark-grey)] hover:text-[var(--teal)] p-0.5"
                                    title={isExpanded ? "Hide detail" : "Show detail"}
                                  >
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </button>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => deleteTask(t.id)}
                                      className="text-[var(--dark-grey)] hover:text-[var(--error)] p-0.5"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="ml-7 rounded-lg bg-[var(--warm-1050)] border border-[var(--neutral-cool-200)] p-3 space-y-2">
                                  {canEdit ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-[var(--muted-foreground)]">Detail</span>
                                        <button
                                          type="button"
                                          disabled={!!aiAssistTask}
                                          onClick={() =>
                                            setAiAssistTask({
                                              taskId: t.id,
                                              taskName: t.task,
                                              currentValue: t.detail ?? "",
                                            })
                                          }
                                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-2 py-0.5 hover:bg-[var(--teal)]/5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          <Sparkles size={10} aria-hidden="true" />
                                          Write with AI
                                        </button>
                                      </div>
                                      <textarea
                                        className="w-full text-xs text-[var(--foreground)] bg-transparent resize-none focus-visible:outline-none placeholder-[var(--neutral-cool-400)]"
                                        rows={3}
                                        value={t.detail ?? ""}
                                        onChange={(e) => updateTask(t.id, { detail: e.target.value || null })}
                                        placeholder="Add detail, instructions, or context for this task..."
                                      />
                                    </>
                                  ) : t.detail ? (
                                    <p className="text-xs text-[var(--gray-1150)]">{t.detail}</p>
                                  ) : (
                                    <p className="text-xs text-[var(--dark-grey)] italic">No detail added.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {canEdit && (
                      <div className="px-4 py-2 border-t border-[var(--neutral-cool-100)]">
                        <button
                          type="button"
                          onClick={() => addTask(phase)}
                          className="flex items-center gap-1 text-xs text-[var(--teal)] hover:underline"
                        >
                          <Plus size={11} />
                          Add task
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aiAssistTask && (
        <AIAssistCallout
          open={true}
          onClose={() => setAiAssistTask(null)}
          fieldLabel={aiAssistTask.taskName || "Task Detail"}
          moduleLabel="Onboarding"
          fieldKey="task-detail"
          workspaceKey="hiring"
          planId={planId}
          currentValue={aiAssistTask.currentValue}
          onApply={(v) => updateTask(aiAssistTask.taskId, { detail: v.trim() ? v : null })}
          openAIReviewModal={openTaskAIReviewModal}
        />
      )}
      {TaskAIReviewModalNode}
    </section>
  );
}

// ── Left nav — Suppliers sidebar layout with DnD ──────────────────────────────

function HiringRoleNavV3({
  planId,
  roles,
  canEdit,
  selectedRoleId,
  onSelectRole,
  onRolesChange,
  onDeleteRole,
}: {
  planId: string;
  roles: OrgRole[];
  canEdit: boolean;
  selectedRoleId: string | null;
  onSelectRole: (id: string) => void;
  onRolesChange: (next: OrgRole[]) => void;
  onDeleteRole: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deltaX, setDeltaX] = useState(0);

  const childMap = useMemo(() => buildChildMap(roles), [roles]);
  const flatNodes = useMemo(() => flattenTree(roles, childMap), [roles, childMap]);
  const sortableIds = useMemo(() => flatNodes.map((n) => n.role.id), [flatNodes]);

  const activeNode = activeId
    ? flatNodes.find((n) => n.role.id === activeId) ?? null
    : null;
  const originalDepth = activeNode?.depth ?? 0;
  const proposedDepth = useMemo(() => {
    if (!activeId) return 0;
    const delta = Math.round(deltaX / INDENT_STEP);
    return Math.max(0, Math.min(originalDepth + delta, MAX_DEPTH));
  }, [activeId, deltaX, originalDepth]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
    setDeltaX(0);
  }

  function handleDragMove({ delta }: DragMoveEvent) {
    setDeltaX(delta.x);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id = active.id as string;
    setActiveId(null);
    setDeltaX(0);
    if (!over || over.id === id) return;

    const overIdx = flatNodes.findIndex((n) => n.role.id === over.id);
    if (overIdx === -1) return;

    const targetDepth = proposedDepth;
    let newParentId: string | null = null;
    for (let i = overIdx - 1; i >= 0; i--) {
      if (flatNodes[i].depth === targetDepth - 1) {
        newParentId = flatNodes[i].role.id;
        break;
      }
      if (flatNodes[i].depth < targetDepth - 1) break;
    }
    if (targetDepth === 0) newParentId = null;

    const reordered = [...flatNodes];
    const fromIdx = reordered.findIndex((n) => n.role.id === id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(overIdx > fromIdx ? overIdx : overIdx, 0, moved);

    const batch: Array<{ id: string; parent_role_id: string | null; order_index: number }> = [];
    let i = 0;
    for (const n of reordered) {
      const isMoved = n.role.id === id;
      batch.push({
        id: n.role.id,
        parent_role_id: isMoved ? newParentId : n.role.parent_role_id ?? null,
        order_index: i++,
      });
    }

    const nextRoles = roles.map((r) => {
      const entry = batch.find((b) => b.id === r.id);
      if (!entry) return r;
      return { ...r, parent_role_id: entry.parent_role_id, order_index: entry.order_index };
    });
    onRolesChange(nextRoles);

    fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch }),
    }).catch(() => {});
  }

  if (flatNodes.length === 0) {
    return null;
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {flatNodes.map((node) => (
            <RoleNavRowV3
              key={node.role.id}
              node={node}
              canEdit={canEdit}
              isSelected={node.role.id === selectedRoleId}
              onSelect={() => onSelectRole(node.role.id)}
              onDelete={() => onDeleteRole(node.role.id)}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeNode ? (
            <div
              className="rounded-lg border border-[var(--teal)] shadow-md bg-white px-3 py-2 flex items-center gap-2 max-w-[220px]"
              aria-hidden
            >
              <span className="text-sm font-medium truncate">
                {activeNode.role.role_title || "Unnamed role"}
              </span>
              <span className="text-[10px] font-medium text-white bg-[var(--teal)] rounded px-1.5 py-0.5">
                L{proposedDepth}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  );
}

// ── Role nav row — Suppliers active state + MoreVertical delete menu ───────────

function RoleNavRowV3({
  node,
  canEdit,
  isSelected,
  onSelect,
  onDelete,
}: {
  node: FlatNode;
  canEdit: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.role.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="relative divide-y-0"
    >
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 flex items-start justify-between gap-2 transition-colors border-l-2 ${
          isSelected
            ? "bg-[var(--teal-tint-500)] border-l-[var(--teal)]"
            : "border-l-transparent hover:bg-[var(--neutral-cool-50)]"
        }`}
      >
        <div className="min-w-0 flex items-center gap-1.5 flex-1">
          {canEdit && (
            <span
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
              className="text-[var(--neutral-cool-400)] hover:text-[var(--neutral-cool-600)] cursor-grab active:cursor-grabbing touch-none shrink-0 flex items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={12} aria-hidden="true" />
            </span>
          )}
          {node.depth > 0 && (
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-end pr-0.5 text-[var(--neutral-cool-300)]"
              style={{ width: `${node.depth * INDENT_PX}px` }}
            >
              <ChevronRight size={10} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <span
              className={`block text-sm font-medium truncate ${
                isSelected ? "text-[var(--teal)]" : "text-[var(--foreground)]"
              }`}
            >
              {node.role.role_title || (
                <span className="italic text-[var(--dark-grey)]">Unnamed role</span>
              )}
            </span>
            <span className="text-[11px] text-[var(--dark-grey)] mt-0.5 block">
              ×{node.role.headcount}
            </span>
          </div>
        </div>
      </button>

      {canEdit && (
        <>
          <button
            type="button"
            aria-label="Role options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="absolute top-2.5 right-2 text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1 rounded hover:bg-white"
          >
            <MoreVertical size={14} aria-hidden="true" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-2 top-9 z-30 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px]"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-[var(--error)] hover:bg-[var(--error-bg-5)] flex items-center gap-2"
              >
                <Trash2 size={12} aria-hidden="true" />
                Delete role
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
