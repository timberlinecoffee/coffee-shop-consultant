"use client";

// TIM-2968: Drag-and-drop hierarchy list for the Org tab.
// TIM-3355: Rows now expand inline (renderExpandedPanel prop). onEditRole removed.

import {
  useState,
  useMemo,
  useRef,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Trash2,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { OrgRole } from "@/lib/hiring";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT, TABLE_ACTION_ICON_SIZE } from "@/lib/workspace-table";

// ── Types ─────────────────────────────────────────────────────────────────────

type FlatNode = {
  role: OrgRole;
  depth: number;
};

type DropResult = {
  parentId: string | null;
  orderIndex: number;
  batch: Array<{ id: string; parent_role_id: string | null; order_index: number }>;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const INDENT_PX = 24;
const INDENT_STEP = 20;
const MAX_DEPTH = 4;

// ── Tree utilities ────────────────────────────────────────────────────────────

function buildChildMap(roles: OrgRole[]): Map<string | null, OrgRole[]> {
  const m = new Map<string | null, OrgRole[]>();
  for (const r of roles) {
    const key = r.parent_role_id ?? null;
    const arr = m.get(key) ?? [];
    arr.push(r);
    m.set(key, arr);
  }
  for (const [key, arr] of m) {
    arr.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    m.set(key, arr);
  }
  return m;
}

function flattenTree(
  roles: OrgRole[],
  childMap: Map<string | null, OrgRole[]>
): FlatNode[] {
  const out: FlatNode[] = [];
  const visited = new Set<string>();

  function walk(id: string | null, depth: number) {
    const children = childMap.get(id) ?? [];
    for (const c of children) {
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      out.push({ role: c, depth });
      walk(c.id, depth + 1);
    }
  }

  walk(null, 0);
  for (const r of roles) {
    if (!visited.has(r.id)) out.push({ role: r, depth: 0 });
  }
  return out;
}

function subtreeIds(roleId: string, childMap: Map<string | null, OrgRole[]>): Set<string> {
  const out = new Set<string>([roleId]);
  const queue = [roleId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of childMap.get(id) ?? []) {
      if (!out.has(c.id)) {
        out.add(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

function computeDropResult(
  allRoles: OrgRole[],
  activeId: string,
  flatWithout: FlatNode[],
  insertBefore: number,
  proposedDepth: number
): DropResult | null {
  const prevNode = insertBefore > 0 ? flatWithout[insertBefore - 1] : null;
  const maxAllowed = prevNode ? prevNode.depth + 1 : 0;
  const depth = Math.max(0, Math.min(proposedDepth, maxAllowed, MAX_DEPTH));

  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = insertBefore - 1; i >= 0; i--) {
      if (flatWithout[i].depth === depth - 1) {
        parentId = flatWithout[i].role.id;
        break;
      }
      if (flatWithout[i].depth < depth - 1) break;
    }
    if (!parentId) return null;
  }

  const siblings = flatWithout.slice(0, insertBefore).filter(
    (n) => n.depth === depth && (
      depth === 0
        ? n.role.parent_role_id === null
        : n.role.parent_role_id === parentId
    )
  );
  const orderIndex = siblings.length;

  const dragged = allRoles.find((r) => r.id === activeId)!;
  const oldParentId = dragged.parent_role_id;

  const affected: Array<{ id: string; parent_role_id: string | null; order_index: number }> = [
    { id: activeId, parent_role_id: parentId, order_index: orderIndex },
  ];

  const newSiblings = flatWithout.filter(
    (n) =>
      n.depth === depth &&
      (depth === 0
        ? n.role.parent_role_id === null
        : n.role.parent_role_id === parentId)
  );
  newSiblings.forEach((n, idx) => {
    affected.push({
      id: n.role.id,
      parent_role_id: parentId,
      order_index: idx >= orderIndex ? idx + 1 : idx,
    });
  });

  if (oldParentId !== parentId) {
    const oldSiblings = flatWithout.filter(
      (n) =>
        (oldParentId === null
          ? n.depth === 0 && n.role.parent_role_id === null
          : n.role.parent_role_id === oldParentId)
    );
    oldSiblings.forEach((n, idx) => {
      if (!affected.find((a) => a.id === n.role.id)) {
        affected.push({ id: n.role.id, parent_role_id: oldParentId, order_index: idx });
      }
    });
  }

  const dedupedMap = new Map<string, typeof affected[0]>();
  for (const a of affected) dedupedMap.set(a.id, a);

  return { parentId, orderIndex, batch: Array.from(dedupedMap.values()) };
}

// ── Sortable row ──────────────────────────────────────────────────────────────

function OrgHierarchyRow({
  node,
  canEdit,
  isDragOverlay,
  proposedDepth,
  isKeyboardMoving,
  isExpanded,
  onToggleExpand,
  onDelete,
}: {
  node: FlatNode;
  canEdit: boolean;
  isDragOverlay?: boolean;
  proposedDepth?: number;
  isKeyboardMoving?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: (id: string) => void;
}) {
  const depth = isDragOverlay ? (proposedDepth ?? node.depth) : node.depth;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.role.id, disabled: !canEdit });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : undefined,
      };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      role="row"
      aria-label={`${node.role.role_title || "Unnamed role"}, depth ${depth}`}
      className={[
        "flex items-center border-b border-[var(--neutral-cool-100)] last:border-b-0 bg-white group select-none",
        isDragOverlay
          ? "rounded-lg border border-[var(--teal)] shadow-md opacity-95 z-50"
          : "",
        isKeyboardMoving ? "ring-2 ring-[var(--teal)] ring-inset" : "",
        isDragging ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag grip */}
      {canEdit ? (
        <button
          {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
          type="button"
          aria-label="Drag to reorder"
          tabIndex={-1}
          className="pl-3 pr-1 py-3 text-[var(--neutral-cool-400)] opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical size={14} />
        </button>
      ) : (
        <div className="w-3 shrink-0" aria-hidden />
      )}

      {/* Depth indent + indicator */}
      {depth > 0 && (
        <div
          aria-hidden
          className="shrink-0 flex items-center justify-end pr-1"
          style={{ width: `${(depth - 1) * INDENT_PX + 10}px` }}
        >
          <ChevronRight size={10} className="text-[var(--neutral-cool-300)]" />
        </div>
      )}

      {/* Main content — clickable to expand */}
      <button
        type="button"
        onClick={isDragOverlay ? undefined : onToggleExpand}
        aria-expanded={!isDragOverlay ? isExpanded : undefined}
        tabIndex={isDragOverlay ? -1 : 0}
        className="flex-1 min-w-0 flex items-center gap-2 py-2.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--teal)] rounded-sm"
      >
        <span className="flex-1 min-w-0">
          {node.role.role_title ? (
            <span className={`${TABLE_CELL_TEXT} font-medium block truncate`}>
              {node.role.role_title}
            </span>
          ) : (
            <span className={`${TABLE_CELL_TEXT} font-medium block truncate italic text-[var(--dark-grey)]`}>
              Unnamed role
            </span>
          )}
          <span className="text-[11px] text-[var(--muted-foreground)] block">
            ×{node.role.headcount}
          </span>
        </span>

        {/* Depth badge in overlay */}
        {isDragOverlay && proposedDepth !== undefined && (
          <span className="text-[10px] font-medium text-white bg-[var(--teal)] rounded px-1.5 py-0.5 shrink-0">
            Level {proposedDepth}
          </span>
        )}

        {/* Expand chevron */}
        {!isDragOverlay && (
          <span className="shrink-0 text-[var(--dark-grey)] mr-1" aria-hidden>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>

      {/* Delete */}
      {canEdit && !isDragOverlay && (
        <button
          type="button"
          aria-label={`Delete ${node.role.role_title || "role"}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.role.id);
          }}
          className="p-2 mr-2 rounded text-[var(--dark-grey)] opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)] hover:bg-[var(--destructive-muted)] transition-colors shrink-0"
        >
          <Trash2 size={TABLE_ACTION_ICON_SIZE} />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrgHierarchyList({
  planId,
  roles,
  canEdit,
  onRolesChange,
  onDeleteRole,
  expandedRoleId,
  onExpandChange,
  renderExpandedPanel,
}: {
  planId: string;
  roles: OrgRole[];
  canEdit: boolean;
  onRolesChange: (updated: OrgRole[]) => void;
  onDeleteRole: (id: string) => void;
  expandedRoleId?: string | null;
  onExpandChange?: (id: string | null) => void;
  renderExpandedPanel?: (role: OrgRole) => ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deltaX, setDeltaX] = useState(0);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{
    result: DropResult;
    activeId: string;
  } | null>(null);

  // Keyboard move mode state
  const [kbMovingId, setKbMovingId] = useState<string | null>(null);
  const [kbSnapshot, setKbSnapshot] = useState<OrgRole[] | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const childMap = useMemo(() => buildChildMap(roles), [roles]);
  const flatNodes = useMemo(() => flattenTree(roles, childMap), [roles, childMap]);

  const activeNode = activeId
    ? flatNodes.find((n) => n.role.id === activeId) ?? null
    : null;

  const originalDepth = activeNode?.depth ?? 0;
  const proposedDepth = useMemo(() => {
    if (!activeId) return 0;
    const depthDelta = Math.round(deltaX / INDENT_STEP);
    return Math.max(0, Math.min(originalDepth + depthDelta, MAX_DEPTH));
  }, [activeId, deltaX, originalDepth]);

  const sortableIds = useMemo(() => flatNodes.map((n) => n.role.id), [flatNodes]);

  const hierarchyWarning = useMemo(() => {
    if (!activeId || overIndex === null) return null;
    const dragged = roles.find((r) => r.id === activeId);
    if (!dragged?.parent_role_id) return null;
    const parentIdx = flatNodes.findIndex((n) => n.role.id === dragged.parent_role_id);
    const activeIdx = flatNodes.findIndex((n) => n.role.id === activeId);
    if (parentIdx === -1) return null;
    const targetIdx = overIndex;
    if (targetIdx <= parentIdx && activeIdx > parentIdx) {
      return `"${dragged.role_title || "This role"}" currently reports to "${
        roles.find((r) => r.id === dragged.parent_role_id)?.role_title || "its manager"
      }". Moving above their manager looks unusual.`;
    }
    return null;
  }, [activeId, overIndex, flatNodes, roles]);

  const cycleGuard = useMemo(() => {
    if (!activeId) return new Set<string>();
    return subtreeIds(activeId, childMap);
  }, [activeId, childMap]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
    setDeltaX(0);
    const idx = flatNodes.findIndex((n) => n.role.id === active.id);
    setOverIndex(idx);
    // Close expanded panel while dragging to keep layout clean
    if (onExpandChange) onExpandChange(null);
  }

  function handleDragMove({ delta }: DragMoveEvent) {
    setDeltaX(delta.x);
  }

  function handleDragOver({ over }: DragOverEvent) {
    if (!over) return;
    const idx = flatNodes.findIndex((n) => n.role.id === over.id);
    if (idx !== -1) setOverIndex(idx);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const id = active.id as string;

    if (!over || over.id === active.id) {
      setActiveId(null);
      setDeltaX(0);
      setOverIndex(null);
      return;
    }

    const activeIdx = flatNodes.findIndex((n) => n.role.id === id);
    const overIdx = flatNodes.findIndex((n) => n.role.id === over.id);

    const flatWithout = flatNodes.filter((n) => n.role.id !== id);
    const insertBefore = flatWithout.findIndex((n) => n.role.id === over.id);
    const insertAt = overIdx > activeIdx ? insertBefore + 1 : insertBefore;

    if (cycleGuard.has(over.id as string)) {
      setActiveId(null);
      setDeltaX(0);
      setOverIndex(null);
      return;
    }

    const result = computeDropResult(roles, id, flatWithout, insertAt, proposedDepth);
    if (!result) {
      setActiveId(null);
      setDeltaX(0);
      setOverIndex(null);
      return;
    }

    if (hierarchyWarning) {
      setPendingDrop({ result, activeId: id });
      setActiveId(null);
      setDeltaX(0);
      setOverIndex(null);
      return;
    }

    applyDrop(id, result);
    setActiveId(null);
    setDeltaX(0);
    setOverIndex(null);
  }

  function handleDragCancel(_e: DragCancelEvent) {
    setActiveId(null);
    setDeltaX(0);
    setOverIndex(null);
  }

  async function applyDrop(draggedId: string, result: DropResult) {
    const snapshot = roles;

    const updated = roles.map((r) => {
      const patch = result.batch.find((b) => b.id === r.id);
      if (!patch) return r;
      return { ...r, parent_role_id: patch.parent_role_id, order_index: patch.order_index };
    });
    onRolesChange(updated);

    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: result.batch }),
    });

    if (!res.ok) {
      onRolesChange(snapshot);
    }
  }

  // ── Keyboard move mode ────────────────────────────────────────────────────

  function enterKbMove(id: string) {
    setKbMovingId(id);
    setKbSnapshot(roles);
  }

  function cancelKbMove() {
    if (kbSnapshot) onRolesChange(kbSnapshot);
    setKbMovingId(null);
    setKbSnapshot(null);
  }

  async function confirmKbMove() {
    setKbMovingId(null);
    setKbSnapshot(null);
    const flat = flattenTree(roles, buildChildMap(roles));
    const batch = flat.map((n, idx) => ({
      id: n.role.id,
      parent_role_id: n.role.parent_role_id,
      order_index: flat
        .slice(0, idx)
        .filter((m) => m.role.parent_role_id === n.role.parent_role_id && m.depth === n.depth)
        .length,
    }));
    const snapshot = roles;
    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch }),
    });
    if (!res.ok) onRolesChange(snapshot);
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLDivElement>, id: string) {
    if (!canEdit) return;

    if (!kbMovingId) {
      if (e.key === " " || e.key === "Enter") {
        // Space/Enter on the wrapper div: enter keyboard move mode only if
        // the target is the wrapper, not a child button (child buttons handle their own keys)
        if ((e.target as HTMLElement).tagName !== "BUTTON") {
          e.preventDefault();
          enterKbMove(id);
        }
      }
      return;
    }

    if (kbMovingId !== id) return;

    const flat = flattenTree(roles, buildChildMap(roles));
    const idx = flat.findIndex((n) => n.role.id === id);
    if (idx === -1) return;

    if (e.key === "Escape") {
      e.preventDefault();
      cancelKbMove();
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      if ((e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        confirmKbMove();
        return;
      }
    }

    if (e.key === "ArrowUp" && idx > 0) {
      e.preventDefault();
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const insertAt = Math.max(0, idx - 1);
      const result = computeDropResult(roles, id, flatWithout, insertAt, flat[idx].depth);
      if (result) applyDrop(id, result);
      return;
    }

    if (e.key === "ArrowDown" && idx < flat.length - 1) {
      e.preventDefault();
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const insertAt = Math.min(flatWithout.length, idx + 1);
      const result = computeDropResult(roles, id, flatWithout, insertAt, flat[idx].depth);
      if (result) applyDrop(id, result);
      return;
    }

    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const result = computeDropResult(roles, id, flatWithout, idx, flat[idx].depth + 1);
      if (result) applyDrop(id, result);
      return;
    }

    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      if (flat[idx].depth === 0) return;
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const result = computeDropResult(roles, id, flatWithout, idx, flat[idx].depth - 1);
      if (result) applyDrop(id, result);
      return;
    }
  }

  if (roles.length === 0) {
    return null;
  }

  return (
    <div>
      {/* Hierarchy inversion confirmation banner */}
      {pendingDrop && (
        <div className="px-4 py-3 flex items-start gap-3 bg-amber-50 border-b border-amber-200">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className={`${TABLE_CELL_TEXT} text-amber-800 font-medium`}>
              {hierarchyWarning ?? "This move may create an unusual hierarchy."}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingDrop(null)}
              className="text-[10px] font-medium text-amber-700 hover:text-amber-900 underline"
            >
              Keep position
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingDrop) applyDrop(pendingDrop.activeId, pendingDrop.result);
                setPendingDrop(null);
              }}
              className="text-[10px] font-medium text-amber-700 hover:text-amber-900 underline"
            >
              Move anyway
            </button>
          </div>
        </div>
      )}

      {/* Keyboard move mode instructions */}
      {kbMovingId && (
        <div className="px-4 py-2 bg-[var(--teal-muted)] border-b border-[var(--teal)] flex items-center gap-2">
          <span className={`${TABLE_CELL_TEXT} text-[var(--teal-dark)] font-medium`}>
            Move mode — ↑↓ to move · Alt+→ to indent · Alt+← to outdent · Enter to confirm · Esc to cancel
          </span>
        </div>
      )}

      {/* Table header */}
      <div
        role="row"
        className="flex items-center h-8 px-3 border-b border-[var(--neutral-cool-200)] bg-[var(--neutral-cool-50)]"
      >
        {canEdit && <div className="w-7 shrink-0" aria-hidden />}
        <div className={`flex-1 ${TABLE_HEADER_TEXT} text-[var(--neutral-cool-500)]`}>
          Role
        </div>
        {canEdit && (
          <div className={`w-10 shrink-0 ${TABLE_HEADER_TEXT} text-[var(--neutral-cool-500)] pr-2`} />
        )}
      </div>

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div
            ref={listRef}
            role="grid"
            aria-label="Role hierarchy"
          >
            {flatNodes.map((node) => (
              <div key={node.role.id}>
                <div
                  role="row"
                  tabIndex={canEdit ? 0 : -1}
                  aria-label={`${node.role.role_title || "Unnamed role"}, level ${node.depth + 1}`}
                  onKeyDown={(e) => handleRowKeyDown(e, node.role.id)}
                >
                  <OrgHierarchyRow
                    node={node}
                    canEdit={canEdit}
                    isKeyboardMoving={kbMovingId === node.role.id}
                    isExpanded={expandedRoleId === node.role.id}
                    onToggleExpand={() =>
                      onExpandChange?.(expandedRoleId === node.role.id ? null : node.role.id)
                    }
                    onDelete={onDeleteRole}
                  />
                </div>
                {expandedRoleId === node.role.id && renderExpandedPanel && (
                  <div className="border-b border-[var(--neutral-cool-100)]">
                    {renderExpandedPanel(node.role)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeNode && (
            <div className="shadow-xl rounded-lg overflow-hidden">
              <OrgHierarchyRow
                node={activeNode}
                canEdit={false}
                isDragOverlay
                proposedDepth={proposedDepth}
                isExpanded={false}
                onToggleExpand={() => {}}
                onDelete={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
