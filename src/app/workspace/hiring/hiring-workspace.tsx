"use client";

// TIM-965: Hiring & Onboarding Suite — multi-tab workspace.
// Backed by row-level DB tables; no autosave JSONB blob — all mutations hit
// dedicated API routes directly with optimistic local state updates.

import { useState, useCallback, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import type { PersonnelLine, PersonnelPayBasis } from "@/lib/financial-projection";
import { personnelLoadedMonthlyCents } from "@/lib/financial-projection";
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
  type HiringRoleStatus,
  type CandidateStatus,
  type OnboardingPhase,
  type HiringCountry,
  type PlanHiringSettings,
  type HiringRequirementSet,
  CANDIDATE_STATUS_CONFIG,
  CANDIDATE_STATUS_ORDER,
  ROLE_STATUS_CONFIG,
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
}

function makeLocalId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Status pill ───────────────────────────────────────────────────────────────

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

function RolePill({ status }: { status: HiringRoleStatus }) {
  const cfg = ROLE_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ── Shared input styles ───────────────────────────────────────────────────────

const inputCls =
  "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
const sectionLabelCls =
  "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";

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

function OrgTab({
  planId,
  canEdit,
  roles,
  onRolesChange,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  onRolesChange: (r: OrgRole[] | ((prev: OrgRole[]) => OrgRole[])) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hubRole, setHubRole] = useState<OrgRole | null>(null);

  async function addRole() {
    const optimistic: OrgRole = {
      id: makeLocalId(),
      plan_id: planId,
      role_title: "",
      headcount: 1,
      start_date: null,
      monthly_cost_cents: null,
      status: "planned",
      notes: null,
      parent_role_id: null,
      jd_template_id: null,
    };
    onRolesChange((prev) => [...prev, optimistic]);
    setEditingId(optimistic.id);

    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_title: "", headcount: 1, status: "planned" }),
    });
    if (res.ok) {
      const created = (await res.json()) as OrgRole;
      onRolesChange((prev) => prev.map((r) => (r.id === optimistic.id ? created : r)));
      setEditingId(created.id);
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

  // Org chart: build tree from parent_role_id
  const rootRoles = roles.filter((r) => !r.parent_role_id);
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

  function OrgNode({ role, depth }: { role: OrgRole; depth: number }) {
    const children = childMap.get(role.id) ?? [];
    return (
      <div style={{ marginLeft: depth * 24 }}>
        <div className="flex items-center gap-2 py-1.5">
          {depth > 0 && (
            <span className="text-[#d0d0d0] text-sm select-none">└</span>
          )}
          <div className="flex items-center gap-2 bg-white border border-[#efefef] rounded-lg px-3 py-2 min-w-0">
            <Users size={14} className="text-[#155e63] shrink-0" />
            <span className="text-sm font-medium text-[#1a1a1a] truncate">
              {role.role_title || <span className="text-[#afafaf] font-normal">Unnamed role</span>}
            </span>
            <span className="text-xs text-[#6b6b6b] shrink-0">
              ×{role.headcount}
            </span>
            <RolePill status={role.status} />
          </div>
        </div>
        {children.map((c) => (
          <OrgNode key={c.id} role={c} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role table */}
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">Roles</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Define every role you plan to hire for.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addRole}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#155e63] px-3 py-2 rounded-lg hover:bg-[#0e4448] transition-colors"
            >
              <Plus size={13} />
              Add role
            </button>
          )}
        </div>

        {roles.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[#afafaf]">No roles yet. Add your first role above.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {roles.map((role) => (
              <RoleRow
                key={role.id}
                planId={planId}
                role={role}
                roles={roles}
                canEdit={canEdit}
                isEditing={editingId === role.id}
                onToggleEdit={() =>
                  setEditingId(editingId === role.id ? null : role.id)
                }
                onUpdate={(patch) => updateRole(role.id, patch)}
                onDelete={() => deleteRole(role.id)}
                onOpenHub={() => setHubRole(role)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Org chart */}
      {roles.length > 0 && (
        <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#efefef]">
            <p className="text-sm font-semibold text-[#1a1a1a]">Org Chart</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Set "Reports to" on each role to build the hierarchy.
            </p>
          </div>
          <div className="px-5 py-4">
            {rootRoles.length === 0 ? (
              <p className="text-sm text-[#afafaf]">
                No top-level roles. Set "Reports to" on roles to build the chart.
              </p>
            ) : (
              rootRoles.map((r) => <OrgNode key={r.id} role={r} depth={0} />)
            )}
          </div>
        </div>
      )}

      {/* Role Hub slide-over */}
      {hubRole && (
        <RoleHubPanel
          planId={planId}
          canEdit={canEdit}
          role={hubRole}
          onClose={() => setHubRole(null)}
        />
      )}

    </div>
  );
}

function RoleRow({
  planId,
  role,
  roles,
  canEdit,
  isEditing,
  onToggleEdit,
  onUpdate,
  onDelete,
  onOpenHub,
}: {
  planId: string;
  role: OrgRole;
  roles: OrgRole[];
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<OrgRole>) => void;
  onDelete: () => void;
  onOpenHub: () => void;
}) {
  const [jdOpen, setJdOpen] = useState(false);
  const [jdFields, setJdFields] = useState<JdFields | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdDirty, setJdDirty] = useState(false);
  const [improvingField, setImprovingField] = useState<keyof JdFields | null>(null);

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
  }

  function toggleJd() {
    if (!jdOpen) {
      if (!jdFields) loadJd();
      setJdOpen(true);
    } else {
      setJdOpen(false);
    }
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

  async function improveJdField(field: keyof JdFields) {
    if (!jdFields) return;
    setImprovingField(field);
    try {
      const res = await fetch("/api/workspaces/hiring/improve-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          content: jdFields[field],
          roleTitle: role.role_title,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { rewrite: string };
        setJdFields((prev) => prev ? { ...prev, [field]: data.rewrite } : prev);
        setJdDirty(true);
      }
    } finally {
      setImprovingField(null);
    }
  }

  // Load comp when edit section opens (TIM-1303)
  useEffect(() => {
    if (!isEditing || role.id.startsWith("local_")) return;
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
  }, [isEditing, role.id]);

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
    <div>
      {/* Role header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[#1a1a1a] truncate block">
            {role.role_title || (
              <span className="text-[#afafaf] font-normal">Unnamed role</span>
            )}
          </span>
          <span className="text-xs text-[#6b6b6b]">
            {role.headcount} headcount
            {role.monthly_cost_cents
              ? ` · $${Math.round(role.monthly_cost_cents / 100)}/mo`
              : ""}
          </span>
        </div>
        <RolePill status={role.status} />
        <button
          type="button"
          onClick={onOpenHub}
          className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:underline shrink-0"
        >
          Hub <ExternalLink size={11} />
        </button>
        <button
          type="button"
          onClick={onToggleEdit}
          className="text-[#afafaf] hover:text-[#1a1a1a] p-1 shrink-0"
        >
          {isEditing ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={onDelete}
            className="text-[#afafaf] hover:text-[#a13d3d] p-1 shrink-0"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* JD inline accordion */}
      <div className="border-t border-[#f5f5f5]">
        <button
          type="button"
          onClick={toggleJd}
          className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#faf9f7] transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={12} className="text-[#155e63] shrink-0" />
            <span className="text-xs font-semibold text-[#155e63]">Job Description</span>
            {jdFields?.summary && !jdOpen && (
              <span className="text-xs text-[#afafaf] truncate">
                {jdFields.summary.replace(/\n/g, " ").substring(0, 80)}
              </span>
            )}
          </div>
          {jdOpen
            ? <ChevronUp size={12} className="text-[#afafaf] shrink-0" />
            : <ChevronDown size={12} className="text-[#afafaf] shrink-0" />}
        </button>

        {jdOpen && (
          <div className="px-4 pb-4 space-y-4 bg-[#faf9f7] border-t border-[#f0f0f0]">
            {jdLoading ? (
              <p className="text-sm text-[#afafaf] pt-3">Loading...</p>
            ) : (
              <>
                <div className="pt-3 space-y-4">
                  {JD_FIELD_DEFS.map(({ key, label, multiline }) => (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className={labelCls}>{label}</label>
                        {canEdit && (
                          <button
                            type="button"
                            disabled={improvingField === key}
                            onClick={() => improveJdField(key)}
                            className="text-[10px] font-semibold text-[#155e63] hover:underline disabled:opacity-50"
                          >
                            {improvingField === key ? "Improving..." : "AI Improve"}
                          </button>
                        )}
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
                {canEdit && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={saveJd}
                      disabled={!jdDirty}
                      className="text-sm font-semibold bg-[#155e63] text-white px-5 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-50"
                    >
                      Save JD
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="px-4 pb-4 bg-[#faf9f7] border-t border-[#f0f0f0]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
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
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={role.status}
                onChange={(e) =>
                  onUpdate({ status: e.target.value as HiringRoleStatus })
                }
                disabled={!canEdit}
              >
                {(Object.keys(ROLE_STATUS_CONFIG) as HiringRoleStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {ROLE_STATUS_CONFIG[s].label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start date</label>
              <input
                className={inputCls}
                type="date"
                value={role.start_date ?? ""}
                onChange={(e) =>
                  onUpdate({ start_date: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </div>
            {/* Compensation framework (TIM-1303) */}
            <div className="sm:col-span-2 border border-[#e8e8e8] rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[#155e63]">Compensation</p>
                {compLoading && (
                  <span className="text-[10px] text-[#afafaf]">Loading…</span>
                )}
                {!compLoading && compLine === null && !compDirty && (
                  <span className="text-[10px] text-[#afafaf]">Not set — edit fields to link</span>
                )}
                {compPreviewCents !== null && (
                  <span className="text-xs font-semibold text-[#155e63]">
                    Loaded: ${(compPreviewCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 items-end">
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
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">$</span>
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
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#afafaf] pointer-events-none">%</span>
                  </div>
                </div>
                {canEdit && compDirty && (
                  <button
                    type="button"
                    onClick={saveComp}
                    disabled={compSaving}
                    className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors disabled:opacity-50"
                  >
                    {compSaving ? "Saving…" : "Save comp"}
                  </button>
                )}
              </div>
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
                <option value="">— None (top-level) —</option>
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
        </div>
      )}
    </div>
  );
}

// ── Role Hub Panel ────────────────────────────────────────────────────────────
// TIM-1299: slide-over showing JD placeholder, Scorecards, and Competency Form
// for a selected role. Navigation backbone for W2/W3/W6.

function RoleHubPanel({
  planId,
  canEdit,
  role,
  onClose,
}: {
  planId: string;
  canEdit: boolean;
  role: OrgRole;
  onClose: () => void;
}) {
  const [scorecards, setScorecards] = useState<InterviewScorecard[]>([]);
  const [compForms, setCompForms] = useState<CompetencyFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [renamingScorecard, setRenamingScorecard] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingForm, setRenamingForm] = useState<string | null>(null);
  const [renameFormValue, setRenameFormValue] = useState("");

  // Load on mount
  useEffect(() => {
    (async () => {
      const [sc, cf] = await Promise.all([
        fetch(`/api/workspaces/hiring/scorecards?role_id=${role.id}`).then((r) => r.json()),
        fetch(`/api/workspaces/hiring/competency-forms?role_id=${role.id}`).then((r) => r.json()),
      ]);
      setScorecards(Array.isArray(sc) ? sc : []);
      setCompForms(Array.isArray(cf) ? cf : []);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  async function addScorecard() {
    const res = await fetch("/api/workspaces/hiring/scorecards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "New Scorecard", order_index: scorecards.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as InterviewScorecard;
      setScorecards((prev) => [...prev, created]);
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
      setScorecards((prev) => [...prev, copy]);
    }
  }

  async function saveRenameScorecard(id: string) {
    const name = renameValue.trim() || "Scorecard";
    setScorecards((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    setRenamingScorecard(null);
    await fetch("/api/workspaces/hiring/scorecards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteScorecard(id: string) {
    setScorecards((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/workspaces/hiring/scorecards?id=${id}`, { method: "DELETE" });
  }

  async function addCompForm() {
    const res = await fetch("/api/workspaces/hiring/competency-forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId, role_id: role.id, name: "General", order_index: compForms.length }),
    });
    if (res.ok) {
      const created = (await res.json()) as CompetencyFormTemplate;
      setCompForms((prev) => [...prev, created]);
      setRenamingForm(created.id);
      setRenameFormValue(created.name);
    }
  }

  async function saveRenameForm(id: string) {
    const name = renameFormValue.trim() || "General";
    setCompForms((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    setRenamingForm(null);
    await fetch("/api/workspaces/hiring/competency-forms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    });
  }

  async function deleteCompForm(id: string) {
    setCompForms((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/workspaces/hiring/competency-forms?id=${id}`, { method: "DELETE" });
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Close panel"
        className="flex-1 bg-black/30"
        onClick={onClose}
      />
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#efefef] flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">Role Hub</p>
            <p className="text-xs text-[#6b6b6b]">{role.role_title || "Unnamed role"}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#afafaf] hover:text-[#1a1a1a] p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {loading ? (
            <p className="text-sm text-[#afafaf]">Loading…</p>
          ) : (
            <>
              {/* ── Scorecards ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck size={14} className="text-[#155e63]" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#155e63]">Scorecards</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={addScorecard}
                      className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:underline"
                    >
                      <Plus size={12} /> New
                    </button>
                  )}
                </div>
                {scorecards.length === 0 ? (
                  <p className="text-xs text-[#afafaf]">No scorecards yet. Create one above.</p>
                ) : (
                  <div className="space-y-2">
                    {scorecards.map((sc) => (
                      <div key={sc.id} className="flex items-center gap-2 border border-[#efefef] rounded-lg px-3 py-2">
                        {renamingScorecard === sc.id ? (
                          <>
                            <input
                              autoFocus
                              className="flex-1 text-sm border border-[#e0e0e0] rounded px-2 py-1 focus:outline-none focus:border-[#155e63]"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRenameScorecard(sc.id);
                                if (e.key === "Escape") setRenamingScorecard(null);
                              }}
                            />
                            <button type="button" onClick={() => saveRenameScorecard(sc.id)} className="text-[#155e63] p-1">
                              <Check size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-[#1a1a1a] truncate">
                              {sc.name}
                              {sc.is_default && (
                                <span className="ml-2 text-[10px] font-semibold text-[#155e63] bg-[#f0fafa] px-1.5 py-0.5 rounded-full">Default</span>
                              )}
                            </span>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  title="Rename"
                                  onClick={() => { setRenamingScorecard(sc.id); setRenameValue(sc.name); }}
                                  className="text-[#afafaf] hover:text-[#1a1a1a] p-1"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  title="Duplicate"
                                  onClick={() => duplicateScorecard(sc.id)}
                                  className="text-[#afafaf] hover:text-[#155e63] p-1"
                                >
                                  <Copy size={12} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => deleteScorecard(sc.id)}
                                  className="text-[#afafaf] hover:text-[#a13d3d] p-1"
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

              {/* ── Competency Form ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-[#155e63]" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#155e63]">Competency Form</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={addCompForm}
                      className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:underline"
                    >
                      <Plus size={12} /> New
                    </button>
                  )}
                </div>
                {compForms.length === 0 ? (
                  <p className="text-xs text-[#afafaf]">No competency form template yet. Create one above.</p>
                ) : (
                  <div className="space-y-2">
                    {compForms.map((cf) => (
                      <div key={cf.id} className="flex items-center gap-2 border border-[#efefef] rounded-lg px-3 py-2">
                        {renamingForm === cf.id ? (
                          <>
                            <input
                              autoFocus
                              className="flex-1 text-sm border border-[#e0e0e0] rounded px-2 py-1 focus:outline-none focus:border-[#155e63]"
                              value={renameFormValue}
                              onChange={(e) => setRenameFormValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRenameForm(cf.id);
                                if (e.key === "Escape") setRenamingForm(null);
                              }}
                            />
                            <button type="button" onClick={() => saveRenameForm(cf.id)} className="text-[#155e63] p-1">
                              <Check size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm text-[#1a1a1a] truncate">{cf.name}</span>
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  title="Rename"
                                  onClick={() => { setRenamingForm(cf.id); setRenameFormValue(cf.name); }}
                                  className="text-[#afafaf] hover:text-[#1a1a1a] p-1"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  type="button"
                                  title="Delete"
                                  onClick={() => deleteCompForm(cf.id)}
                                  className="text-[#afafaf] hover:text-[#a13d3d] p-1"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Interview Scorecard tab ───────────────────────────────────────────────────

function InterviewTab({
  planId,
  canEdit,
  roles,
  candidates,
  questions,
  scores,
  onCandidatesChange,
  onQuestionsChange,
  onScoresChange,
}: {
  planId: string;
  canEdit: boolean;
  roles: OrgRole[];
  candidates: InterviewCandidate[];
  questions: InterviewQuestion[];
  scores: InterviewScore[];
  onCandidatesChange: (c: InterviewCandidate[]) => void;
  onQuestionsChange: (q: InterviewQuestion[]) => void;
  onScoresChange: (s: InterviewScore[]) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    candidates[0]?.id ?? null
  );
  const [roleScorecards, setRoleScorecards] = useState<InterviewScorecard[]>([]);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string | null>(null);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  // Fetch scorecards for the selected candidate's role, auto-select default.
  useEffect(() => {
    if (!selected?.role_id) {
      setRoleScorecards([]);
      setSelectedScorecardId(null);
      return;
    }
    fetch(`/api/workspaces/hiring/scorecards?role_id=${selected.role_id}`)
      .then((r) => r.json())
      .then((sc: unknown) => {
        const list = Array.isArray(sc) ? (sc as InterviewScorecard[]) : [];
        setRoleScorecards(list);
        const def = list.find((s) => s.is_default) ?? list[0] ?? null;
        setSelectedScorecardId(def?.id ?? null);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.role_id]);

  // Filter questions by active scorecard when one is selected.
  const roleQuestions = questions.filter((q) => {
    if (selectedScorecardId) return q.scorecard_id === selectedScorecardId;
    return (q.role_id === selected?.role_id || q.role_id === null) && !q.scorecard_id;
  });

  // Compute weighted score across all scored questions for a candidate.
  function candidateWeightedScore(candidateId: string): number | null {
    let ws = 0, tw = 0;
    for (const s of scores) {
      if (s.candidate_id !== candidateId || s.score <= 0) continue;
      const q = questions.find((q) => q.id === s.question_id);
      if (!q) continue;
      ws += s.score * q.weight;
      tw += q.weight * 5;
    }
    return tw === 0 ? null : Math.round((ws / tw) * 100);
  }

  async function addCandidate() {
    const optimistic: InterviewCandidate = {
      id: makeLocalId(),
      plan_id: planId,
      role_id: null,
      name: "",
      contact: null,
      status: "applied",
      notes: null,
      position: candidates.length,
    };
    onCandidatesChange([...candidates, optimistic]);
    setSelectedId(optimistic.id);

    const res = await fetch(
      `/api/workspaces/hiring/candidates?planId=${planId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          name: "",
          status: "applied",
          position: candidates.length,
        }),
      }
    );
    if (res.ok) {
      const created = (await res.json()) as InterviewCandidate;
      onCandidatesChange(candidates.map((c) => (c.id === optimistic.id ? created : c)));
      setSelectedId(created.id);
    } else {
      onCandidatesChange(candidates.filter((c) => c.id !== optimistic.id));
    }
  }

  async function updateCandidate(
    id: string,
    patch: Partial<InterviewCandidate>
  ) {
    onCandidatesChange(candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/workspaces/hiring/candidates?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }

  async function deleteCandidate(id: string) {
    const prev = candidates;
    onCandidatesChange(candidates.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(candidates.find((c) => c.id !== id)?.id ?? null);
    const res = await fetch(
      `/api/workspaces/hiring/candidates?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onCandidatesChange(prev);
  }

  async function addQuestion() {
    const optimistic: InterviewQuestion = {
      id: makeLocalId(),
      plan_id: planId,
      role_id: selected?.role_id ?? null,
      scorecard_id: selectedScorecardId,
      prompt: "",
      weight: 3,
      order_index: questions.length,
    };
    onQuestionsChange([...questions, optimistic]);

    const res = await fetch(
      `/api/workspaces/hiring/questions?planId=${planId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          role_id: selected?.role_id ?? null,
          scorecard_id: selectedScorecardId,
          prompt: "",
          weight: 3,
          order_index: questions.length,
        }),
      }
    );
    if (res.ok) {
      const created = (await res.json()) as InterviewQuestion;
      onQuestionsChange(questions.map((q) => (q.id === optimistic.id ? created : q)));
    } else {
      onQuestionsChange(questions.filter((q) => q.id !== optimistic.id));
    }
  }

  async function updateQuestion(
    id: string,
    patch: Partial<InterviewQuestion>
  ) {
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
    const res = await fetch(
      `/api/workspaces/hiring/questions?planId=${planId}&id=${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) onQuestionsChange(prev);
  }

  async function upsertScore(
    candidateId: string,
    questionId: string,
    score: number,
    notes: string | null
  ) {
    const existing = scores.find(
      (s) => s.candidate_id === candidateId && s.question_id === questionId
    );
    const updated: InterviewScore = existing
      ? { ...existing, score, notes }
      : { id: makeLocalId(), candidate_id: candidateId, question_id: questionId, scorecard_id: selectedScorecardId, score, notes };
    onScoresChange(
      existing
        ? scores.map((s) =>
            s.candidate_id === candidateId && s.question_id === questionId
              ? updated
              : s
          )
        : [...scores, updated]
    );
    await fetch(`/api/workspaces/hiring/scores?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId, question_id: questionId, scorecard_id: selectedScorecardId, score, notes }),
    });
  }

  function cycleStatus(candidate: InterviewCandidate) {
    const idx = CANDIDATE_STATUS_ORDER.indexOf(candidate.status);
    const next =
      CANDIDATE_STATUS_ORDER[(idx + 1) % CANDIDATE_STATUS_ORDER.length];
    updateCandidate(candidate.id, { status: next });
  }

  // Weighted total for selected candidate
  const weightedTotal = useMemo(() => {
    if (!selected) return null;
    let weightedSum = 0;
    let totalWeight = 0;
    for (const q of roleQuestions) {
      const s = scores.find(
        (sc) => sc.candidate_id === selected.id && sc.question_id === q.id
      );
      if (s && s.score > 0) {
        weightedSum += s.score * q.weight;
        totalWeight += q.weight * 5;
      }
    }
    if (totalWeight === 0) return null;
    return ((weightedSum / totalWeight) * 100).toFixed(0);
  }, [selected, roleQuestions, scores]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left: candidate list */}
      <div className="lg:col-span-1 space-y-3">
        <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#efefef] flex items-center justify-between">
            <p className="text-sm font-semibold text-[#1a1a1a]">Candidates</p>
            {canEdit && (
              <button
                type="button"
                onClick={addCandidate}
                className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448]"
              >
                <Plus size={13} />
                Add
              </button>
            )}
          </div>
          {candidates.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[#afafaf]">No candidates yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f5f5f5]">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${
                    selectedId === c.id
                      ? "bg-[#f4f9f8]"
                      : "hover:bg-[#faf9f7]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a1a] truncate">
                      {c.name || (
                        <span className="text-[#afafaf] font-normal">
                          New candidate
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-[#6b6b6b] truncate">
                      {roles.find((r) => r.id === c.role_id)?.role_title ?? "No role"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(() => {
                      const pct = candidateWeightedScore(c.id);
                      return pct !== null ? (
                        <span className="text-[10px] font-bold text-[#155e63]">{pct}%</span>
                      ) : null;
                    })()}
                    <CandidatePill status={c.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: scorecard */}
      <div className="lg:col-span-2 space-y-4">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-[#e0e0e0] py-16 text-center">
            <p className="text-sm text-[#afafaf]">Select a candidate to view their scorecard.</p>
          </div>
        ) : (
          <>
            {/* Candidate detail */}
            <div className="rounded-xl border border-[#efefef] bg-white px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className={sectionLabelCls}>Candidate details</p>
                <div className="flex items-center gap-2">
                  <CandidatePill
                    status={selected.status}
                    onClick={canEdit ? () => cycleStatus(selected) : undefined}
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteCandidate(selected.id)}
                      className="text-[#afafaf] hover:text-[#a13d3d] p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    className={inputCls}
                    value={selected.name}
                    onChange={(e) =>
                      updateCandidate(selected.id, { name: e.target.value })
                    }
                    placeholder="Full name"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className={labelCls}>Contact (email / phone)</label>
                  <input
                    className={inputCls}
                    value={selected.contact ?? ""}
                    onChange={(e) =>
                      updateCandidate(selected.id, {
                        contact: e.target.value || null,
                      })
                    }
                    placeholder="contact@email.com"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <label className={labelCls}>Applying for</label>
                  <select
                    className={inputCls}
                    value={selected.role_id ?? ""}
                    onChange={(e) =>
                      updateCandidate(selected.id, {
                        role_id: e.target.value || null,
                      })
                    }
                    disabled={!canEdit}
                  >
                    <option value="">— No role —</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.role_title || "Unnamed role"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <input
                    className={inputCls}
                    value={selected.notes ?? ""}
                    onChange={(e) =>
                      updateCandidate(selected.id, {
                        notes: e.target.value || null,
                      })
                    }
                    placeholder="Brief notes"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>

            {/* Questions + scores */}
            <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-[#efefef] flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1a1a1a]">Interview Scorecard</p>
                  {roleScorecards.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-[#6b6b6b]">Scoring with:</span>
                      <select
                        className="text-xs border border-[#e0e0e0] rounded px-1.5 py-0.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] bg-white"
                        value={selectedScorecardId ?? ""}
                        onChange={(e) => setSelectedScorecardId(e.target.value || null)}
                      >
                        {roleScorecards.map((sc) => (
                          <option key={sc.id} value={sc.id}>{sc.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448] shrink-0"
                  >
                    <Plus size={13} />
                    Add question
                  </button>
                )}
              </div>

              {roleQuestions.length === 0 ? (
                <div className="py-8 text-center px-5">
                  <p className="text-sm text-[#afafaf]">
                    {selectedScorecardId
                      ? "No questions in this scorecard yet. Add one above."
                      : "No questions yet. Add interview questions above."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#f5f5f5]">
                  {roleQuestions.map((q) => {
                    const scoreEntry = scores.find(
                      (s) =>
                        s.candidate_id === selected.id &&
                        s.question_id === q.id
                    );
                    return (
                      <div key={q.id} className="px-5 py-4 space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <input
                              className="w-full text-sm text-[#1a1a1a] bg-transparent border-b border-transparent hover:border-[#e0e0e0] focus:border-[#155e63] focus:outline-none py-0.5 disabled:hover:border-transparent"
                              value={q.prompt}
                              onChange={(e) =>
                                updateQuestion(q.id, { prompt: e.target.value })
                              }
                              placeholder="Interview question..."
                              disabled={!canEdit}
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-[#6b6b6b]">
                              Weight
                            </span>
                            <select
                              className="text-xs border border-[#e0e0e0] rounded px-1 py-0.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63]"
                              value={q.weight}
                              onChange={(e) =>
                                updateQuestion(q.id, {
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
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => deleteQuestion(q.id)}
                                className="text-[#afafaf] hover:text-[#a13d3d] p-0.5"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                disabled={!canEdit}
                                onClick={() =>
                                  upsertScore(
                                    selected.id,
                                    q.id,
                                    n,
                                    scoreEntry?.notes ?? null
                                  )
                                }
                                className={`w-7 h-7 rounded-full text-xs font-semibold border transition-colors ${
                                  scoreEntry && scoreEntry.score >= n
                                    ? "bg-[#155e63] text-white border-[#155e63]"
                                    : "bg-white text-[#afafaf] border-[#e0e0e0] hover:border-[#155e63]"
                                } disabled:opacity-50`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                          <input
                            className="flex-1 text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7]"
                            value={scoreEntry?.notes ?? ""}
                            onChange={(e) =>
                              upsertScore(
                                selected.id,
                                q.id,
                                scoreEntry?.score ?? 0,
                                e.target.value || null
                              )
                            }
                            placeholder="Score notes..."
                            disabled={!canEdit}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {weightedTotal !== null && (
                <div className="px-5 py-3 border-t border-[#efefef] bg-[#f4f9f8]">
                  <span className="text-xs text-[#6b6b6b]">
                    Weighted score:{" "}
                    <span className="font-bold text-[#155e63]">
                      {weightedTotal}%
                    </span>
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
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
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1a1a1a]">Onboarding Plans</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448]"
            >
              <Plus size={13} />
              New plan
            </button>
          )}
        </div>

        {showNewForm && (
          <div className="px-5 py-4 border-b border-[#efefef] bg-[#faf9f7] space-y-3">
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
                className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create plan"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                className="text-xs text-[#6b6b6b] hover:text-[#1a1a1a]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {instances.length === 0 && !showNewForm ? (
          <div className="py-10 text-center">
            <p className="text-sm text-[#afafaf]">
              No onboarding plans yet. Create one above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {instances.map((inst) => {
              const instTasks = tasks.filter((t) => t.instance_id === inst.id);
              const completed = instTasks.filter((t) => t.completed_at).length;
              const total = instTasks.length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedId(inst.id)}
                  className={`w-full text-left px-5 py-3 flex items-center gap-4 transition-colors ${
                    selectedId === inst.id ? "bg-[#f4f9f8]" : "hover:bg-[#faf9f7]"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a1a]">
                      {inst.hire_name}
                    </p>
                    <p className="text-[10px] text-[#6b6b6b]">
                      {roles.find((r) => r.id === inst.role_id)?.role_title ?? "No role"}
                      {inst.start_date
                        ? ` · Starts ${new Date(`${inst.start_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-[#e8e8e8] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#155e63] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#6b6b6b]">
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
                      className="text-[#afafaf] hover:text-[#a13d3d] p-1"
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
                className="rounded-xl border border-[#efefef] bg-white overflow-hidden"
              >
                {/* Phase header — clickable to collapse/expand */}
                <button
                  type="button"
                  onClick={() => togglePhase(phase)}
                  className="w-full px-5 py-3 border-b border-[#efefef] flex items-center justify-between bg-[#faf9f7] hover:bg-[#f4f4f2] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={14} className="text-[#155e63]" />
                    ) : (
                      <ChevronDown size={14} className="text-[#155e63]" />
                    )}
                    <span className="text-xs font-semibold text-[#155e63]">
                      {PHASE_LABELS[phase]}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#afafaf]">
                    {doneCount}/{phaseTasks.length} done
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {phaseTasks.length === 0 ? (
                      <div className="px-5 py-3">
                        <p className="text-xs text-[#afafaf]">No tasks in this phase.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#f5f5f5]">
                        {phaseTasks.map((t) => {
                          const isExpanded = expandedTaskId === t.id;
                          const dueDate = computeDueDateLabel(selectedInstance.start_date, t.due_offset_days);

                          return (
                            <div key={t.id} className="px-5 py-3 space-y-2">
                              {/* Task row */}
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => canEdit && toggleTask(t)}
                                  className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    t.completed_at
                                      ? "bg-[#155e63] border-[#155e63]"
                                      : "border-[#d0d0d0] hover:border-[#155e63]"
                                  } ${!canEdit ? "cursor-default" : "cursor-pointer"}`}
                                  aria-label={t.completed_at ? "Mark incomplete" : "Mark complete"}
                                >
                                  {t.completed_at && (
                                    <Check size={10} className="text-white" />
                                  )}
                                </button>

                                <div className="flex-1 min-w-0">
                                  <input
                                    className={`w-full text-sm bg-transparent border-b border-transparent hover:border-[#e0e0e0] focus:border-[#155e63] focus:outline-none py-0.5 disabled:hover:border-transparent ${
                                      t.completed_at
                                        ? "line-through text-[#afafaf]"
                                        : "text-[#1a1a1a]"
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
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="flex items-center gap-1 text-xs text-[#6b6b6b]">
                                    <span className="whitespace-nowrap">Due: Day</span>
                                    <input
                                      className="w-12 text-xs border border-[#e0e0e0] rounded px-1.5 py-0.5 text-[#1a1a1a] text-center focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7]"
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
                                    <span className="text-[10px] text-[#afafaf] whitespace-nowrap">
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
                                    className="text-[#afafaf] hover:text-[#155e63] p-0.5"
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
                                      className="text-[#afafaf] hover:text-[#a13d3d] p-0.5"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Drill-down detail panel */}
                              {isExpanded && (
                                <div className="ml-7 rounded-lg bg-[#f7f8f6] border border-[#e8e8e8] p-3 space-y-2">
                                  {canEdit ? (
                                    <textarea
                                      className="w-full text-xs text-[#1a1a1a] bg-transparent resize-none focus:outline-none placeholder-[#c0c0c0]"
                                      rows={3}
                                      value={t.detail ?? ""}
                                      onChange={(e) =>
                                        updateTask(t.id, { detail: e.target.value || null })
                                      }
                                      placeholder="Add detail, instructions, or context for this task..."
                                    />
                                  ) : t.detail ? (
                                    <p className="text-xs text-[#555]">{t.detail}</p>
                                  ) : (
                                    <p className="text-xs text-[#afafaf] italic">No detail added.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {canEdit && (
                      <div className="px-5 py-2 border-t border-[#f5f5f5]">
                        <button
                          type="button"
                          onClick={() => addTask(phase)}
                          className="flex items-center gap-1 text-xs text-[#155e63] hover:underline"
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
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a]">
              Competency Framework
            </p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Shared skills and rubric for all staff evaluations.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addCompetency}
              className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448]"
            >
              <Plus size={13} />
              Add skill
            </button>
          )}
        </div>

        {competencies.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#afafaf]">
              No competencies defined. Add skills above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
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
                        <span className="text-[10px] text-[#6b6b6b]">Wt</span>
                        <select
                          className="text-xs border border-[#e0e0e0] rounded px-1 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63]"
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
                      className="text-[#afafaf] hover:text-[#a13d3d] p-1 mt-1 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Staff list + scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: staff list */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-[#efefef] flex items-center justify-between">
              <p className="text-sm font-semibold text-[#1a1a1a]">Staff</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={addStaffFile}
                  className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448]"
                >
                  <Plus size={13} />
                  Add
                </button>
              )}
            </div>
            {staffFiles.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#afafaf]">No staff files yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5]">
                {staffFiles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedStaffId(s.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${
                      selectedStaffId === s.id
                        ? "bg-[#f4f9f8]"
                        : "hover:bg-[#faf9f7]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a1a] truncate">
                        {s.name || (
                          <span className="text-[#afafaf] font-normal">
                            New staff
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-[#6b6b6b]">
                        {roles.find((r) => r.id === s.role_id)?.role_title ?? "No role"}
                        {s.hire_date ? ` · ${s.hire_date}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: evaluation scorecard */}
        <div className="lg:col-span-2">
          {!selectedStaff ? (
            <div className="rounded-xl border border-dashed border-[#e0e0e0] py-16 text-center">
              <p className="text-sm text-[#afafaf]">
                Select a staff member to view their evaluation.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Staff detail */}
              <div className="rounded-xl border border-[#efefef] bg-white px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className={sectionLabelCls}>Staff file</p>
                  <div className="flex items-center gap-2">
                    <a
                      href="/workspace/hiring/report/print"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-[#155e63] hover:underline"
                    >
                      Print Report <ExternalLink size={11} />
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => deleteStaffFile(selectedStaff.id)}
                        className="text-[#afafaf] hover:text-[#a13d3d] p-1"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input
                      className={inputCls}
                      value={selectedStaff.name}
                      onChange={(e) =>
                        updateStaffFile(selectedStaff.id, { name: e.target.value })
                      }
                      placeholder="Full name"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Hire date</label>
                    <input
                      className={inputCls}
                      type="date"
                      value={selectedStaff.hire_date ?? ""}
                      onChange={(e) =>
                        updateStaffFile(selectedStaff.id, {
                          hire_date: e.target.value || null,
                        })
                      }
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Role</label>
                    <select
                      className={inputCls}
                      value={selectedStaff.role_id ?? ""}
                      onChange={(e) =>
                        updateStaffFile(selectedStaff.id, {
                          role_id: e.target.value || null,
                        })
                      }
                      disabled={!canEdit}
                    >
                      <option value="">— No role —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.role_title || "Unnamed role"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Competency scores */}
              <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-[#efefef]">
                  <p className="text-sm font-semibold text-[#1a1a1a]">
                    Competency Scores
                  </p>
                </div>
                {competencies.length === 0 ? (
                  <div className="py-8 text-center px-5">
                    <p className="text-sm text-[#afafaf]">
                      No competencies defined in the framework above.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#f5f5f5]">
                    {competencies
                      .sort((a, b) => a.order_index - b.order_index)
                      .map((comp) => {
                        const ev = evaluations.find(
                          (e) =>
                            e.staff_file_id === selectedStaff.id &&
                            e.competency_id === comp.id
                        );
                        return (
                          <div key={comp.id} className="px-5 py-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium text-[#1a1a1a]">
                                  {comp.skill || (
                                    <span className="text-[#afafaf]">Unnamed skill</span>
                                  )}
                                </p>
                                {comp.rubric && (
                                  <p className="text-xs text-[#6b6b6b] mt-0.5">
                                    {comp.rubric}
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] text-[#afafaf] shrink-0">
                                Weight: {comp.weight}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      upsertEvaluation(
                                        selectedStaff.id,
                                        comp.id,
                                        n,
                                        ev?.notes ?? null
                                      )
                                    }
                                    className={`w-7 h-7 rounded-full text-xs font-semibold border transition-colors ${
                                      ev && ev.score >= n
                                        ? "bg-[#155e63] text-white border-[#155e63]"
                                        : "bg-white text-[#afafaf] border-[#e0e0e0] hover:border-[#155e63]"
                                    } disabled:opacity-50`}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                              <input
                                className="flex-1 text-xs border border-[#e0e0e0] rounded px-2 py-1 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7]"
                                value={ev?.notes ?? ""}
                                onChange={(e) =>
                                  upsertEvaluation(
                                    selectedStaff.id,
                                    comp.id,
                                    ev?.score ?? 0,
                                    e.target.value || null
                                  )
                                }
                                placeholder="Evaluation notes..."
                                disabled={!canEdit}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {weightedAvg !== null && (
                  <div className="px-5 py-4 border-t border-[#efefef] bg-[#f4f9f8]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#6b6b6b]">
                        Weighted average:{" "}
                        <span className="font-bold text-[#155e63]">
                          {weightedAvg.toFixed(0)}%
                        </span>
                      </span>
                      <div className="flex-1 h-2 bg-[#e8e8e8] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#155e63] rounded-full transition-all"
                          style={{ width: `${weightedAvg}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
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
      <div className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[#efefef]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold text-[#1a1a1a]">Hiring Jurisdiction</p>
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                {settings.hiring_country
                  ? "Override set. Requirement set sourced from your selection."
                  : "Auto-detected from your signed or primary location candidate."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-[#6b6b6b]" />
              <select
                value={settings.hiring_country ?? ""}
                onChange={(e) => changeCountry(e.target.value as HiringCountry | "")}
                disabled={saving}
                className="text-sm border border-[#e0e0e0] rounded-lg px-3 py-1.5 text-[#1a1a1a] focus:outline-none focus:border-[#155e63] bg-white disabled:opacity-60"
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
          <div className="px-5 py-3 bg-[#f4f9f8]">
            <p className="text-xs text-[#155e63] font-medium">
              Showing requirements for: {countryLabel} ({effectiveCountry})
            </p>
          </div>
        ) : (
          <div className="px-5 py-3 bg-[#fdf8f2] border-t border-[#efefef]">
            <p className="text-xs text-[#b45309] font-medium flex items-center gap-1.5">
              <AlertTriangle size={12} />
              No country detected. Add a location candidate or select a jurisdiction above to see requirements.
            </p>
          </div>
        )}
      </div>

      {/* Content gap notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-xs font-semibold text-amber-800 mb-1">Content in Progress</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Requirement bodies are placeholders pending review by a qualified Legal Analyst. Do not rely on this content for compliance decisions. Verified text will be added once the Legal Analyst role is staffed.
        </p>
      </div>

      {/* Requirement sets */}
      {loadingReqs ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#afafaf]">Loading requirements...</p>
        </div>
      ) : requirementSets.length === 0 && effectiveCountry ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#afafaf]">No requirements found for {countryLabel}.</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const expanded = expandedCategories[category] !== false; // default open
          return (
            <div key={category} className="rounded-xl border border-[#efefef] bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full px-5 py-4 border-b border-[#efefef] flex items-center justify-between hover:bg-[#faf9f7] transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-[#1a1a1a]">{category}</p>
                  <p className="text-xs text-[#6b6b6b] mt-0.5">{items.length} requirement{items.length !== 1 ? "s" : ""}</p>
                </div>
                {expanded ? <ChevronDown size={14} className="text-[#6b6b6b]" /> : <ChevronRight size={14} className="text-[#6b6b6b]" />}
              </button>

              {expanded && (
                <div className="divide-y divide-[#f5f5f5]">
                  {items.map((req) => (
                    <div key={req.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-[#1a1a1a]">{req.title}</p>
                        {req.citation_url && (
                          <a
                            href={req.citation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-[#155e63] hover:underline shrink-0"
                          >
                            <ExternalLink size={10} />
                            Source
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-[#6b6b6b] leading-relaxed">{req.body}</p>
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

  const tabs: { id: Tab; label: string; Icon: typeof Users }[] = [
    { id: "org", label: "Org Structure", Icon: Network },
    { id: "interview", label: "Interview", Icon: ClipboardList },
    { id: "onboarding", label: "Onboarding", Icon: UserCheck },
    { id: "competency", label: "Competency", Icon: Award },
    { id: "requirements", label: "Requirements", Icon: Globe },
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

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-4xl mx-auto px-6 pt-8 pb-16">
        {/* Page header */}
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Hiring &amp; Onboarding
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Build your org structure, run scored interviews, plan onboarding, and evaluate staff competencies.
          </p>
        </header>

        {/* Tab nav */}
        <nav className="flex items-center gap-1 bg-white border border-[#efefef] rounded-xl p-1 mb-6 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? "bg-[#155e63] text-white"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
            >
              <t.Icon size={13} />
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        {activeTab === "org" && (
          <OrgTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            onRolesChange={handleRolesChange}
          />
        )}
        {activeTab === "interview" && (
          <InterviewTab
            planId={planId}
            canEdit={canEdit}
            roles={roles}
            candidates={candidates}
            questions={questions}
            scores={scores}
            onCandidatesChange={handleCandidatesChange}
            onQuestionsChange={handleQuestionsChange}
            onScoresChange={handleScoresChange}
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
      />
    </div>
  );
}
