"use client";

// TIM-2346: Competitor row editor for the concept workspace (V2).
// Caps at MAX_COMPETITORS rows. Persists via the parent's scheduleSave path
// (workspace_key=concept). The normalizer in concept.ts filters malformed rows
// before they reach the narrative prompt.

import { useState } from "react";
import type { ConceptCompetitor } from "@/lib/concept";
import { MobileExpandableTextarea } from "@/components/ui/mobile-expandable-textarea";

const MAX_COMPETITORS = 6;

function createCompetitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `competitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Public component ──────────────────────────────────────────────────────────

interface CompetitorSectionProps {
  competitors: ConceptCompetitor[];
  noDirectCompetitors: boolean;
  canEdit: boolean;
  onUpdateCompetitors: (competitors: ConceptCompetitor[]) => void;
  onToggleNoDirectCompetitors: (value: boolean) => void;
}

export function CompetitorSection({
  competitors,
  noDirectCompetitors,
  canEdit,
  onUpdateCompetitors,
  onToggleNoDirectCompetitors,
}: CompetitorSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  function handleSave(updated: ConceptCompetitor) {
    const exists = competitors.some((c) => c.id === updated.id);
    if (exists) {
      onUpdateCompetitors(competitors.map((c) => (c.id === updated.id ? updated : c)));
    } else {
      onUpdateCompetitors([...competitors, updated]);
    }
    setExpandedId(null);
    setAddingNew(false);
  }

  function handleDelete(id: string) {
    onUpdateCompetitors(competitors.filter((c) => c.id !== id));
    setExpandedId(null);
  }

  const atCap = competitors.length >= MAX_COMPETITORS;

  return (
    <div className="mt-2">
      {/* No direct competitors checkbox — above the list so it reads as the
          primary signal, with the list as detail below. */}
      <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={noDirectCompetitors}
          onChange={(e) => {
            if (canEdit) onToggleNoDirectCompetitors(e.target.checked);
          }}
          disabled={!canEdit}
          className="mt-0.5 w-4 h-4 rounded border-[var(--border)] accent-[var(--teal)] cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
        />
        <span className="text-sm text-[var(--foreground)] leading-snug select-none">
          No direct competitors identified in our catchment
        </span>
      </label>

      {/* Hint */}
      <p className="text-xs text-[var(--dark-grey)] mb-4 leading-relaxed">
        The business plan will only name competitors you add here. If you leave this
        empty, your plan will discuss competition without naming specific shops.
      </p>

      {/* Competitor list */}
      {competitors.length > 0 && (
        <div className="space-y-2 mb-3">
          {competitors.map((c) => {
            const isExpanded = expandedId === c.id;
            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                  isExpanded ? "border-[var(--teal)]" : "border-[var(--border)]"
                }`}
              >
                {isExpanded ? (
                  <CompetitorEditor
                    competitor={c}
                    canEdit={canEdit}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setExpandedId(null)}
                  />
                ) : (
                  <CompetitorRow
                    competitor={c}
                    canEdit={canEdit}
                    onEdit={() => {
                      setAddingNew(false);
                      setExpandedId(c.id);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New competitor inline form */}
      {addingNew && (
        <div className="mb-3 rounded-xl border border-[var(--teal)] bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--foreground)]">Add a competitor</p>
          </div>
          <CompetitorEditor
            competitor={{ id: createCompetitorId(), name: "" }}
            canEdit={canEdit}
            onSave={handleSave}
            onDelete={() => {}}
            onClose={() => setAddingNew(false)}
            isNew
          />
        </div>
      )}

      {/* Add button / cap notice */}
      {canEdit && !addingNew && (
        atCap ? (
          <p className="text-xs text-[var(--dark-grey)]">
            You have reached the maximum of {MAX_COMPETITORS} competitors.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setExpandedId(null);
              setAddingNew(true);
            }}
            className="text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-3 py-1.5 hover:bg-[var(--teal)]/5 transition-colors"
          >
            + Add a competitor
          </button>
        )
      )}
    </div>
  );
}

// ── Collapsed row ─────────────────────────────────────────────────────────────

function CompetitorRow({
  competitor,
  canEdit,
  onEdit,
}: {
  competitor: ConceptCompetitor;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--foreground)] truncate">
          {competitor.name}
        </p>
        {competitor.address && (
          <p className="text-xs text-[var(--dark-grey)] truncate">{competitor.address}</p>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="ml-3 shrink-0 text-xs text-[var(--teal)] hover:underline focus-visible:outline-none"
        >
          Edit
        </button>
      )}
    </div>
  );
}

// ── Inline editor ─────────────────────────────────────────────────────────────

interface CompetitorEditorProps {
  competitor: ConceptCompetitor;
  canEdit: boolean;
  onSave: (updated: ConceptCompetitor) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isNew?: boolean;
}

function CompetitorEditor({
  competitor,
  canEdit,
  onSave,
  onDelete,
  onClose,
  isNew = false,
}: CompetitorEditorProps) {
  const [draft, setDraft] = useState<ConceptCompetitor>({ ...competitor });
  const [nameError, setNameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      setNameError("Name is required.");
      return;
    }
    onSave({
      ...draft,
      name: trimmedName,
      address: draft.address?.trim() || undefined,
      what_they_do_well: draft.what_they_do_well?.trim() || undefined,
      gaps: draft.gaps?.trim() || undefined,
    });
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <EditorField label="Name" required>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => {
            setDraft((p) => ({ ...p, name: e.target.value }));
            if (nameError) setNameError("");
          }}
          placeholder="e.g. Morning Light Coffee"
          autoFocus
          disabled={!canEdit}
          className={`w-full border rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] disabled:bg-[var(--surface-warm-200)] ${
            nameError ? "border-[var(--error)]" : "border-[var(--border)]"
          }`}
        />
        {nameError && (
          <p className="text-xs text-[var(--error)] mt-1" role="alert">
            {nameError}
          </p>
        )}
      </EditorField>

      <EditorField label="Address" optional>
        <input
          type="text"
          value={draft.address ?? ""}
          onChange={(e) =>
            setDraft((p) => ({ ...p, address: e.target.value || undefined }))
          }
          placeholder="e.g. 142 Queen St W"
          disabled={!canEdit}
          className="w-full border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] disabled:bg-[var(--surface-warm-200)]"
        />
      </EditorField>

      <EditorField label="What they do well" optional>
        <MobileExpandableTextarea
          value={draft.what_they_do_well ?? ""}
          onChange={(val) =>
            setDraft((p) => ({ ...p, what_they_do_well: val || undefined }))
          }
          label="What they do well"
          placeholder="e.g. Strong lunchtime traffic, loyal regulars, great pastries."
          minRows={2}
          disabled={!canEdit}
        />
      </EditorField>

      <EditorField label="Gaps this shop fills" optional>
        <MobileExpandableTextarea
          value={draft.gaps ?? ""}
          onChange={(val) =>
            setDraft((p) => ({ ...p, gaps: val || undefined }))
          }
          label="Gaps this shop fills"
          placeholder="e.g. No work seating, closes at 2pm."
          minRows={2}
          disabled={!canEdit}
        />
      </EditorField>

      {/* Footer: delete left, cancel+save right */}
      <div className="flex items-center justify-between pt-1">
        {!isNew ? (
          confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--error)]">Remove this competitor?</span>
              <button
                type="button"
                onClick={() => onDelete(competitor.id)}
                className="text-xs font-semibold text-white bg-[var(--error)] px-3 py-1 rounded-lg hover:opacity-90 transition-opacity"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={!canEdit}
              className="text-xs text-[var(--error)] hover:underline focus-visible:outline-none disabled:opacity-40"
            >
              Remove
            </button>
          )
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canEdit}
            className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-1.5 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small field layout helper ─────────────────────────────────────────────────

function EditorField({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-1">
        {label}
        {required && <span className="ml-1 text-[var(--error)]">*</span>}
        {optional && (
          <span className="ml-1 font-normal normal-case tracking-normal text-[var(--muted-foreground)]">
            (optional)
          </span>
        )}
      </p>
      {children}
    </div>
  );
}
