"use client";

// TIM-2968: Drag-and-drop hierarchy list for the Org tab.
// Primary edit surface for role structure. Read-only tree diagram is preserved
// above this component in OrgTab (no regression against TIM-1900).
//
// Spec: TIM-2967 accepted plan document.

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
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
import { GripVertical, Pencil, Trash2, AlertTriangle, ChevronRight } from "lucide-react";
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

const INDENT_PX = 24;         // px per depth level
const INDENT_STEP = 20;       // px delta.x per depth change
const MAX_DEPTH = 4;          // safeguard; spec allows ~3 levels for a coffee shop

// ── Tree utilities ────────────────────────────────────────────────────────────

function buildChildMap(roles: OrgRole[]): Map<string | null, OrgRole[]> {
  const m = new Map<string | null, OrgRole[]>();
  for (const r of roles) {
    const key = r.parent_role_id ?? null;
    const arr = m.get(key) ?? [];
    arr.push(r);
    m.set(key, arr);
  }
  // Sort each group by order_index then created_at fallback
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
  // Orphans (parent set but parent missing) appended at root level
  for (const r of roles) {
    if (!visited.has(r.id)) out.push({ role: r, depth: 0 });
  }
  return out;
}

/**
 * Returns all descendant IDs of a given role (inclusive of the role itself).
 */
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

/**
 * Computes the new parent + order_index after a drag operation.
 *
 * @param flatWithout - flat list with the dragged item removed
 * @param insertBefore - index in flatWithout where the item lands (flatWithout.length = append at end)
 * @param proposedDepth - desired depth level (0 = root)
 */
function computeDropResult(
  allRoles: OrgRole[],
  activeId: string,
  flatWithout: FlatNode[],
  insertBefore: number,
  proposedDepth: number
): DropResult | null {
  // Clamp depth: can't be deeper than (depth of prev node + 1)
  const prevNode = insertBefore > 0 ? flatWithout[insertBefore - 1] : null;
  const maxAllowed = prevNode ? prevNode.depth + 1 : 0;
  const depth = Math.max(0, Math.min(proposedDepth, maxAllowed, MAX_DEPTH));

  // Find parent at depth - 1
  let parentId: string | null = null;
  if (depth > 0) {
    // Walk backwards from insertBefore - 1 to find nearest node at depth - 1
    for (let i = insertBefore - 1; i >= 0; i--) {
      if (flatWithout[i].depth === depth - 1) {
        parentId = flatWithout[i].role.id;
        break;
      }
      if (flatWithout[i].depth < depth - 1) break;
    }
    if (!parentId) return null; // can't determine parent — skip
  }

  // Compute new order_index among siblings at the insertion point
  const siblings = flatWithout.slice(0, insertBefore).filter(
    (n) => n.depth === depth && (
      depth === 0
        ? n.role.parent_role_id === null
        : n.role.parent_role_id === parentId
    )
  );
  const orderIndex = siblings.length;

  // Rebuild full role list to compute the complete batch
  // Insert dragged role at position, then reindex all siblings in old + new parent groups
  const dragged = allRoles.find((r) => r.id === activeId)!;
  const oldParentId = dragged.parent_role_id;

  const affected: Array<{ id: string; parent_role_id: string | null; order_index: number }> = [
    { id: activeId, parent_role_id: parentId, order_index: orderIndex },
  ];

  // Re-index new parent siblings (after insertion)
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

  // Re-index old parent siblings (after removal)
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

  // Deduplicate — last entry wins
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
  onEdit,
  onDelete,
}: {
  node: FlatNode;
  canEdit: boolean;
  isDragOverlay?: boolean;
  proposedDepth?: number;
  isKeyboardMoving?: boolean;
  onEdit: (id: string) => void;
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
    isSorting,
  } = useSortable({ id: node.role.id, disabled: !canEdit });

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : undefined,
      };

  const indentStyle = { paddingLeft: `${depth * INDENT_PX + 12}px` };

  const roleTitle = node.role.role_title || (
    <span className="italic text-[var(--dark-grey)]">Unnamed role</span>
  );

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      role="row"
      aria-label={`${node.role.role_title || "Unnamed role"}, depth ${depth}`}
      className={[
        "flex items-center gap-2 h-9 select-none border-b border-[var(--neutral-cool-100)] last:border-b-0 bg-white group",
        isDragOverlay
          ? "rounded-lg border border-[var(--teal)] shadow-md opacity-95 z-50"
          : "",
        isKeyboardMoving ? "ring-2 ring-[var(--teal)] ring-inset" : "",
        isDragging ? "pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Indent guides */}
      <div className="flex items-center shrink-0" style={indentStyle}>
        {canEdit && (
          <button
            {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
            type="button"
            aria-label="Drag to reorder"
            tabIndex={-1}
            className="p-0.5 text-[var(--neutral-cool-400)] opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical size={14} />
          </button>
        )}
      </div>

      {/* Role title */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        {depth > 0 && (
          <ChevronRight
            size={10}
            className="shrink-0 text-[var(--neutral-cool-300)]"
            aria-hidden
          />
        )}
        <span className={`${TABLE_CELL_TEXT} truncate font-medium`}>{roleTitle}</span>
      </div>

      {/* Headcount */}
      <div className="w-14 shrink-0 text-right">
        <span className={`${TABLE_CELL_TEXT} text-[var(--dark-grey)]`}>
          ×{node.role.headcount}
        </span>
      </div>

      {/* Depth badge — only in overlay */}
      {isDragOverlay && proposedDepth !== undefined && (
        <div className="shrink-0 mr-1">
          <span className="text-[10px] font-medium text-white bg-[var(--teal)] rounded px-1.5 py-0.5">
            Level {proposedDepth}
          </span>
        </div>
      )}

      {/* Actions */}
      {canEdit && !isDragOverlay && (
        <div className="flex items-center gap-0.5 pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Edit ${node.role.role_title || "role"}`}
            onClick={() => onEdit(node.role.id)}
            className="p-1 rounded text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors touch-target"
          >
            <Pencil size={TABLE_ACTION_ICON_SIZE} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${node.role.role_title || "role"}`}
            onClick={() => onDelete(node.role.id)}
            className="p-1 rounded text-[var(--dark-grey)] hover:text-[var(--destructive)] hover:bg-[var(--destructive-muted)] transition-colors touch-target"
          >
            <Trash2 size={TABLE_ACTION_ICON_SIZE} />
          </button>
        </div>
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
  onEditRole,
  onDeleteRole,
}: {
  planId: string;
  roles: OrgRole[];
  canEdit: boolean;
  onRolesChange: (updated: OrgRole[]) => void;
  onEditRole: (id: string) => void;
  onDeleteRole: (id: string) => void;
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

  // Active node for drag overlay
  const activeNode = activeId
    ? flatNodes.find((n) => n.role.id === activeId) ?? null
    : null;

  // Proposed depth during drag (delta.x / INDENT_STEP + original depth)
  const originalDepth = activeNode?.depth ?? 0;
  const proposedDepth = useMemo(() => {
    if (!activeId) return 0;
    const depthDelta = Math.round(deltaX / INDENT_STEP);
    return Math.max(0, Math.min(originalDepth + depthDelta, MAX_DEPTH));
  }, [activeId, deltaX, originalDepth]);

  // Insertion index in flat list (for drop result computation)
  const insertIndex = useMemo(() => {
    if (activeId === null || overIndex === null) return flatNodes.length;
    // overIndex is the index of the "over" item; we insert before it
    const activeIdx = flatNodes.findIndex((n) => n.role.id === activeId);
    if (overIndex > activeIdx) return overIndex; // dropping below active
    return overIndex;
  }, [activeId, overIndex, flatNodes]);

  // IDs for SortableContext
  const sortableIds = useMemo(() => flatNodes.map((n) => n.role.id), [flatNodes]);

  // Hierarchy inversion check: would the drop move the dragged role to a position
  // that is ABOVE its current direct manager (parent)?
  const hierarchyWarning = useMemo(() => {
    if (!activeId || overIndex === null) return null;
    const dragged = roles.find((r) => r.id === activeId);
    if (!dragged?.parent_role_id) return null;
    const parentIdx = flatNodes.findIndex((n) => n.role.id === dragged.parent_role_id);
    const activeIdx = flatNodes.findIndex((n) => n.role.id === activeId);
    if (parentIdx === -1) return null;
    // Warning if dragged item would land above its current parent
    const targetIdx = overIndex;
    if (targetIdx <= parentIdx && activeIdx > parentIdx) {
      return `"${dragged.role_title || "This role"}" currently reports to "${
        roles.find((r) => r.id === dragged.parent_role_id)?.role_title || "its manager"
      }". Moving above their manager looks unusual.`;
    }
    return null;
  }, [activeId, overIndex, flatNodes, roles]);

  // Cycle guard: cannot reparent a role under one of its own descendants
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
    // insertBefore: the over item's index in flatWithout
    const insertBefore = flatWithout.findIndex((n) => n.role.id === over.id);
    const insertAt = overIdx > activeIdx ? insertBefore + 1 : insertBefore;

    // Cycle guard: can't drop under own descendant
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
      // Show confirmation banner before applying
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

    // Optimistic update
    const updated = roles.map((r) => {
      const patch = result.batch.find((b) => b.id === r.id);
      if (!patch) return r;
      return { ...r, parent_role_id: patch.parent_role_id, order_index: patch.order_index };
    });
    onRolesChange(updated);

    // Persist
    const res = await fetch(`/api/workspaces/hiring/roles?planId=${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch: result.batch }),
    });

    if (!res.ok) {
      // Rollback
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
    // Current roles state already reflects the keyboard moves; persist them
    const movingRole = roles.find((r) => r.id === kbMovingId);
    if (!movingRole) return;
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
        e.preventDefault();
        enterKbMove(id);
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
      e.preventDefault();
      confirmKbMove();
      return;
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
      // Indent: nest under row above
      e.preventDefault();
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const insertAt = idx;
      const result = computeDropResult(roles, id, flatWithout, insertAt, flat[idx].depth + 1);
      if (result) applyDrop(id, result);
      return;
    }

    if (e.altKey && e.key === "ArrowLeft") {
      // Outdent: promote to parent's level
      e.preventDefault();
      if (flat[idx].depth === 0) return;
      const flatWithout = flat.filter((n) => n.role.id !== id);
      const insertAt = idx;
      const result = computeDropResult(roles, id, flatWithout, insertAt, flat[idx].depth - 1);
      if (result) applyDrop(id, result);
      return;
    }
  }

  // ── Hierarchy inversion banner ────────────────────────────────────────────

  // (pendingDrop triggers the amber confirmation UI)

  if (roles.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className={`${TABLE_CELL_TEXT} text-[var(--dark-grey)]`}>
          No roles yet. Add your first role above.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Hierarchy inversion confirmation banner */}
      {pendingDrop && (
        <div className="mx-0 mb-0 px-4 py-3 flex items-start gap-3 bg-amber-50 border-b border-amber-200">
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
        className="flex items-center gap-2 h-8 px-3 border-b border-[var(--neutral-cool-200)] bg-[var(--neutral-cool-50)]"
      >
        {canEdit && <div className="w-5 shrink-0" aria-hidden />}
        <div className={`flex-1 ${TABLE_HEADER_TEXT} text-[var(--neutral-cool-500)]`}>
          Role
        </div>
        <div className={`w-14 shrink-0 text-right ${TABLE_HEADER_TEXT} text-[var(--neutral-cool-500)]`}>
          Count
        </div>
        {canEdit && (
          <div className={`w-14 shrink-0 text-right ${TABLE_HEADER_TEXT} text-[var(--neutral-cool-500)] pr-2`}>
            Actions
          </div>
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
            className="divide-y divide-[var(--neutral-cool-100)]"
          >
            {flatNodes.map((node) => (
              <div
                key={node.role.id}
                role="row"
                tabIndex={canEdit ? 0 : -1}
                aria-label={`${node.role.role_title || "Unnamed role"}, level ${node.depth + 1}`}
                onKeyDown={(e) => handleRowKeyDown(e, node.role.id)}
              >
                <OrgHierarchyRow
                  node={node}
                  canEdit={canEdit}
                  isKeyboardMoving={kbMovingId === node.role.id}
                  onEdit={onEditRole}
                  onDelete={onDeleteRole}
                />
              </div>
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay — ghost card at cursor */}
        <DragOverlay>
          {activeNode && (
            <div className="shadow-xl rounded-lg overflow-hidden">
              <OrgHierarchyRow
                node={activeNode}
                canEdit={false}
                isDragOverlay
                proposedDepth={proposedDepth}
                onEdit={() => {}}
                onDelete={() => {}}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
