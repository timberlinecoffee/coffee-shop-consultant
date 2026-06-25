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
import { PersonaEditor, type OpenPersonaWriteWithAi } from "./PersonaEditor";

const NEW_PERSONA_ID = "__new__";
const EXAMPLE_PERSONA_ID = "__example__";

// TIM-2898: deeper sample so owners see the depth expected across all five
// persona dimensions -- motivations, purchasing behaviour, day-in-the-life,
// decision drivers, price sensitivity -- not a one-line caricature.
const EXAMPLE_PERSONA: CustomerPersona = {
  id: EXAMPLE_PERSONA_ID,
  name: "The Morning Regular",
  isPrimary: true,
  createdAt: "",
  updatedAt: "",
  ageRange: "25-35",
  occupation: "Product designer at a downtown software company",
  incomeRange: "80k-120k",
  dailyContext:
    "Walks to a hybrid office Tuesday through Thursday, arriving between 8:15 and 8:45am. Stops in on the same block as their building so they're at their desk by 9:00. Saturday morning is the slower visit -- they linger 20 minutes with a book before walking the dog.",
  whyTheyVisit:
    "Buying coffee here is the deliberate, calm part of their workday. They want to start the morning with a beautifully made drink and one familiar face who knows their name, not a 30-second app pickup. The ritual signals 'work mode on' before they even reach the office, and they're willing to pay a small premium for that headspace.",
  painPoints:
    "Chain shops feel transactional and the espresso tastes burnt; the line moves but the cup is forgettable. Specialty shops nearby treat espresso like a lecture -- slow pours, baristas explaining the farm, no clear cue when their drink is ready. They've also been burned by shops that take mobile orders but make in-store customers wait behind them.",
  typicalOrder:
    "Oat Milk Cortado plus a butter croissant Tuesday through Thursday (about $9). Saturday is a single-origin pour-over for here and an almond croissant they eat in-house ($11). They won't order anything blended or flavoured -- syrup is a deal-breaker.",
  values: ["craft", "consistency", "speed"],
  visitFrequency: "several-per-week",
  spendPerVisit: "6-10",
};

interface PersonaSectionProps {
  personas: CustomerPersona[];
  canEdit: boolean;
  onUpdate: (personas: CustomerPersona[]) => void;
  // TIM-2974: parent (ConceptWorkspace) owns the AIAssistCallout and forwards
  // a handler so per-field "Write with AI" buttons open the structured popup.
  onWriteWithAi?: OpenPersonaWriteWithAi;
}

export function PersonaSection({ personas, canEdit, onUpdate, onWriteWithAi }: PersonaSectionProps) {
  // expandedId: a persona id, NEW_PERSONA_ID, EXAMPLE_PERSONA_ID, or null
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<CustomerPersona | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  function openNew() {
    const now = new Date().toISOString();
    const isFirst = personas.length === 0;
    setNewDraft({
      id: createPersonaId(),
      name: "",
      isPrimary: isFirst,
      createdAt: now,
      updatedAt: now,
      whyTheyVisit: "",
    });
    setExpandedId(NEW_PERSONA_ID);
  }

  function handleSave(updated: CustomerPersona, nextPersonas: CustomerPersona[]) {
    const exists = personas.some((p) => p.id === updated.id);
    let result: CustomerPersona[];
    if (exists) {
      result = nextPersonas;
    } else {
      result = [...personas, updated];
      if (updated.isPrimary) {
        result = setPersonaPrimary(result, updated.id);
      } else if (!result.some((p) => p.isPrimary)) {
        result[0] = { ...result[0], isPrimary: true };
      }
    }
    onUpdate(result);
    setNewDraft(null);
    setExpandedId(null);
  }

  function handleDelete(id: string) {
    const remaining = personas.filter((p) => p.id !== id);
    if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }
    onUpdate(remaining);
    setExpandedId(null);
  }

  function closeExpansion() {
    setNewDraft(null);
    setExpandedId(null);
  }

  function handleAddLikeExample() {
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
              onClick={() =>
                setExpandedId(expandedId === EXAMPLE_PERSONA_ID ? null : EXAMPLE_PERSONA_ID)
              }
              className="text-[var(--teal)] hover:underline focus-visible:outline-none"
            >
              {expandedId === EXAMPLE_PERSONA_ID ? "Hide example" : "See an example"}
            </button>
          </p>
          <p className="text-[10px] text-[var(--dark-grey)] mt-4">
            You can add up to {MAX_PERSONAS} personas.
          </p>
        </div>

        {expandedId === EXAMPLE_PERSONA_ID && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <ExamplePersonaPreview onAdd={handleAddLikeExample} onClose={closeExpansion} />
          </div>
        )}

        {expandedId === NEW_PERSONA_ID && newDraft && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-white overflow-hidden">
            <PersonaEditor
              persona={newDraft}
              allPersonas={personas}
              canEdit={canEdit}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={closeExpansion}
              onWriteWithAi={onWriteWithAi}
            />
          </div>
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

      {/* Card list with inline accordion expansion */}
      <div className="mt-2 space-y-3">
        {personas.map((p) => {
          const isExpanded = expandedId === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                isExpanded ? "border-[var(--teal)]" : "border-[var(--border)]"
              }`}
            >
              <PersonaCard
                persona={p}
                allPersonas={personas}
                canEdit={canEdit}
                isExpanded={isExpanded}
                onToggleExpand={() => setExpandedId(isExpanded ? null : p.id)}
                onUpdatePersonas={onUpdate}
              />
              {isExpanded && (
                <PersonaEditor
                  persona={p}
                  allPersonas={personas}
                  canEdit={canEdit}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onClose={closeExpansion}
                  onWriteWithAi={onWriteWithAi}
                />
              )}
            </div>
          );
        })}

        {expandedId === NEW_PERSONA_ID && newDraft && (
          <div className="rounded-xl border border-[var(--teal)] bg-white overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-[var(--border)]">
              <p className="text-sm font-semibold text-[var(--foreground)]">Add a new persona</p>
            </div>
            <PersonaEditor
              persona={newDraft}
              allPersonas={personas}
              canEdit={canEdit}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={closeExpansion}
              onWriteWithAi={onWriteWithAi}
            />
          </div>
        )}
      </div>

      {/* Add button or cap */}
      {canEdit && (
        <div className="mt-3">
          {personas.length < MAX_PERSONAS ? (
            <button
              type="button"
              onClick={openNew}
              disabled={expandedId === NEW_PERSONA_ID}
              className="text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-3 py-1.5 hover:bg-[var(--teal)]/5 transition-colors disabled:opacity-50"
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
    </>
  );
}

function ExamplePersonaPreview({
  onAdd,
  onClose,
}: {
  onAdd: () => void;
  onClose: () => void;
}) {
  const p = EXAMPLE_PERSONA;
  return (
    <div
      className="border-t-0 border-[var(--border)] bg-[var(--warm-1050)]"
      role="region"
      aria-label="Example persona"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)]">Example</p>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Sample Persona</h2>
        </div>
      </div>

      <div className="px-5 py-5 space-y-4">
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
        {p.typicalOrder && <Row label="Typical order" value={p.typicalOrder} />}
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
