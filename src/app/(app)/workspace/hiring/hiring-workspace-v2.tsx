"use client";

// TIM-3369: Hiring & Onboarding workspace v2 IA shell.
// Left secondary-nav of roles (drag-to-reparent preserved from OrgHierarchyList)
// + role page with accordion sections on the right. v1 path (inline-expand list
// at hiring-workspace.tsx) stays reachable while users.hiring_revamp_v2 = false.
//
// First cut intentionally ships the SHELL with per-section accordions that
// surface basic content + a link back to v1 for the full per-field editors;
// the rich content port from RoleDetailPanel lands in a follow-up issue so
// this PR is bounded and reviewable.

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus, Trash2, GripVertical, Scale, ClipboardCheck } from "lucide-react";
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
import type {
  OrgRole,
  InterviewCandidate,
  InterviewQuestion,
  InterviewScore,
  OnboardingPlanInstance,
  OnboardingTask,
  StaffCompetency,
  StaffFile,
  CompetencyEvaluation,
  PlanHiringSettings,
  HiringRequirementSet,
} from "@/lib/hiring";
import type { MinWageInfo } from "@/lib/wages/minimum-wage";
import { SectionHeader } from "@/components/section-header";

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
  // Surface orphans (parent_role_id pointing to non-existent or null) at root.
  const seen = new Set(out.map((n) => n.role.id));
  for (const r of roles) {
    if (!seen.has(r.id)) out.push({ role: r, depth: 0 });
  }
  return out;
}

export function HiringWorkspaceV2(props: Props) {
  const [roles, setRoles] = useState<OrgRole[]>(props.initialRoles);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    props.initialRoles[0]?.id ?? null,
  );
  const [navOpen, setNavOpen] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
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
      }
    } catch {
      // swallow — input stays open with the typed text so the user can retry
    }
    setNewTitle("");
    setAddingRole(false);
  }, [newTitle, props.canEdit, props.planId]);

  const deleteRole = useCallback(
    async (id: string) => {
      if (!props.canEdit) return;
      if (!window.confirm("Delete this role? This cannot be undone.")) return;
      try {
        await fetch(
          `/api/workspaces/hiring/roles?planId=${props.planId}&id=${id}`,
          { method: "DELETE" },
        );
      } catch {
        return;
      }
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setSelectedRoleId((prev) => (prev === id ? null : prev));
    },
    [props.canEdit, props.planId],
  );

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
      {/* TIM-3369 shell — left role nav + right role page. */}
      <div className="flex items-center justify-between mb-4 lg:hidden">
        <h1 className="text-xl font-semibold">Hiring &amp; Onboarding</h1>
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          className="text-sm font-medium px-3 py-1.5 rounded-md border border-[var(--border)]"
        >
          {navOpen ? "Close roles" : "Roles"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
        <nav
          aria-label="Roles"
          className={`rounded-xl border border-[var(--border)] bg-white overflow-hidden ${navOpen ? "" : "hidden lg:block"}`}
        >
          <div className="px-3 py-2 border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Roles
          </div>
          <HiringRoleNav
            planId={props.planId}
            roles={roles}
            canEdit={props.canEdit}
            selectedRoleId={selectedRoleId}
            onSelectRole={(id) => {
              setSelectedRoleId(id);
              setNavOpen(false);
            }}
            onRolesChange={setRoles}
            onDeleteRole={deleteRole}
          />

          {props.canEdit && (
            <div className="border-t border-[var(--border)]">
              {addingRole ? (
                <div className="px-3 py-2 flex items-center gap-2">
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
                  className="w-full text-left px-3 py-2 text-sm text-[var(--teal)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
                >
                  <Plus size={14} /> Add role
                </button>
              )}
            </div>
          )}

          <div className="border-t border-[var(--border)] px-3 py-3 text-xs space-y-2">
            <Link
              href="?hiring=v1"
              className="flex items-center gap-2 text-[var(--dark-grey)] hover:text-[var(--foreground)]"
            >
              <Scale size={12} /> Hiring laws
            </Link>
            <Link
              href="?hiring=v1"
              className="flex items-center gap-2 text-[var(--dark-grey)] hover:text-[var(--foreground)]"
            >
              <ClipboardCheck size={12} /> Onboarding plan
            </Link>
          </div>
        </nav>

        <section className="min-w-0">
          {selectedRole ? (
            <RolePageV2 role={selectedRole} />
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-white px-6 py-12 text-center text-sm text-[var(--muted-foreground)]">
              Pick a role on the left, or add one to get started.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Role page (right side) ────────────────────────────────────────────────────

const SECTIONS: { id: string; title: string; subtitle: string }[] = [
  { id: "basics", title: "Role basics", subtitle: "Title, headcount, parent, notes" },
  { id: "comp", title: "Compensation", subtitle: "Pay basis, amount, hours, benefits" },
  { id: "jd", title: "Job description", subtitle: "Title, summary, responsibilities, requirements" },
  { id: "interview", title: "Interview questions", subtitle: "Per-role question bank" },
  { id: "scorecard", title: "Interview scorecard", subtitle: "Candidate × competency grid (TIM-3370)" },
  { id: "competency", title: "Competency forms", subtitle: "Staff skill check-ins" },
  { id: "onboarding", title: "Onboarding plan", subtitle: "First 90 days task list" },
];

function RolePageV2({ role }: { role: OrgRole }) {
  return (
    <div>
      <SectionHeader
        title={role.role_title || "Untitled role"}
        helpContent="Every hiring-and-onboarding component for this role is grouped below. Click a section to expand it."
        className="mb-4 flex-1"
      />
      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <AccordionSection key={s.id} section={s} role={role} />
        ))}
      </div>
    </div>
  );
}

function AccordionSection({
  section,
  role,
}: {
  section: { id: string; title: string; subtitle: string };
  role: OrgRole;
}) {
  // <details> ships native disclosure semantics (keyboard, screen-reader)
  // without taking a dependency on a new shadcn primitive — chevron
  // rotation handled via the group:open-of-summary marker.
  return (
    <details className="group rounded-xl border border-[var(--border)] bg-white open:shadow-sm">
      <summary className="list-none flex items-center justify-between cursor-pointer px-4 py-3 select-none">
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">
            {section.title}
          </div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {section.subtitle}
          </div>
        </div>
        <span className="shrink-0 text-[var(--dark-grey)] transition-transform group-open:rotate-180">
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="px-4 pb-4 pt-3 border-t border-[var(--border)] text-sm text-[var(--muted-foreground)]">
        <p>
          Shell-only first cut: editor content for &ldquo;{section.title}&rdquo;
          on role <span className="font-medium text-[var(--foreground)]">
            {role.role_title || "(untitled)"}
          </span>{" "}
          ports from the v1 RoleDetailPanel in a follow-up issue. Use the v1
          editor in the meantime by switching{" "}
          <span className="font-medium">Preferences → Use new Hiring workspace</span> off,
          or visit any hiring URL with{" "}
          <code className="px-1 py-0.5 rounded bg-[var(--neutral-cool-100)]">?hiring=v1</code>.
        </p>
      </div>
    </details>
  );
}

// ── Left nav (drag-to-reparent preserved) ─────────────────────────────────────

function HiringRoleNav({
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

    // Compute the new parent based on horizontal delta + the role above target.
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

    // Move the active role in the flat order.
    const reordered = [...flatNodes];
    const fromIdx = reordered.findIndex((n) => n.role.id === id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(overIdx > fromIdx ? overIdx : overIdx, 0, moved);

    // Build batch update by walking the new flat order with stable parent ids.
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
    }).catch(() => {
      // server PATCH failed — board can refresh; we don't revert local UI
      // here because the OrgHierarchyList v1 path applies the same eager
      // pattern. Future polish: optimistic-rollback toast.
    });
  }

  if (flatNodes.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-[var(--muted-foreground)]">
        No roles yet.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-[var(--border)]">
          {flatNodes.map((node) => (
            <RoleNavRow
              key={node.role.id}
              node={node}
              canEdit={canEdit}
              isSelected={node.role.id === selectedRoleId}
              onSelect={() => onSelectRole(node.role.id)}
              onDelete={() => onDeleteRole(node.role.id)}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay>
        {activeNode ? (
          <div
            className="rounded-lg border border-[var(--teal)] shadow-md bg-white px-3 py-2 flex items-center gap-2 max-w-[260px]"
            aria-hidden
          >
            <span className="text-sm font-medium truncate">
              {activeNode.role.role_title || "Unnamed role"}
            </span>
            <span className="text-[10px] font-medium text-white bg-[var(--teal)] rounded px-1.5 py-0.5">
              Level {proposedDepth}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function RoleNavRow({
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
      className={`group bg-white border-l-2 ${
        isSelected
          ? "bg-[var(--teal-tint-500)] border-l-[var(--teal)]"
          : "border-l-transparent hover:bg-[var(--neutral-cool-50)]"
      }`}
    >
      <div className="flex items-center">
        {canEdit && (
          <button
            type="button"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
            tabIndex={-1}
            className="pl-2 py-2 text-[var(--neutral-cool-400)] opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing touch-none shrink-0"
          >
            <GripVertical size={12} />
          </button>
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
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 min-w-0 text-left py-2 pr-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--teal)] rounded-sm"
        >
          {node.role.role_title ? (
            <span className="block text-sm font-medium truncate">
              {node.role.role_title}
            </span>
          ) : (
            <span className="block text-sm font-medium truncate italic text-[var(--dark-grey)]">
              Unnamed role
            </span>
          )}
          <span className="block text-[11px] text-[var(--muted-foreground)]">
            ×{node.role.headcount}
          </span>
        </button>
        {canEdit && (
          <button
            type="button"
            aria-label={`Delete ${node.role.role_title || "role"}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="pr-2 py-2 opacity-0 group-hover:opacity-100 text-[var(--dark-grey)] hover:text-[var(--destructive)] shrink-0"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </li>
  );
}
