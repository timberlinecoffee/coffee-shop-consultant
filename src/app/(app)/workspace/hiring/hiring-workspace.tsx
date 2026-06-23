"use client";

// TIM-965: Hiring & Onboarding Suite — multi-tab workspace.
// Backed by row-level DB tables; no autosave JSONB blob — all mutations hit
// dedicated API routes directly with optimistic local state updates.

import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import {
  Users,
  Network,
  ClipboardList,
  UserCheck,
  Award,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  Check,
  ExternalLink,
  Copy,
  Pencil,
  FileText,
  ClipboardCheck,
  BookOpen,
  Globe,
  AlertTriangle,
  Download,
} from "lucide-react";
import { useCurrency } from "@/components/CurrencyProvider";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { ConflictNoticeBadge } from "@/components/cross-suite/ConflictNoticeBadge";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import type { ApprovedChange } from "@/hooks/useAIReviewModal";
import { TruncatedText } from "@/components/ui/TruncatedText";
import { SectionHelp } from "@/components/ui/section-help";
import type { PersonnelLine, PersonnelPayBasis } from "@/lib/financial-projection";
import { personnelLoadedMonthlyCents } from "@/lib/financial-projection";
import { formatHourlyWage, isBelowMinimumWage, type MinWageInfo } from "@/lib/wages/minimum-wage";
import { progressPct } from "@/lib/formatters";
import { usePaywallGuard } from "@/lib/use-paywall-guard";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import {
  type OrgRole,
  type InterviewCandidate, // V2: candidate tracking
  type InterviewQuestion,
  type InterviewScore, // V2: per-candidate scores
  type InterviewScorecard,
  type CompetencyFormTemplate,
  type OnboardingPlanInstance,
  type OnboardingTask,
  type StaffCompetency,
  type StaffFile, // V2: per-staff files
  type CompetencyEvaluation, // V2: per-staff evaluations
  type CandidateStatus, // V2: candidate status
  type OnboardingPhase,
  type HiringCountry,
  type PlanHiringSettings,
  type HiringRequirementSet,
  CANDIDATE_STATUS_CONFIG, // V2: candidate status config
  CANDIDATE_STATUS_ORDER, // V2: candidate status ordering
  PHASE_LABELS,
  PHASE_ORDER,
  DEFAULT_ONBOARDING_TASKS,
  HIRING_COUNTRY_OPTIONS,
} from "@/lib/hiring";

type Tab = "org" | "interview" | "onboarding" | "competency" | "requirements";

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
  // TIM-2518: resolved local minimum wage for the comp wage input.
  minimumWage?: MinWageInfo | null;
}

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Hiring PDF download button ─────────────────────────────────────────────────

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

  // Sync paywall state from hook
  const handleClick = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams(queryParams).toString();
      const url = `/api/pdf/${templateId}${qs ? `?${qs}` : ""}`;
      const res = await guardedFetch(url);
      if (!res) {
        setPaywalled(true);
        return;
      }
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

// ── Scorecard worksheet download button (TIM-1482) ────────────────────────────
// Inline candidate-name input before downloading the multi-column worksheet PDF.

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

// ── Status pill ───────────────────────────────────────────────────────────────

// V2: CandidatePill deferred (TIM-1419) — per-candidate tracking removed from V1.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CandidatePill({
  status,
  onClick,
}: {
  status: CandidateStatus;
  onClick?: () => void;
}) {
  const cfg = CANDIDATE_STATUS_CONFIG[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      {cfg.label}
    </button>
  );
}

// ── Shared input styles ───────────────────────────────────────────────────────

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
// TIM-1353 v2: 14px / bold / wider tracking — read as section headers.
const sectionLabelCls =
  "text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3 leading-tight";

// ── Org Structure tab ─────────────────────────────────────────────────────────

const PAY_BASIS_LABEL: Record<PersonnelPayBasis, string> = {
  annual: "Annual Salary",
  monthly: "Monthly Salary",
  hourly: "Hourly",
};

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

// TIM-1486: Org chart up top + consolidated role rows.
// CSS flexbox tree, 1px connector lines via absolute-positioned spans (no SVG, no library).

function OrgChartNode({
  role,
  childMap,
  onSelect,
}: {
  role: OrgRole;
  childMap: Map<string, OrgRole[]>;
  onSelect: (id: string) => void;
}) {
  const children = childMap.get(role.id) ?? [];
  const hasChildren = children.length > 0;
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => onSelect(role.id)}
        className="flex items-center gap-2 bg-white border border-[var(--border)] rounded-lg px-3 py-2 hover:border-[var(--teal)] focus-visible:outline-none focus-visible:border-[var(--teal)] transition-colors max-w-[220px]"
      >
        <Users size={13} className="text-[var(--teal)] shrink-0" />
        {role.role_title ? (
          <TruncatedText
            text={role.role_title}
            className="text-sm font-medium text-[var(--foreground)]"
          />
        ) : (
          <span className="text-sm font-medium text-[var(--dark-grey)]">Unnamed role</span>
        )}
        <span className="text-xs text-[var(--muted-foreground)] shrink-0">×{role.headcount}</span>
      </button>
      {hasChildren && (
        <>
          <span aria-hidden className="block w-px h-4 bg-[var(--border)]" />
          <div className="flex items-start gap-6">
            {children.map((c, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === children.length - 1;
              const isOnly = children.length === 1;
              return (
                <div key={c.id} className="relative pt-4 flex flex-col items-center">
                  {!isOnly && (
                    <span
                      aria-hidden
                      className="absolute top-0 h-px bg-[var(--border)]"
                      style={{ left: isFirst ? "50%" : 0, right: isLast ? "50%" : 0 }}
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-4 bg-[var(--border)]"
                  />
                  <OrgChartNode role={c} childMap={childMap} onSelect={onSelect} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Scales the tree to fit its container width with no internal scroll.
// Uses ResizeObserver to recompute when the container resizes.
function OrgChartFit({
  rootRoles,
  childMap,
  onSelect,
}: {
  rootRoles: OrgRole[];
  childMap: Map<string, OrgRole[]>;
  onSelect: (id: string) => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wrapH, setWrapH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    function fit() {
      const saved = inner!.style.transform;
      inner!.style.transform = "none";
      const nW = inner!.scrollWidth;
      const nH = inner!.scrollHeight;
      inner!.style.transform = saved;

      const avail = outer!.clientWidth;
      if (avail > 0 && nW > avail) {
        const s = avail / nW;
        setScale(s);
        setWrapH(nH * s);
      } else {
        setScale(1);
        setWrapH(null);
      }
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [rootRoles, childMap]);

  return (
    <div ref={outerRef} className="w-full overflow-hidden">
      <div
        style={wrapH !== null ? { height: `${wrapH}px`, overflow: "hidden" } : undefined}
      >
        <div
          ref={innerRef}
          style={{
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: "top left",
            display: "inline-block",
            minWidth: scale >= 1 ? "100%" : undefined,
          }}
        >
          <div className="flex items-start justify-center gap-10 py-2">
            {rootRoles.map((r) => (
              <OrgChartNode
                key={r.id}
                role={r}
                childMap={childMap}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrgTab({
  planId,
  canEdit,
  roles,
  onRolesChange,
  minimumWage,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  onRolesChange: (r: OrgRole[] | ((prev: OrgRole[]) => OrgRole[])) => void;
  minimumWage?: MinWageInfo | null;
}) {
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [highlightedRoleId, setHighlightedRoleId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());

  async function addRole() {
    const optimistic: OrgRole = {
      id: makeLocalId(),
      plan_id: planId,
      role_title: "",
      headcount: 1,
      start_date: null,
      monthly_cost_cents: null,
      notes: null,
      parent_role_id: null,
      jd_template_id: null,
    };
    onRolesChange((prev) => [...prev, optimistic]);
    setExpandedRoleId(optimistic.id);

    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_title: "", headcount: 1 }),
    });
    if (res.ok) {
      const created = (await res.json()) as OrgRole;
      onRolesChange((prev) => prev.map((r) => (r.id === optimistic.id ? created : r)));
      setExpandedRoleId(created.id);
    } else {
      onRolesChange((prev) => prev.filter((r) => r.id !== optimistic.id));
    }
  }

  async function updateRole(id: string, patch: Partial<OrgRole>) {
    onRolesChange((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteRole(id: string) {
    const snapshot = roles;
    onRolesChange((prev) => prev.filter((r) => r.id !== id));
    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}&id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) onRolesChange(snapshot);
  }

  const childMap = useMemo(() => {
    const m = new Map<string, OrgRole[]>();
    for (const r of roles) {
      if (r.parent_role_id) {
        const arr = m.get(r.parent_role_id) ?? [];
        arr.push(r);
        m.set(r.parent_role_id, arr);
      }
    }
    return m;
  }, [roles]);

  const rootRoles = useMemo(() => roles.filter((r) => !r.parent_role_id), [roles]);

  // Tree order: roots first, then each root's subtree (depth-first, creation order).
  const orderedRoles = useMemo(() => {
    const out: OrgRole[] = [];
    const visited = new Set<string>();
    const walk = (r: OrgRole) => {
      if (visited.has(r.id)) return;
      visited.add(r.id);
      out.push(r);
      for (const c of childMap.get(r.id) ?? []) walk(c);
    };
    for (const r of rootRoles) walk(r);
    // Orphans (parent_role_id set but parent missing) fall to the end.
    for (const r of roles) if (!visited.has(r.id)) out.push(r);
    return out;
  }, [roles, rootRoles, childMap]);

  // Map of id → parent title for the collapsed row header.
  const parentTitleById = useMemo(() => {
    const byId = new Map(roles.map((r) => [r.id, r] as const));
    const m = new Map<string, string>();
    for (const r of roles) {
      if (r.parent_role_id) {
        const p = byId.get(r.parent_role_id);
        if (p) m.set(r.id, p.role_title || "Unnamed role");
      }
    }
    return m;
  }, [roles]);

  function handleChartSelect(id: string) {
    setExpandedRoleId(id);
    setHighlightedRoleId(id);
    // Defer scroll to next frame so the row is expanded first.
    requestAnimationFrame(() => {
      const node = rowRefs.current.get(id);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => {
      setHighlightedRoleId((curr) => (curr === id ? null : curr));
    }, 600);
  }

  return (
    <div className="space-y-6">
      {/* Org chart (top) */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Org Chart</p>
            <SectionHelp title="Org Chart">Set &quot;Reports to&quot; on each role to build the hierarchy. Click a node to open its row.</SectionHelp>
          </div>
        </div>
        <div className="px-5 py-6">
          {roles.length === 0 ? (
            <p className="text-sm text-[var(--dark-grey)] text-center">
              Add your first role to see your org chart here.
            </p>
          ) : rootRoles.length === 0 ? (
            <p className="text-sm text-[var(--dark-grey)]">
              No top-level roles. Set &quot;Reports to&quot; on roles to build the chart.
            </p>
          ) : (
            <OrgChartFit
              rootRoles={rootRoles}
              childMap={childMap}
              onSelect={handleChartSelect}
            />
          )}
        </div>
      </div>

      {/* Role rows (in tree order) */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">Roles</p>
            <SectionHelp title="Roles">Define every role you plan to hire for.</SectionHelp>
          </div>
          {canEdit && (
            <WorkspaceActionButton
              variant="primary"
              onClick={addRole}
            >
              <Plus size={WORKSPACE_ACTION_ICON_SIZE} />
              Add role
            </WorkspaceActionButton>
          )}
        </div>

        {orderedRoles.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[var(--dark-grey)]">No roles yet. Add your first role above.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neutral-cool-100)]">
            {orderedRoles.map((role) => (
              <RoleRow
                key={role.id}
                planId={planId}
                role={role}
                roles={roles}
                canEdit={canEdit}
                expanded={expandedRoleId === role.id}
                highlighted={highlightedRoleId === role.id}
                parentTitle={parentTitleById.get(role.id) ?? null}
                onToggleExpand={() =>
                  setExpandedRoleId(expandedRoleId === role.id ? null : role.id)
                }
                onUpdate={(patch) => updateRole(role.id, patch)}
                onDelete={() => deleteRole(role.id)}
                registerRef={(node) => {
                  if (node) rowRefs.current.set(role.id, node);
                  else rowRefs.current.delete(role.id);
                }}
                minimumWage={minimumWage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleRow({
  planId,
  role,
  roles,
  canEdit,
  expanded,
  highlighted,
  parentTitle,
  onToggleExpand,
  onUpdate,
  onDelete,
  registerRef,
  minimumWage,
}: {
  planId: string;
  role: OrgRole;
  roles: OrgRole[];
  canEdit: boolean;
  expanded: boolean;
  highlighted: boolean;
  parentTitle: string | null;
  onToggleExpand: () => void;
  onUpdate: (patch: Partial<OrgRole>) => void;
  onDelete: () => void;
  registerRef: (node: HTMLDivElement | null) => void;
  minimumWage?: MinWageInfo | null;
}) {
  const [jdFields, setJdFields] = useState<JdFields | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdLoaded, setJdLoaded] = useState(false);
  const [jdDirty, setJdDirty] = useState(false);

  // Scorecard + competency form data (formerly RoleHubPanel)
  const [hubScorecards, setHubScorecards] = useState<InterviewScorecard[]>([]);
  const [hubCompForms, setHubCompForms] = useState<CompetencyFormTemplate[]>([]);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubLoaded, setHubLoaded] = useState(false);
  const [renamingScorecard, setRenamingScorecard] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingForm, setRenamingForm] = useState<string | null>(null);
  const [renameFormValue, setRenameFormValue] = useState("");

  async function loadHub() {
    setHubLoading(true);
    const [sc, cf] = await Promise.all([
      fetch(`/api/workspaces/hiring/scorecards?role_id=${role.id}`).then((r) => r.json()),
      fetch(`/api/workspaces/hiring/competency-forms?role_id=${role.id}`).then((r) => r.json()),
    ]);
    setHubScorecards(Array.isArray(sc) ? sc : []);
    setHubCompForms(Array.isArray(cf) ? cf : []);
    setHubLoading(false);
    setHubLoaded(true);
  }

  async function addScorecard() {
    const res = await fetch("/api/workspaces/hiring/scorecards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "New Scorecard", order_index: hubScorecards.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as InterviewScorecard;
      setHubScorecards((prev) => [...prev, created]);
      setRenamingScorecard(created.id);
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
      setHubScorecards((prev) => [...prev, copy]);
    }
  }

  async function saveRenameScorecard(id: string) {
    const name = renameValue.trim() || "Scorecard";
    setHubScorecards((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setRenamingScorecard(null);
    await fetch("/api/workspaces/hiring/scorecards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteScorecard(id: string) {
    setHubScorecards((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/workspaces/hiring/scorecards?id=${id}`, { method: "DELETE" });
  }

  async function addCompForm() {
    const res = await fetch("/api/workspaces/hiring/competency-forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "General", order_index: hubCompForms.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as CompetencyFormTemplate;
      setHubCompForms((prev) => [...prev, created]);
      setRenamingForm(created.id);
      setRenameFormValue(created.name);
    }
  }

  async function saveRenameForm(id: string) {
    const name = renameFormValue.trim() || "General";
    setHubCompForms((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    setRenamingForm(null);
    await fetch("/api/workspaces/hiring/competency-forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteCompForm(id: string) {
    setHubCompForms((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/workspaces/hiring/competency-forms?id=${id}`, { method: "DELETE" });
  }

  // Comp framework state (TIM-1303)
  const [compLine, setCompLine] = useState<PersonnelLine | null>(null);
  const [compLoading, setCompLoading] = useState(false);
  const [compDirty, setCompDirty] = useState(false);
  const [compSaving, setCompSaving] = useState(false);

  // Draft edits before save
  const [compPayBasis, setCompPayBasis] = useState<PersonnelPayBasis>("monthly");
  const [compPayAmount, setCompPayAmount] = useState<number | "">(0);
  const [compHoursPerWeek, setCompHoursPerWeek] = useState<number | "">(30);
  const [compBenefitsPct, setCompBenefitsPct] = useState<number | "">(0);

  // TIM-2518: sub-minimum wage check on the comp draft. Convert salary inputs
  // to an hourly equivalent so the floor applies uniformly to all pay bases.
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

  async function loadJd() {
    setJdLoading(true);
    const defaults: JdFields = {
      title: role.role_title || "",
      summary: "",
      responsibilities: "",
      requirements: "",
      comp: "",
    };
    setJdFields(defaults);
    if (role.jd_template_id) {
      try {
        const res = await fetch(
          `/api/workspaces/hiring/roles?planId=${planId}&jd_id=${role.jd_template_id}`
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
      } catch { /* silently use defaults */ }
    }
    setJdLoading(false);
    setJdLoaded(true);
  }

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

  // Lazy-load all expanded-section data on first expand (TIM-1486)
  useEffect(() => {
    if (!expanded) return;
    if (!jdLoaded && !jdLoading) loadJd();
    if (!hubLoaded && !hubLoading) loadHub();
    if (role.id.startsWith("local_")) return;
    setCompLoading(true);
    fetch(`/api/workspaces/financials/role-comp?org_role_id=${encodeURIComponent(role.id)}`)
      .then((r) => r.ok ? r.json() : { line: null })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, role.id]);

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

  // Live loaded cost preview (from entered fields, not just saved line)
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

  const parentOptions = roles.filter((r) => r.id !== role.id);

  return (
    <>
    <div
      ref={registerRef}
      className={`transition-shadow ${highlighted ? "ring-2 ring-[var(--teal)] ring-inset" : ""}`}
    >
      {/* Role header row — single expand chevron */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--background)] transition-colors"
      >
        <div className="flex-1 min-w-0">
          {role.role_title ? (
            <TruncatedText
              text={role.role_title}
              className="text-sm font-medium text-[var(--foreground)] block"
            />
          ) : (
            <span className="text-sm font-medium text-[var(--dark-grey)] block">
              Unnamed role
            </span>
          )}
          <span className="text-xs text-[var(--muted-foreground)]">
            {role.headcount} headcount
            {role.monthly_cost_cents
              ? ` · ${formatMinor(role.monthly_cost_cents)}/mo`
              : ""}
            {parentTitle ? ` · Reports to ${parentTitle}` : ""}
          </span>
        </div>
        <span className="text-[var(--dark-grey)] p-1 shrink-0" aria-hidden>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
        {canEdit && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }
            }}
            title="Delete role"
            className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1 shrink-0 cursor-pointer"
          >
            <Trash2 size={13} />
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--neutral-cool-150)] bg-[var(--background)] divide-y divide-[var(--neutral-cool-100)]">
          {/* 1) Details */}
          <section className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-[var(--teal)]" />
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Details</p>
            </div>
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
                  onChange={(e) =>
                    onUpdate({ headcount: parseInt(e.target.value, 10) || 1 })
                  }
                  disabled={!canEdit}
                />
              </div>
              <div>
                <label className={labelCls}>Reports to</label>
                <select
                  className={inputCls}
                  value={role.parent_role_id ?? ""}
                  onChange={(e) =>
                    onUpdate({ parent_role_id: e.target.value || null })
                  }
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
          </section>

          {/* 2) Compensation */}
          <section className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award size={14} className="text-[var(--teal)]" />
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Compensation</p>
              </div>
              {compLoading && (
                <span className="text-[10px] text-[var(--dark-grey)]">Loading…</span>
              )}
              {!compLoading && compLine === null && !compDirty && (
                <span className="text-[10px] text-[var(--dark-grey)]">Not set. Edit fields to link.</span>
              )}
              {compPreviewCents !== null && (
                <span className="text-xs font-semibold text-[var(--teal)]">
                  Loaded: {formatMinor(compPreviewCents)}/mo
                </span>
              )}
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
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--dark-grey)] pointer-events-none">$</span>
                  <input
                    className={inputCls + " pl-5"}
                    type="number"
                    min={0}
                    step={compPayBasis === "hourly" ? 0.25 : 100}
                    value={compPayAmount}
                    disabled={!canEdit || compLoading}
                    onChange={(e) => {
                      setCompPayAmount(parseFloat(e.target.value) || "");
                      setCompDirty(true);
                    }}
                  />
                </div>
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
                      setCompHoursPerWeek(parseFloat(e.target.value) || "");
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
                      setCompBenefitsPct(parseFloat(e.target.value) || "");
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
            {/* TIM-2518: sub-minimum wage warning for the comp draft. */}
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

          {/* 3) Job Description */}
          <section className="px-4 py-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} className="text-[var(--teal)]" />
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Job Description</p>
            </div>
            {jdLoading ? (
              <p className="text-sm text-[var(--dark-grey)]" role="status">Loading…</p>
            ) : (
              <>
                <div className="space-y-4">
                  {JD_FIELD_DEFS.map(({ key, label, multiline }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className={labelCls}>{label}</label>
                      </div>
                      {multiline ? (
                        <textarea
                          rows={4}
                          className={inputCls + " resize-none"}
                          value={jdFields?.[key] ?? ""}
                          onChange={(e) => {
                            setJdFields((prev) => prev ? { ...prev, [key]: e.target.value } : prev);
                            setJdDirty(true);
                          }}
                          disabled={!canEdit}
                        />
                      ) : (
                        <input
                          className={inputCls}
                          value={jdFields?.[key] ?? ""}
                          onChange={(e) => {
                            setJdFields((prev) => prev ? { ...prev, [key]: e.target.value } : prev);
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
          </section>

          {/* 4) Scorecards */}
          <section className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck size={14} className="text-[var(--teal)]" />
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Scorecards</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={addScorecard}
                  className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:underline"
                >
                  <Plus size={12} /> New
                </button>
              )}
            </div>
            {hubLoading ? (
              <p className="text-xs text-[var(--dark-grey)]">Loading…</p>
            ) : hubScorecards.length === 0 ? (
              <p className="text-xs text-[var(--dark-grey)]">No scorecards yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {hubScorecards.map((sc) => (
                  <div key={sc.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-white">
                    {renamingScorecard === sc.id ? (
                      <>
                        <input
                          autoFocus
                          className="flex-1 text-sm border border-[var(--border-medium)] rounded px-2 py-1 focus-visible:outline-none focus:border-[var(--teal)]"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRenameScorecard(sc.id);
                            if (e.key === "Escape") setRenamingScorecard(null);
                          }}
                        />
                        <button type="button" onClick={() => saveRenameScorecard(sc.id)} className="text-[var(--teal)] p-1">
                          <Check size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-[var(--foreground)] truncate">
                          {sc.name}
                          {sc.is_default && (
                            <span className="ml-2 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-bg-50)] px-1.5 py-0.5 rounded-full">Default</span>
                          )}
                        </span>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              title="Rename"
                              onClick={() => { setRenamingScorecard(sc.id); setRenameValue(sc.name); }}
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
          </section>

          {/* 5) Competency Forms */}
          <section className="px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-[var(--teal)]" />
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Competency Forms</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={addCompForm}
                  className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:underline"
                >
                  <Plus size={12} /> New
                </button>
              )}
            </div>
            {hubLoading ? (
              <p className="text-xs text-[var(--dark-grey)]">Loading…</p>
            ) : hubCompForms.length === 0 ? (
              <p className="text-xs text-[var(--dark-grey)]">No competency form template yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {hubCompForms.map((cf) => (
                  <div key={cf.id} className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-white">
                    {renamingForm === cf.id ? (
                      <>
                        <input
                          autoFocus
                          className="flex-1 text-sm border border-[var(--border-medium)] rounded px-2 py-1 focus-visible:outline-none focus:border-[var(--teal)]"
                          value={renameFormValue}
                          onChange={(e) => setRenameFormValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRenameForm(cf.id);
                            if (e.key === "Escape") setRenamingForm(null);
                          }}
                        />
                        <button type="button" onClick={() => saveRenameForm(cf.id)} className="text-[var(--teal)] p-1">
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
                              onClick={() => { setRenamingForm(cf.id); setRenameFormValue(cf.name); }}
                              className="text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => deleteCompForm(cf.id)}
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
        </div>
      )}
    </div>
    </>
  );
}

// ── Interview Scorecard tab ───────────────────────────────────────────────────
// V1: template-only view. Per-candidate scorecard fill deferred to V2 (TIM-1419).
// V2 will restore: candidate list, per-candidate score entry, weighted-score total.

function InterviewTab({
  planId,
  canEdit,
  roles,
  questions,
  onQuestionsChange,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  questions: InterviewQuestion[];
  onQuestionsChange: (q: InterviewQuestion[]) => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    roles[0]?.id ?? null
  );
  const [roleScorecards, setRoleScorecards] = useState<InterviewScorecard[]>([]);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string | null>(null);
  const [loadingScorecards, setLoadingScorecards] = useState(false);

  // Load scorecards when selected role changes.
  useEffect(() => {
    if (!selectedRoleId) {
      setRoleScorecards([]);
      setSelectedScorecardId(null);
      return;
    }
    setLoadingScorecards(true);
    fetch(`/api/workspaces/hiring/scorecards?role_id=${selectedRoleId}`)
      .then((r) => r.json())
      .then((sc: unknown) => {
        const list = Array.isArray(sc) ? (sc as InterviewScorecard[]) : [];
        setRoleScorecards(list);
        const def = list.find((s) => s.is_default) ?? list[0] ?? null;
        setSelectedScorecardId(def?.id ?? null);
      })
      .finally(() => setLoadingScorecards(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId]);

  // Template questions for the selected scorecard / role.
  const roleQuestions = questions.filter((q) => {
    if (selectedScorecardId) return q.scorecard_id === selectedScorecardId;
    return (q.role_id === selectedRoleId || q.role_id === null) && !q.scorecard_id;
  });

  async function addQuestion() {
    const optimistic: InterviewQuestion = {
      id: makeLocalId(),
      plan_id: planId,
      role_id: selectedRoleId,
      scorecard_id: selectedScorecardId,
      prompt: "",
      weight: 3,
      order_index: questions.length,
    };
    onQuestionsChange([...questions, optimistic]);
    const res = await fetch(`/api/workspaces/hiring/questions?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        role_id: selectedRoleId,
        scorecard_id: selectedScorecardId,
        prompt: "",
        weight: 3,
        order_index: questions.length,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as InterviewQuestion;
      onQuestionsChange(questions.map((q) => (q.id === optimistic.id ? created : q)));
    } else {
      onQuestionsChange(questions.filter((q) => q.id !== optimistic.id));
    }
  }

  async function updateQuestion(id: string, patch: Partial<InterviewQuestion>) {
    onQuestionsChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    await fetch(`/api/workspaces/hiring/questions?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteQuestion(id: string) {
    const prev = questions;
    onQuestionsChange(questions.filter((q) => q.id !== id));
    const res = await fetch(`/api/workspaces/hiring/questions?planId=${planId}&id=${id}`, { method: "DELETE" });
    if (!res.ok) onQuestionsChange(prev);
  }

  return (
    <div className="space-y-4">
      {/* Role + scorecard selector */}
      <div className="rounded-xl border border-[var(--border)] bg-white px-5 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Role</label>
            <select
              className={inputCls}
              value={selectedRoleId ?? ""}
              onChange={(e) => setSelectedRoleId(e.target.value || null)}
              disabled={roles.length === 0}
            >
              {roles.length === 0 && <option value="">No roles yet</option>}
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.role_title || "Unnamed role"}
                </option>
              ))}
            </select>
          </div>
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
            </div>
          )}
        </div>
        {selectedRoleId && (
          <p className="text-[10px] text-[var(--muted-foreground)] mt-2">
            Manage scorecard variants (new / rename / duplicate) from the Role Hub on the Org Structure tab.
          </p>
        )}
      </div>

      {/* Question template */}
      {selectedRoleId && (
        <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">Interview Questions</p>
                <SectionHelp title="Interview Questions">Template questions and weights for this scorecard.</SectionHelp>
              </div>
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
      )}

      {!selectedRoleId && roles.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-medium)] py-16 text-center">
          <p className="text-sm text-[var(--dark-grey)]">
            Add roles on the Org Structure tab first, then build their scorecard templates here.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Onboarding Planner tab ────────────────────────────────────────────────────

function computeDueDateLabel(startDate: string | null, dueOffsetDays: number | null): string | null {
  if (!startDate || dueOffsetDays === null) return null;
  const d = new Date(`${startDate}T12:00:00`);
  d.setDate(d.getDate() + dueOffsetDays);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OnboardingTab({
  planId,
  canEdit,
  roles,
  instances,
  tasks,
  onInstancesChange,
  onTasksChange,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  instances: OnboardingPlanInstance[];
  tasks: OnboardingTask[];
  onInstancesChange: (i: OnboardingPlanInstance[]) => void;
  onTasksChange: (t: OnboardingTask[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    instances[0]?.id ?? null
  );
  const [showNewForm, setShowNewForm] = useState(false);
  const [newHireName, setNewHireName] = useState("");
  const [newRoleId, setNewRoleId] = useState<string>("");
  const [newStartDate, setNewStartDate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<OnboardingPhase>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const selectedInstance = instances.find((i) => i.id === selectedId) ?? null;
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

    const res = await fetch(
      `/api/workspaces/hiring/onboarding?planId=${planId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          hire_name: newHireName,
          role_id: newRoleId || null,
          start_date: newStartDate || null,
        }),
      }
    );

    if (res.ok) {
      const created = (await res.json()) as OnboardingPlanInstance;
      onInstancesChange([...instances, created]);
      setSelectedId(created.id);

      // Seed default tasks
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

      const seedRes = await fetch(
        `/api/workspaces/hiring/onboarding/tasks?planId=${planId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: taskPayloads }),
        }
      );
      if (seedRes.ok) {
        const seeded = (await seedRes.json()) as OnboardingTask[];
        onTasksChange([...tasks, ...seeded]);
      }
    }

    setNewHireName("");
    setNewRoleId("");
    setNewStartDate("");
    setShowNewForm(false);
    setCreating(false);
  }

  async function toggleTask(task: OnboardingTask) {
    const completed_at = task.completed_at ? null : new Date().toISOString();
    onTasksChange(
      tasks.map((t) => (t.id === task.id ? { ...t, completed_at } : t))
    );
    await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, completed_at }),
    });
  }

  async function updateTask(id: string, patch: Partial<OnboardingTask>) {
    onTasksChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    await fetch(`/api/workspaces/hiring/onboarding/tasks?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteTask(id: string) {
    const prev = tasks;
    onTasksChange(tasks.filter((t) => t.id !== id));
    const res = await fetch(
      `/api/workspaces/hiring/onboarding/tasks?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onTasksChange(prev);
  }

  async function addTask(phase: OnboardingPhase) {
    const phaseTasks = instanceTasks.filter((t) => t.phase === phase);
    const optimistic: OnboardingTask = {
      id: makeLocalId(),
      instance_id: selectedId!,
      phase,
      task: "",
      detail: null,
      due_offset_days: null,
      completed_at: null,
      notes: null,
      order_index: phaseTasks.length,
    };
    onTasksChange([...tasks, optimistic]);

    const res = await fetch(
      `/api/workspaces/hiring/onboarding/tasks?planId=${planId}`,
      {
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
      }
    );
    if (res.ok) {
      const created = (await res.json()) as OnboardingTask[];
      onTasksChange([
        ...tasks.filter((t) => t.id !== optimistic.id),
        ...created,
      ]);
    } else {
      onTasksChange(tasks.filter((t) => t.id !== optimistic.id));
    }
  }

  async function deleteInstance(id: string) {
    const prev = instances;
    onInstancesChange(instances.filter((i) => i.id !== id));
    onTasksChange(tasks.filter((t) => t.instance_id !== id));
    if (selectedId === id) {
      setSelectedId(instances.find((i) => i.id !== id)?.id ?? null);
    }
    const res = await fetch(
      `/api/workspaces/hiring/onboarding?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onInstancesChange(prev);
  }

  return (
    <div className="space-y-5">
      {/* Instance list */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
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
          <div className="px-5 py-4 border-b border-[var(--border)] bg-[var(--background)] space-y-3">
            <p className={sectionLabelCls}>New onboarding plan</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <label className={labelCls}>Role</label>
                <select
                  className={inputCls}
                  value={newRoleId}
                  onChange={(e) => setNewRoleId(e.target.value)}
                >
                  <option value="">— Select role —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.role_title || "Unnamed role"}
                    </option>
                  ))}
                </select>
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

        {instances.length === 0 && !showNewForm ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[var(--dark-grey)]">
              No onboarding plans yet. Create one above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neutral-cool-100)]">
            {instances.map((inst) => {
              const instTasks = tasks.filter((t) => t.instance_id === inst.id);
              const completed = instTasks.filter((t) => t.completed_at).length;
              const total = instTasks.length;
              const pct = progressPct(completed, total);

              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedId(inst.id)}
                  className={`w-full text-left px-5 py-3 flex items-center gap-4 transition-colors ${
                    selectedId === inst.id ? "bg-[var(--teal-tint-500)]" : "hover:bg-[var(--background)]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {inst.hire_name}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {roles.find((r) => r.id === inst.role_id)?.role_title ?? "No role"}
                      {inst.start_date
                        ? ` · Starts ${new Date(`${inst.start_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-[var(--neutral-cool-200)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--teal)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
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

      {/* Task phases */}
      {selectedInstance && (
        <div className="space-y-4">
          {PHASE_ORDER.map((phase) => {
            const phaseTasks = instanceTasks
              .filter((t) => t.phase === phase)
              .sort((a, b) => a.order_index - b.order_index);
            const isCollapsed = collapsedPhases.has(phase);
            const doneCount = phaseTasks.filter((t) => t.completed_at).length;

            return (
              <div
                key={phase}
                className="rounded-xl border border-[var(--border)] bg-white overflow-hidden"
              >
                {/* Phase header — clickable to collapse/expand */}
                <button
                  type="button"
                  onClick={() => togglePhase(phase)}
                  className="w-full px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)] hover:bg-[var(--gray-250)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={14} className="text-[var(--teal)]" />
                    ) : (
                      <ChevronDown size={14} className="text-[var(--teal)]" />
                    )}
                    <span className="text-xs font-semibold text-[var(--teal)]">
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--dark-grey)]">
                    {doneCount}/{phaseTasks.length} done
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {phaseTasks.length === 0 ? (
                      <div className="px-5 py-3">
                        <p className="text-xs text-[var(--dark-grey)]">No tasks in this phase.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--neutral-cool-100)]">
                        {phaseTasks.map((t) => {
                          const isExpanded = expandedTaskId === t.id;
                          const dueDate = computeDueDateLabel(selectedInstance.start_date, t.due_offset_days);

                          return (
                            <div key={t.id} className="px-5 py-3 space-y-2">
                              {/* Task row */}
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
                                  {t.completed_at && (
                                    <Check size={10} className="text-white" />
                                  )}
                                </button>

                                <div className="flex-1 min-w-[140px]">
                                  <input
                                    className={`w-full text-sm bg-transparent border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none py-0.5 disabled:hover:border-transparent ${
                                      t.completed_at
                                        ? "line-through text-[var(--dark-grey)]"
                                        : "text-[var(--foreground)]"
                                    }`}
                                    value={t.task}
                                    onChange={(e) =>
                                      updateTask(t.id, { task: e.target.value })
                                    }
                                    placeholder="Task description..."
                                    disabled={!canEdit}
                                  />
                                </div>

                                {/* Due day input + computed calendar date */}
                                <div className="flex items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                                  <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                    <span className="whitespace-nowrap">Due: Day</span>
                                    <input
                                      className="w-12 text-xs border border-[var(--border-medium)] rounded px-1.5 py-0.5 text-[var(--foreground)] text-center focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)]"
                                      type="number"
                                      value={t.due_offset_days ?? ""}
                                      onChange={(e) =>
                                        updateTask(t.id, {
                                          due_offset_days: e.target.value
                                            ? parseInt(e.target.value, 10)
                                            : null,
                                        })
                                      }
                                      placeholder="—"
                                      disabled={!canEdit}
                                    />
                                  </div>
                                  {dueDate && (
                                    <span className="text-[10px] text-[var(--dark-grey)] whitespace-nowrap">
                                      {dueDate}
                                    </span>
                                  )}
                                </div>

                                {/* Expand/collapse detail + delete */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedTaskId(isExpanded ? null : t.id)
                                    }
                                    className="text-[var(--dark-grey)] hover:text-[var(--teal)] p-0.5"
                                    title={isExpanded ? "Hide detail" : "Show detail"}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp size={13} />
                                    ) : (
                                      <ChevronDown size={13} />
                                    )}
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

                              {/* Drill-down detail panel */}
                              {isExpanded && (
                                <div className="ml-7 rounded-lg bg-[var(--warm-1050)] border border-[var(--neutral-cool-200)] p-3 space-y-2">
                                  {canEdit ? (
                                    <textarea
                                      className="w-full text-xs text-[var(--foreground)] bg-transparent resize-none focus-visible:outline-none placeholder-[var(--neutral-cool-400)]"
                                      rows={3}
                                      value={t.detail ?? ""}
                                      onChange={(e) =>
                                        updateTask(t.id, { detail: e.target.value || null })
                                      }
                                      placeholder="Add detail, instructions, or context for this task..."
                                    />
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
                      <div className="px-5 py-2 border-t border-[var(--neutral-cool-100)]">
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
    </div>
  );
}

// ── Competency Evaluation tab ─────────────────────────────────────────────────

function CompetencyTab({
  planId,
  canEdit,
  roles,
  competencies,
  staffFiles,
  evaluations,
  onCompetenciesChange,
  onStaffFilesChange,
  onEvaluationsChange,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  competencies: StaffCompetency[];
  staffFiles: StaffFile[];
  evaluations: CompetencyEvaluation[];
  onCompetenciesChange: (c: StaffCompetency[]) => void;
  onStaffFilesChange: (s: StaffFile[]) => void;
  onEvaluationsChange: (e: CompetencyEvaluation[]) => void;
}) {
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(
    staffFiles[0]?.id ?? null
  );

  const selectedStaff = staffFiles.find((s) => s.id === selectedStaffId) ?? null;

  async function addCompetency() {
    const optimistic: StaffCompetency = {
      id: makeLocalId(),
      plan_id: planId,
      skill: "",
      rubric: "",
      required_for_role: null,
      form_template_id: null,
      weight: 1,
      order_index: competencies.length,
    };
    onCompetenciesChange([...competencies, optimistic]);

    const res = await fetch(
      `/api/workspaces/hiring/competencies?planId=${planId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          skill: "",
          rubric: "",
          weight: 1,
          order_index: competencies.length,
        }),
      }
    );
    if (res.ok) {
      const created = (await res.json()) as StaffCompetency;
      onCompetenciesChange(competencies.map((c) => (c.id === optimistic.id ? created : c)));
    } else {
      onCompetenciesChange(competencies.filter((c) => c.id !== optimistic.id));
    }
  }

  async function updateCompetency(id: string, patch: Partial<StaffCompetency>) {
    onCompetenciesChange(competencies.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/workspaces/hiring/competencies?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteCompetency(id: string) {
    const prev = competencies;
    onCompetenciesChange(competencies.filter((c) => c.id !== id));
    const res = await fetch(
      `/api/workspaces/hiring/competencies?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onCompetenciesChange(prev);
  }

  async function addStaffFile() {
    const optimistic: StaffFile = {
      id: makeLocalId(),
      plan_id: planId,
      name: "",
      hire_date: null,
      role_id: null,
      notes: null,
    };
    onStaffFilesChange([...staffFiles, optimistic]);
    setSelectedStaffId(optimistic.id);

    const res = await fetch(`/api/workspaces/hiring/staff?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, name: "" }),
    });
    if (res.ok) {
      const created = (await res.json()) as StaffFile;
      onStaffFilesChange(staffFiles.map((s) => (s.id === optimistic.id ? created : s)));
      setSelectedStaffId(created.id);
    } else {
      onStaffFilesChange(staffFiles.filter((s) => s.id !== optimistic.id));
    }
  }

  async function updateStaffFile(id: string, patch: Partial<StaffFile>) {
    onStaffFilesChange(staffFiles.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await fetch(`/api/workspaces/hiring/staff?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteStaffFile(id: string) {
    const prev = staffFiles;
    onStaffFilesChange(staffFiles.filter((s) => s.id !== id));
    onEvaluationsChange(evaluations.filter((e) => e.staff_file_id !== id));
    if (selectedStaffId === id) {
      setSelectedStaffId(staffFiles.find((s) => s.id !== id)?.id ?? null);
    }
    const res = await fetch(
      `/api/workspaces/hiring/staff?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onStaffFilesChange(prev);
  }

  async function upsertEvaluation(
    staffFileId: string,
    competencyId: string,
    score: number,
    notes: string | null
  ) {
    const existing = evaluations.find(
      (e) =>
        e.staff_file_id === staffFileId && e.competency_id === competencyId
    );
    const now = new Date().toISOString();
    const updated: CompetencyEvaluation = existing
      ? { ...existing, score, notes, evaluated_at: now }
      : {
          id: makeLocalId(),
          staff_file_id: staffFileId,
          competency_id: competencyId,
          score,
          notes,
          evaluated_at: now,
        };
    onEvaluationsChange(
      existing
        ? evaluations.map((e) =>
            e.staff_file_id === staffFileId && e.competency_id === competencyId
              ? updated
              : e
          )
        : [...evaluations, updated]
    );
    await fetch(`/api/workspaces/hiring/evaluations?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        staff_file_id: staffFileId,
        competency_id: competencyId,
        score,
        notes,
      }),
    });
  }

  // Weighted average for selected staff
  const weightedAvg = useMemo(() => {
    if (!selectedStaff || competencies.length === 0) return null;
    let weightedSum = 0;
    let totalWeight = 0;
    for (const comp of competencies) {
      const ev = evaluations.find(
        (e) =>
          e.staff_file_id === selectedStaff.id &&
          e.competency_id === comp.id
      );
      if (ev && ev.score > 0) {
        weightedSum += ev.score * comp.weight;
        totalWeight += comp.weight * 5;
      }
    }
    if (totalWeight === 0) return null;
    return (weightedSum / totalWeight) * 100;
  }, [selectedStaff, competencies, evaluations]);

  return (
    <div className="space-y-5">
      {/* Competency template */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">Competency Framework</p>
              <SectionHelp title="Competency Framework">Shared skills and rubric for all staff evaluations.</SectionHelp>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addCompetency}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)]"
            >
              <Plus size={13} />
              Add skill
            </button>
          )}
        </div>

        {competencies.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--dark-grey)]">
              No competencies defined. Add skills above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--neutral-cool-100)]">
            {competencies
              .sort((a, b) => a.order_index - b.order_index)
              .map((comp) => (
                <div key={comp.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      className={inputCls}
                      value={comp.skill}
                      onChange={(e) =>
                        updateCompetency(comp.id, { skill: e.target.value })
                      }
                      placeholder="Skill name"
                      disabled={!canEdit}
                    />
                    <input
                      className={`${inputCls} sm:col-span-1`}
                      value={comp.rubric}
                      onChange={(e) =>
                        updateCompetency(comp.id, { rubric: e.target.value })
                      }
                      placeholder="Rubric (what score means)"
                      disabled={!canEdit}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputCls} w-20`}
                        value={comp.required_for_role ?? ""}
                        onChange={(e) =>
                          updateCompetency(comp.id, {
                            required_for_role: e.target.value || null,
                          })
                        }
                        placeholder="Role req."
                        disabled={!canEdit}
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[var(--muted-foreground)]">Wt</span>
                        <select
                          className="text-xs border border-[var(--border-medium)] rounded px-1 py-1.5 text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)]"
                          value={comp.weight}
                          onChange={(e) =>
                            updateCompetency(comp.id, {
                              weight: parseInt(e.target.value, 10),
                            })
                          }
                          disabled={!canEdit}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteCompetency(comp.id)}
                      className="text-[var(--dark-grey)] hover:text-[var(--error)] p-1 mt-1 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* V2: per-staff files and competency evaluation removed from V1 (TIM-1419).
           DB + API preserved. Restore in Operations Management Suite V2. */}
    </div>
  );
}

// ── Requirements tab (TIM-1300) ───────────────────────────────────────────────

function RequirementsTab({
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

  // Group requirement sets by category.
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

      // Fetch requirement sets for the new effective country.
      const effective = updated.effective_country;
      if (effective) {
        setLoadingReqs(true);
        const rRes = await fetch(`/api/workspaces/hiring/requirement-sets?country=${effective}`);
        if (rRes.ok) setRequirementSets(await rRes.json());
        setLoadingReqs(false);
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
      {/* Country selector */}
      <div className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">Hiring Jurisdiction</p>
                <SectionHelp title="Hiring Jurisdiction">
                  {settings.hiring_country
                    ? "Override set. Requirement set sourced from your selection."
                    : "Auto-detected from your signed or primary location candidate."}
                </SectionHelp>
              </div>
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

      {/* Standing legal disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-800 mb-1">General Guidance Only</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Not legal advice. Requirements and rates change frequently. Verify current obligations with a licensed professional in your jurisdiction before acting.
        </p>
      </div>

      {/* Requirement sets */}
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
          const expanded = expandedCategories[category] !== false; // default open
          return (
            <div key={category} className="rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full px-5 py-4 border-b border-[var(--border)] flex items-center justify-between hover:bg-[var(--background)] transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{category}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{items.length} requirement{items.length !== 1 ? "s" : ""}</p>
                </div>
                {expanded ? <ChevronDown size={14} className="text-[var(--muted-foreground)]" /> : <ChevronRight size={14} className="text-[var(--muted-foreground)]" />}
              </button>

              {expanded && (
                <div className="divide-y divide-[var(--neutral-cool-100)]">
                  {items.map((req) => (
                    <div key={req.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-[var(--foreground)]">{req.title}</p>
                        {req.citation_url && (
                          <a
                            href={req.citation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-[var(--teal)] hover:underline shrink-0"
                          >
                            <ExternalLink size={10} />
                            Source
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{req.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function HiringWorkspace({
  planId,
  canEdit,
  initialTrialMessagesUsed,
  initialRoles,
  initialCandidates,
  initialQuestions,
  initialScores,
  initialOnboardingInstances,
  initialOnboardingTasks,
  initialCompetencies,
  initialStaffFiles,
  initialCompetencyEvals,
  initialHiringSettings,
  initialRequirementSets,
  minimumWage = null,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("org");
  const [paywallOpen, setPaywallOpen] = useState(false);

  const [roles, setRoles] = useState<OrgRole[]>(initialRoles);
  const [candidates, setCandidates] = useState<InterviewCandidate[]>(initialCandidates);
  const [questions, setQuestions] = useState<InterviewQuestion[]>(initialQuestions);
  const [scores, setScores] = useState<InterviewScore[]>(initialScores);
  const [instances, setInstances] = useState<OnboardingPlanInstance[]>(initialOnboardingInstances);
  const [tasks, setTasks] = useState<OnboardingTask[]>(initialOnboardingTasks);
  const [competencies, setCompetencies] = useState<StaffCompetency[]>(initialCompetencies);
  const [staffFiles, setStaffFiles] = useState<StaffFile[]>(initialStaffFiles);
  const [evaluations, setEvaluations] = useState<CompetencyEvaluation[]>(initialCompetencyEvals);

  const { promoteOnEdit } = useWorkspaceStatus();
  // Auto-promote not_started → in_progress once any hiring data exists.
  const hasContent = roles.length > 0 || candidates.length > 0 || competencies.length > 0 || tasks.length > 0;
  useEffect(() => {
    if (hasContent) promoteOnEdit("hiring");
  }, [hasContent, promoteOnEdit]);

  const tabs: { id: Tab; label: string; Icon: typeof Users }[] = [
    { id: "org", label: "Org Structure", Icon: Network },
    { id: "interview", label: "Interview", Icon: ClipboardList },
    { id: "onboarding", label: "Onboarding", Icon: UserCheck },
    { id: "competency", label: "Staff Skills", Icon: Award },
    { id: "requirements", label: "Hiring Laws", Icon: Globe },
  ];

  const handleRolesChange = useCallback(
    (v: OrgRole[] | ((prev: OrgRole[]) => OrgRole[])) => setRoles(v),
    [],
  );
  const handleCandidatesChange = useCallback((v: InterviewCandidate[]) => setCandidates(v), []);
  const handleQuestionsChange = useCallback((v: InterviewQuestion[]) => setQuestions(v), []);
  const handleScoresChange = useCallback((v: InterviewScore[]) => setScores(v), []);
  const handleInstancesChange = useCallback((v: OnboardingPlanInstance[]) => setInstances(v), []);
  const handleTasksChange = useCallback((v: OnboardingTask[]) => setTasks(v), []);
  const handleCompetenciesChange = useCallback((v: StaffCompetency[]) => setCompetencies(v), []);
  const handleStaffFilesChange = useCallback((v: StaffFile[]) => setStaffFiles(v), []);
  const handleEvaluationsChange = useCallback((v: CompetencyEvaluation[]) => setEvaluations(v), []);

  const handleApplyHiringSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    for (const c of accepted) {
      try {
        const jd = JSON.parse(c.finalValue) as Record<string, string>;
        await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.fieldId, jd }),
        });
      } catch { /* ignore */ }
    }
  }, [planId]);

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-4 sm:px-6 pt-8 pb-16">
        <WorkspaceHeader
          Icon={Users}
          title="Hiring & Onboarding"
          description="Figure out who you need on the team and what it'll cost to pay them."
          actions={
            <AskScoutButton
              workspaceKey="hiring"
              focusLabel="hiring plan"
              hasContent={hasContent}
            />
          }
        />

        {/* TIM-2426: Cross-Suite Conflict Resolver entry point. */}
        <div className="mb-4">
          <ConflictNoticeBadge />
        </div>

        {/* Tab nav — canonical WorkspaceSubNav (TIM-1793).
            TIM-1888 H-6: text-only pills (no Icon). T-1: default mb-5 spacing. */}
        <WorkspaceSubNav
          tabs={tabs.map((t) => ({ key: t.id, label: t.label }))}
          active={activeTab}
          onSelect={setActiveTab}
          ariaLabel="Hiring sections"
        />

        {/* Tab content */}
        {activeTab === "org" && (
          <OrgTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            onRolesChange={handleRolesChange}
            minimumWage={minimumWage}
          />
        )}
        {activeTab === "interview" && (
          // V2: candidates, scores, onCandidatesChange, onScoresChange deferred (TIM-1419)
          <InterviewTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            questions={questions}
            onQuestionsChange={handleQuestionsChange}
          />
        )}
        {activeTab === "onboarding" && (
          <OnboardingTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            instances={instances}
            tasks={tasks}
            onInstancesChange={handleInstancesChange}
            onTasksChange={handleTasksChange}
          />
        )}
        {activeTab === "competency" && (
          <CompetencyTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            competencies={competencies}
            staffFiles={staffFiles}
            evaluations={evaluations}
            onCompetenciesChange={handleCompetenciesChange}
            onStaffFilesChange={handleStaffFilesChange}
            onEvaluationsChange={handleEvaluationsChange}
          />
        )}
        {activeTab === "requirements" && (
          <RequirementsTab
            initialSettings={initialHiringSettings}
            initialRequirementSets={initialRequirementSets}
          />
        )}
      </div>

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        variant="copilot_trial"
      />

      <CoPilotDrawer
        planId={planId}
        workspaceKey="hiring"
        currentFocus={{ label: "Hiring & Onboarding" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
        onApplySuggestions={handleApplyHiringSuggestions}
      />
    </div>
  );
}
