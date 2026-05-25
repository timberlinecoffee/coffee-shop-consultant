"use client";

// TIM-965: Hiring & Onboarding Suite — multi-tab workspace.
// Backed by row-level DB tables; no autosave JSONB blob — all mutations hit
// dedicated API routes directly with optimistic local state updates.

import { useState, useCallback, useMemo } from "react";
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
  X,
  Check,
  ExternalLink,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import {
  type OrgRole,
  type InterviewCandidate,
  type InterviewQuestion,
  type InterviewScore,
  type OnboardingPlanInstance,
  type OnboardingTask,
  type StaffCompetency,
  type StaffFile,
  type CompetencyEvaluation,
  type HiringRoleStatus,
  type CandidateStatus,
  type OnboardingPhase,
  CANDIDATE_STATUS_CONFIG,
  CANDIDATE_STATUS_ORDER,
  ROLE_STATUS_CONFIG,
  PHASE_LABELS,
  PHASE_ORDER,
  DEFAULT_ONBOARDING_TASKS,
} from "@/lib/hiring";

type Tab = "org" | "interview" | "onboarding" | "competency";

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

interface JDPanel {
  role: OrgRole;
  jd: {
    title: string;
    summary: string;
    responsibilities: string;
    requirements: string;
    comp: string;
  };
}

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
  const [jdPanel, setJdPanel] = useState<JDPanel | null>(null);
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  const [improvingField, setImprovingField] = useState<string | null>(null);

  // Local JD state while panel is open
  const [jdFields, setJdFields] = useState<JDPanel["jd"] | null>(null);

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

  async function openJd(role: OrgRole) {
    setJdLoading(true);
    setJdError(null);
    const defaultJd = {
      title: role.role_title || "",
      summary: "",
      responsibilities: "",
      requirements: "",
      comp: "",
    };
    setJdPanel({ role, jd: defaultJd });
    setJdFields(defaultJd);

    if (role.jd_template_id) {
      try {
        const res = await fetch(
          `/api/workspaces/hiring/roles?planId=${planId}&jd_id=${role.jd_template_id}`
        );
        if (res.ok) {
          const data = await res.json();
          const loaded = {
            title: data.title ?? role.role_title,
            summary: data.summary ?? "",
            responsibilities: data.responsibilities ?? "",
            requirements: data.requirements ?? "",
            comp: data.comp ?? "",
          };
          setJdFields(loaded);
          setJdPanel({ role, jd: loaded });
        }
      } catch {
        setJdError("Could not load job description.");
      }
    }
    setJdLoading(false);
  }

  async function saveJd() {
    if (!jdPanel || !jdFields) return;
    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: jdPanel.role.id,
        jd: jdFields,
      }),
    });
    if (res.ok) {
      const updated = (await res.json()) as OrgRole;
      onRolesChange((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    setJdPanel(null);
    setJdFields(null);
  }

  async function improveJdField(field: keyof JDPanel["jd"]) {
    if (!jdPanel || !jdFields) return;
    setImprovingField(field);
    try {
      const res = await fetch("/api/workspaces/hiring/improve-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          content: jdFields[field],
          roleTitle: jdPanel.role.role_title,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { rewrite: string };
        setJdFields((prev) => prev ? { ...prev, [field]: data.rewrite } : prev);
      }
    } finally {
      setImprovingField(null);
    }
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
                role={role}
                roles={roles}
                canEdit={canEdit}
                isEditing={editingId === role.id}
                onToggleEdit={() =>
                  setEditingId(editingId === role.id ? null : role.id)
                }
                onUpdate={(patch) => updateRole(role.id, patch)}
                onDelete={() => deleteRole(role.id)}
                onViewJd={() => openJd(role)}
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

      {/* JD slide-over */}
      {jdPanel && jdFields && (
        <div className="fixed inset-0 z-40 flex">
          <button
            type="button"
            aria-label="Close panel"
            className="flex-1 bg-black/30"
            onClick={() => { setJdPanel(null); setJdFields(null); }}
          />
          <div className="w-full max-w-lg bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#efefef] flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">
                  Job Description
                </p>
                <p className="text-xs text-[#6b6b6b]">{jdPanel.role.role_title || "Unnamed role"}</p>
              </div>
              <button
                type="button"
                onClick={() => { setJdPanel(null); setJdFields(null); }}
                className="text-[#afafaf] hover:text-[#1a1a1a] p-1"
              >
                <X size={16} />
              </button>
            </div>

            {jdLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-[#afafaf]">Loading...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {jdError && (
                  <p className="text-sm text-[#a13d3d]">{jdError}</p>
                )}
                {(
                  [
                    { key: "title", label: "Title", multiline: false },
                    { key: "summary", label: "Summary", multiline: true },
                    { key: "responsibilities", label: "Responsibilities", multiline: true },
                    { key: "requirements", label: "Requirements", multiline: true },
                    { key: "comp", label: "Compensation & Benefits", multiline: true },
                  ] as Array<{ key: keyof JDPanel["jd"]; label: string; multiline: boolean }>
                ).map(({ key, label, multiline }) => (
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
                        value={jdFields[key]}
                        onChange={(e) =>
                          setJdFields((prev) => prev ? { ...prev, [key]: e.target.value } : prev)
                        }
                        disabled={!canEdit}
                      />
                    ) : (
                      <input
                        className={inputCls}
                        value={jdFields[key]}
                        onChange={(e) =>
                          setJdFields((prev) => prev ? { ...prev, [key]: e.target.value } : prev)
                        }
                        disabled={!canEdit}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <div className="px-6 py-4 border-t border-[#efefef] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setJdPanel(null); setJdFields(null); }}
                  className="text-sm text-[#6b6b6b] hover:text-[#1a1a1a]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveJd}
                  className="text-sm font-semibold bg-[#155e63] text-white px-5 py-2 rounded-lg hover:bg-[#0e4448] transition-colors"
                >
                  Save JD
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleRow({
  role,
  roles,
  canEdit,
  isEditing,
  onToggleEdit,
  onUpdate,
  onDelete,
  onViewJd,
}: {
  role: OrgRole;
  roles: OrgRole[];
  canEdit: boolean;
  isEditing: boolean;
  onToggleEdit: () => void;
  onUpdate: (patch: Partial<OrgRole>) => void;
  onDelete: () => void;
  onViewJd: () => void;
}) {
  const parentOptions = roles.filter((r) => r.id !== role.id);

  return (
    <div>
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
          onClick={onViewJd}
          className="flex items-center gap-1 text-xs text-[#155e63] hover:underline shrink-0"
        >
          JD <ExternalLink size={11} />
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
            <div>
              <label className={labelCls}>Monthly cost (USD)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                value={
                  role.monthly_cost_cents != null
                    ? Math.round(role.monthly_cost_cents / 100)
                    : ""
                }
                onChange={(e) =>
                  onUpdate({
                    monthly_cost_cents: e.target.value
                      ? Math.round(parseFloat(e.target.value) * 100)
                      : null,
                  })
                }
                placeholder="e.g. 3200"
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

  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const roleQuestions = questions.filter(
    (q) => q.role_id === selected?.role_id || q.role_id === null
  );

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
      : { id: makeLocalId(), candidate_id: candidateId, question_id: questionId, score, notes };
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
      body: JSON.stringify({ candidate_id: candidateId, question_id: questionId, score, notes }),
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
                  <CandidatePill status={c.status} />
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
              <div className="px-5 py-4 border-b border-[#efefef] flex items-center justify-between">
                <p className="text-sm font-semibold text-[#1a1a1a]">
                  Interview Scorecard
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="flex items-center gap-1 text-xs font-semibold text-[#155e63] hover:text-[#0e4448]"
                  >
                    <Plus size={13} />
                    Add question
                  </button>
                )}
              </div>

              {roleQuestions.length === 0 ? (
                <div className="py-8 text-center px-5">
                  <p className="text-sm text-[#afafaf]">
                    No questions yet. Add interview questions above.
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

  const selectedInstance = instances.find((i) => i.id === selectedId) ?? null;
  const instanceTasks = tasks.filter((t) => t.instance_id === selectedId);

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
                      {inst.start_date ? ` · Starts ${inst.start_date}` : ""}
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

            return (
              <div
                key={phase}
                className="rounded-xl border border-[#efefef] bg-white overflow-hidden"
              >
                <div className="px-5 py-3 border-b border-[#efefef] flex items-center justify-between bg-[#faf9f7]">
                  <p className="text-xs font-semibold text-[#155e63]">
                    {PHASE_LABELS[phase]}
                  </p>
                  <span className="text-[10px] text-[#afafaf]">
                    {phaseTasks.filter((t) => t.completed_at).length}/{phaseTasks.length} done
                  </span>
                </div>

                {phaseTasks.length === 0 ? (
                  <div className="px-5 py-3">
                    <p className="text-xs text-[#afafaf]">No tasks in this phase.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#f5f5f5]">
                    {phaseTasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-start gap-3 px-5 py-3"
                      >
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
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            className="w-16 text-xs border border-[#e0e0e0] rounded px-1.5 py-0.5 text-[#1a1a1a] text-center focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7]"
                            type="number"
                            min={0}
                            value={t.due_offset_days ?? ""}
                            onChange={(e) =>
                              updateTask(t.id, {
                                due_offset_days: e.target.value
                                  ? parseInt(e.target.value, 10)
                                  : null,
                              })
                            }
                            placeholder="Day"
                            title="Due offset (days from start)"
                            disabled={!canEdit}
                          />
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
                    ))}
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
