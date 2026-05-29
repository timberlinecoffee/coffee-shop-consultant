"use client";

// TIM-1173: Dedicated settings panel for managing equipment station categories.
// Supports drag-to-reorder, inline rename, add, and delete (items reassigned to unsectioned).

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import type { EquipmentItem } from "@/app/workspace/financials/financials-workspace";
import type { ListSection } from "@/types/buildout";

// ── Sortable station row ───────────────────────────────────────────────────────

function StationRow({
  section,
  itemCount,
  canEdit,
  onRename,
  onDelete,
}: {
  section: ListSection;
  itemCount: number;
  canEdit: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(section.name); }, [section.name]);

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== section.name) onRename(trimmed);
    else setDraft(section.name);
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (deleting) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--error-bg-11)] bg-[var(--error-bg-3)]"
      >
        <p className="text-xs text-[var(--error)] flex-1 min-w-0 leading-snug">
          Delete &ldquo;{section.name}&rdquo;
          {itemCount > 0 && (
            <> and move {itemCount} item{itemCount !== 1 ? "s" : ""} to unsectioned?</>
          )}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setDeleting(false)}
            className="text-[10px] font-semibold text-[var(--muted-foreground)] border border-[var(--neutral-cool-200)] rounded px-2 py-1 hover:bg-[var(--surface-warm-100)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-[10px] font-semibold text-white bg-[var(--error)] border border-[var(--error)] rounded px-2 py-1 hover:bg-[var(--error-darker)] transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--neutral-cool-150)] bg-white hover:border-[var(--border-medium)] transition-colors group"
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[var(--neutral-cool-350)] hover:text-[var(--neutral-cool-600)] transition-colors shrink-0 touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      )}

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            className="w-full text-sm font-medium text-[var(--foreground)] bg-white border border-[var(--teal-tint)] rounded px-2 py-0.5 outline-none focus:border-[var(--teal)]"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setEditing(false); setDraft(section.name); }
            }}
          />
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-[var(--foreground)] text-left w-full truncate hover:text-[var(--teal)] transition-colors"
            onClick={() => canEdit && setEditing(true)}
            title={canEdit ? "Click to rename" : section.name}
            disabled={!canEdit}
          >
            {section.name}
          </button>
        )}
      </div>

      {itemCount > 0 && (
        <span className="text-[10px] text-[var(--dark-grey)] shrink-0">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="text-[var(--neutral-cool-350)] hover:text-[var(--error)] transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          aria-label={`Delete ${section.name}`}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export interface CategorySettingsPanelProps {
  sections: ListSection[];
  items: EquipmentItem[];
  canEdit: boolean;
  planId: string;
  onClose: () => void;
  onSectionsChange: (sections: ListSection[]) => void;
  onItemsSectionRemoved: (sectionId: string) => void;
}

export function CategorySettingsPanel({
  sections,
  items,
  canEdit,
  onClose,
  onSectionsChange,
  onItemsSectionRemoved,
}: CategorySettingsPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [adding, setAdding] = useState(false);

  function itemCount(sectionId: string) {
    return items.filter((i) => i.section_id === sectionId && !i.archived).length;
  }

  // ── Drag to reorder ──────────────────────────────────────────────────────────

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      position: idx,
    }));
    onSectionsChange(reordered);

    // Persist positions in parallel
    await Promise.all(
      reordered.map((s, idx) =>
        fetch(`/api/workspaces/buildout/sections/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: idx }),
        })
      )
    );
  }

  // ── Rename ───────────────────────────────────────────────────────────────────

  async function renameSection(sectionId: string, name: string) {
    onSectionsChange(sections.map((s) => (s.id === sectionId ? { ...s, name } : s)));
    await fetch(`/api/workspaces/buildout/sections/${sectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function deleteSection(sectionId: string) {
    onItemsSectionRemoved(sectionId);
    onSectionsChange(sections.filter((s) => s.id !== sectionId));
    await fetch(`/api/workspaces/buildout/sections/${sectionId}`, { method: "DELETE" });
  }

  // ── Add ──────────────────────────────────────────────────────────────────────

  async function addSection() {
    if (adding) return;
    setAdding(true);
    const position = sections.length;
    const tempId = `__new_${Date.now()}`;
    const temp: ListSection = {
      id: tempId,
      plan_id: "",
      list_type: "equipment",
      name: "New Station",
      position,
      collapsed: false,
    };
    onSectionsChange([...sections, temp]);

    try {
      const res = await fetch("/api/workspaces/buildout/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_type: "equipment", name: "New Station", position }),
      });
      if (res.ok) {
        const created = (await res.json()) as ListSection;
        onSectionsChange([...sections, created]);
      } else {
        onSectionsChange(sections.filter((s) => s.id !== tempId));
      }
    } catch {
      onSectionsChange(sections.filter((s) => s.id !== tempId));
    } finally {
      setAdding(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-40 h-full w-[360px] max-w-full bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-[var(--foreground)]">Manage Stations</h2>
            <p className="text-[11px] text-[var(--dark-grey)] mt-0.5 leading-snug">
              Drag to reorder. Click a name to rename.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors shrink-0"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        {/* Station list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {sections.length === 0 ? (
            <p className="text-xs text-[var(--dark-grey)] text-center py-8">
              No stations yet. Add one below.
            </p>
          ) : (
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {sections.map((section) => (
                  <StationRow
                    key={section.id}
                    section={section}
                    itemCount={itemCount(section.id)}
                    canEdit={canEdit}
                    onRename={(name) => renameSection(section.id, name)}
                    onDelete={() => deleteSection(section.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="px-4 py-4 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={addSection}
              disabled={adding}
              className="flex items-center gap-2 w-full justify-center text-sm font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-4 py-2.5 hover:bg-[var(--teal)]/5 transition-colors disabled:opacity-50"
            >
              <Plus size={14} aria-hidden="true" />
              Add station
            </button>
          </div>
        )}
      </div>
    </>
  );
}
