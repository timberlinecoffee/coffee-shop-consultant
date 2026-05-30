"use client";

import { useState } from "react";
import {
  type CustomerPersona,
  createPersonaId,
  MAX_PERSONAS,
  setPersonaPrimary,
  PERSONA_VALUE_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
} from "@/lib/concept";
import { PersonaCard } from "./PersonaCard";
import { PersonaEditor } from "./PersonaEditor";

const EXAMPLE_PERSONA: CustomerPersona = {
  id: "__example__",
  name: "The Morning Regular",
  isPrimary: true,
  createdAt: "",
  updatedAt: "",
  ageRange: "25-35",
  occupation: "Knowledge worker",
  incomeRange: "80k-120k",
  dailyContext: "Commutes to an office, stops in before 9am most days.",
  whyTheyVisit: "They want a reliable cup they can count on without having to think. The ritual matters as much as the coffee.",
  painPoints: "Chains feel impersonal; specialty shops feel slow and precious. They want craft without fuss.",
  values: ["craft", "consistency", "speed"],
  visitFrequency: "daily",
  spendPerVisit: "6-10",
};

interface PersonaSectionProps {
  personas: CustomerPersona[];
  canEdit: boolean;
  onUpdate: (personas: CustomerPersona[]) => void;
}

export function PersonaSection({ personas, canEdit, onUpdate }: PersonaSectionProps) {
  const [editingPersona, setEditingPersona] = useState<CustomerPersona | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  function openNew() {
    const now = new Date().toISOString();
    const isFirst = personas.length === 0;
    setEditingPersona({
      id: createPersonaId(),
      name: "",
      isPrimary: isFirst,
      createdAt: now,
      updatedAt: now,
      whyTheyVisit: "",
    });
  }

  function handleSave(updated: CustomerPersona, nextPersonas: CustomerPersona[]) {
    const exists = personas.some((p) => p.id === updated.id);
    let result: CustomerPersona[];
    if (exists) {
      result = nextPersonas;
    } else {
      result = [...personas, updated];
      // Enforce single primary
      if (updated.isPrimary) {
        result = setPersonaPrimary(result, updated.id);
      } else if (!result.some((p) => p.isPrimary)) {
        result[0] = { ...result[0], isPrimary: true };
      }
    }
    onUpdate(result);
    setEditingPersona(null);
  }

  function handleDelete(id: string) {
    const remaining = personas.filter((p) => p.id !== id);
    if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    onUpdate(remaining);
    setEditingPersona(null);
  }

  function handleAddLikeExample() {
    setShowExample(false);
    openNew();
  }

  if (personas.length === 0) {
    return (
      <>
        <div className="mt-2 rounded-xl border border-dashed border-[var(--gray-700)] bg-[var(--background)] px-6 py-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">
            Who is your shop for?
          </p>
          <p className="text-xs text-[var(--dark-grey)] leading-relaxed mb-5 max-w-[260px] mx-auto">
            Personas help you make better decisions about everything from the menu to the playlist.
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={openNew}
              className="inline-block bg-[var(--teal)] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors mb-3"
            >
              Add your first persona
            </button>
          )}
          <p className="text-xs">
            <button
              type="button"
              onClick={() => setShowExample(true)}
              className="text-[var(--teal)] hover:underline focus-visible:outline-none"
            >
              See an example
            </button>
          </p>
          <p className="text-[10px] text-[var(--dark-grey)] mt-4">
            You can add up to {MAX_PERSONAS} personas.
          </p>
        </div>

        {showExample && (
          <ExampleDrawer
            onClose={() => setShowExample(false)}
            onAdd={handleAddLikeExample}
          />
        )}

        {editingPersona && (
          <PersonaEditor
            persona={editingPersona}
            allPersonas={personas}
            canEdit={canEdit}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditingPersona(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* Single-persona nudge */}
      {personas.length === 1 && !nudgeDismissed && (
        <div className="mt-2 mb-3 flex items-start justify-between gap-3 rounded-xl bg-[var(--teal-tint-500)] border border-[var(--teal-tint-300)] px-4 py-3">
          <p className="text-xs text-[var(--teal)] leading-relaxed">
            Most shops have 2-3 personas. Adding a second helps you spot where you might be designing for different people.
          </p>
          <button
            type="button"
            onClick={() => setNudgeDismissed(true)}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            <span aria-hidden="true" className="text-xs">&#x2715;</span>
          </button>
        </div>
      )}

      {/* Card grid */}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {personas.map((p) => (
          <PersonaCard
            key={p.id}
            persona={p}
            allPersonas={personas}
            canEdit={canEdit}
            onEdit={setEditingPersona}
            onUpdatePersonas={onUpdate}
          />
        ))}
      </div>

      {/* Add button or cap */}
      {canEdit && (
        <div className="mt-3">
          {personas.length < MAX_PERSONAS ? (
            <button
              type="button"
              onClick={openNew}
              className="text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-3 py-1.5 hover:bg-[var(--teal)]/5 transition-colors"
            >
              + Add another persona
            </button>
          ) : (
            <p className="text-xs text-[var(--dark-grey)]">
              You have reached the maximum of {MAX_PERSONAS} personas.
            </p>
          )}
        </div>
      )}

      {/* Example drawer */}
      {showExample && (
        <ExampleDrawer
          onClose={() => setShowExample(false)}
          onAdd={handleAddLikeExample}
        />
      )}

      {/* Persona editor */}
      {editingPersona && (
        <PersonaEditor
          persona={editingPersona}
          allPersonas={personas}
          canEdit={canEdit}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditingPersona(null)}
        />
      )}
    </>
  );
}

function ExampleDrawer({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: () => void;
}) {
  const p = EXAMPLE_PERSONA;
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Example persona"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Example</p>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Sample Persona</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-200)] transition-colors focus-visible:outline-none"
          >
            <span aria-hidden="true" className="text-sm">&#x2715;</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--teal)] text-white flex items-center justify-center text-base font-bold flex-shrink-0">
              {p.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">{p.name}</p>
              <p className="text-xs text-[var(--dark-grey)]">
                {[p.occupation, p.ageRange].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <Row label="Why they visit" value={p.whyTheyVisit} />
          {p.painPoints && <Row label="Pain points" value={p.painPoints} />}
          {p.dailyContext && <Row label="Daily context" value={p.dailyContext} />}

          {p.values && p.values.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-1.5">
                Values
              </p>
              <div className="flex flex-wrap gap-1.5">
                {p.values.map((v) => (
                  <span
                    key={v}
                    className="text-[10px] font-medium text-[var(--teal)] bg-[var(--teal-tint-500)] border border-[var(--teal-tint-300)] rounded-full px-2 py-0.5"
                  >
                    {PERSONA_VALUE_LABELS[v]}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            {p.visitFrequency && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-0.5">Visits</p>
                <p className="text-xs text-[var(--foreground)]">{PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency]}</p>
              </div>
            )}
            {p.spendPerVisit && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-0.5">Spend</p>
                <p className="text-xs text-[var(--foreground)]">{PERSONA_SPEND_LABELS[p.spendPerVisit]} per visit</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
          >
            Add a persona like this
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dark-grey)] mb-1">{label}</p>
      <p className="text-sm text-[var(--foreground)] leading-relaxed">{value}</p>
    </div>
  );
}
