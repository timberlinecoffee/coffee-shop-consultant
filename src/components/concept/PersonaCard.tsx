"use client";

import {
  type CustomerPersona,
  PERSONA_VALUE_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
  setPersonaPrimary,
} from "@/lib/concept";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PersonaCardProps {
  persona: CustomerPersona;
  allPersonas: CustomerPersona[];
  canEdit: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdatePersonas: (personas: CustomerPersona[]) => void;
}

export function PersonaCard({
  persona,
  allPersonas,
  canEdit,
  isExpanded,
  onToggleExpand,
  onUpdatePersonas,
}: PersonaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initial = persona.name.trim().charAt(0).toUpperCase() || "?";
  const shownValues = (persona.values ?? []).slice(0, 3);
  const extraValues = (persona.values ?? []).length - shownValues.length;

  const hasBio = persona.occupation || persona.ageRange;
  const hasHabit = persona.visitFrequency || persona.spendPerVisit;

  function handleSetPrimary() {
    setMenuOpen(false);
    onUpdatePersonas(setPersonaPrimary(allPersonas, persona.id));
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const remaining = allPersonas.filter((p) => p.id !== persona.id);
    if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    onUpdatePersonas(remaining);
  }

  return (
    <div className="relative">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-3 min-w-0 text-left focus-visible:outline-none flex-1"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Collapse ${persona.name}` : `Expand ${persona.name}`}
          >
            <div
              className="w-9 h-9 rounded-full bg-[var(--teal)] text-white flex items-center justify-center text-sm font-bold flex-shrink-0"
              aria-hidden="true"
            >
              {initial}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                  {persona.name}
                </span>
                {persona.isPrimary && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-2 py-0.5 leading-none flex-shrink-0">
                    Primary
                  </span>
                )}
              </div>
              {hasBio && (
                <p className="text-xs text-[var(--dark-grey)] mt-0.5 truncate">
                  {[persona.occupation, persona.ageRange].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen((v) => !v);
                    setConfirmDelete(false);
                  }}
                  aria-label="More options"
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-200)] transition-colors focus-visible:outline-none"
                >
                  <span aria-hidden="true" className="text-base leading-none tracking-tighter">
                    ...
                  </span>
                </button>
                {menuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => { setMenuOpen(false); setConfirmDelete(false); }}
                    />
                    <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-[var(--border)] bg-white shadow-lg overflow-hidden">
                      {!persona.isPrimary && (
                        <button
                          type="button"
                          onClick={handleSetPrimary}
                          className="w-full text-left px-4 py-3 text-sm text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
                        >
                          Set as Primary
                        </button>
                      )}
                      {confirmDelete ? (
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="w-full text-left px-4 py-3 text-sm text-[var(--error)] font-semibold hover:bg-[var(--error-bg)] transition-colors"
                        >
                          Confirm Delete
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="w-full text-left px-4 py-3 text-sm text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors"
                        >
                          Delete Persona
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={isExpanded ? "Collapse" : "Expand"}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-200)] transition-colors focus-visible:outline-none"
            >
              {isExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {shownValues.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {shownValues.map((v) => (
              <span
                key={v}
                className="text-[10px] font-medium text-[var(--teal)] bg-[var(--teal-tint-500)] border border-[var(--teal-tint-300)] rounded-full px-2 py-0.5 leading-none"
              >
                {PERSONA_VALUE_LABELS[v]}
              </span>
            ))}
            {extraValues > 0 && (
              <span className="text-[10px] text-[var(--dark-grey)]">+{extraValues} more</span>
            )}
          </div>
        )}

        {hasHabit && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {[
              persona.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[persona.visitFrequency] : null,
              persona.spendPerVisit ? PERSONA_SPEND_LABELS[persona.spendPerVisit] + " per visit" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {!isExpanded && persona.whyTheyVisit.trim() && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2 italic">
            {persona.whyTheyVisit.trim()}
          </p>
        )}
      </div>
    </div>
  );
}
