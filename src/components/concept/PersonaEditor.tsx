"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  type CustomerPersona,
  type PersonaValue,
  type PersonaAgeRange,
  type PersonaIncomeRange,
  type PersonaVisitFrequency,
  type PersonaSpendPerVisit,
  PERSONA_AGE_RANGE_LABELS,
  PERSONA_INCOME_RANGE_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
  PERSONA_VALUE_LABELS,
  PERSONA_VALUE_OPTIONS,
  setPersonaPrimary,
} from "@/lib/concept";
import { toTitleCase } from "@/lib/text";

// TIM-2383: per-field "Ask Scout" buttons call onWriteWithAi which concept-editor
// implements by dispatching copilot:open-with-prompt (same pattern as concept cards).
export type PersonaAIField = "whyTheyVisit" | "painPoints" | "typicalOrder";
export type OpenPersonaWriteWithAi = (args: {
  field: PersonaAIField;
  label: string;
  currentValue: string;
  onApply: (newValue: string) => void;
}) => void;

interface PersonaEditorProps {
  persona: CustomerPersona;
  allPersonas: CustomerPersona[];
  canEdit: boolean;
  onSave: (updated: CustomerPersona, allPersonas: CustomerPersona[]) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  // TIM-2383: optional so callers without a chat host still mount;
  // without it the per-field "Ask Scout" buttons hide.
  onWriteWithAi?: OpenPersonaWriteWithAi;
}

export function PersonaEditor({
  persona,
  allPersonas,
  canEdit,
  onSave,
  onDelete,
  onClose,
  onWriteWithAi,
}: PersonaEditorProps) {
  const [draft, setDraft] = useState<CustomerPersona>({ ...persona });
  const [aboutOpen, setAboutOpen] = useState(
    !!(persona.ageRange || persona.occupation || persona.incomeRange || persona.dailyContext)
  );
  const [nameError, setNameError] = useState("");
  const [whyError, setWhyError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function setField<K extends keyof CustomerPersona>(key: K, value: CustomerPersona[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleValue(v: PersonaValue) {
    setDraft((prev) => {
      const current = prev.values ?? [];
      const next = current.includes(v)
        ? current.filter((x) => x !== v)
        : [...current, v];
      return { ...prev, values: next };
    });
  }

  // TIM-2383 Phase 3 D2: per-field "Ask Scout" buttons dispatch copilot:open-with-prompt
  // via the onWriteWithAi callback (concept-editor.tsx owns the dispatch). This
  // brings persona fields onto the same pattern as concept component cards.
  function triggerAI(field: PersonaAIField) {
    if (!onWriteWithAi) return;
    const labelByField: Record<PersonaAIField, string> = {
      whyTheyVisit: "Why they visit",
      painPoints: "Pain points",
      typicalOrder: "Typical order",
    };
    const label = labelByField[field];
    const currentValue = (draft[field] ?? "") as string;
    onWriteWithAi({
      field,
      label,
      currentValue,
      onApply: (newValue) => setField(field, newValue),
    });
  }

  function validate(): boolean {
    let ok = true;
    if (!draft.name.trim()) {
      setNameError("Name is required");
      ok = false;
    } else {
      setNameError("");
    }
    if (!draft.whyTheyVisit.trim()) {
      setWhyError("Please describe why they visit");
      ok = false;
    } else {
      setWhyError("");
    }
    return ok;
  }

  function handleSave() {
    if (!validate()) return;
    const now = new Date().toISOString();
    // TIM-1002: persona name is label-shaped — store in Title Case at the boundary.
    const updated: CustomerPersona = {
      ...draft,
      name: toTitleCase(draft.name.trim()),
      updatedAt: now,
    };
    // Propagate isPrimary change across all personas
    let next = allPersonas.map((p) => (p.id === updated.id ? updated : p));
    if (updated.isPrimary) {
      next = setPersonaPrimary(next, updated.id);
    }
    onSave(updated, next);
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(persona.id);
  }

  const isNew = !allPersonas.some((p) => p.id === persona.id);

  return (
    <div
      className="border-t border-[var(--border)] bg-[var(--warm-1050)]"
      role="region"
      aria-label={isNew ? "Add persona" : "Edit persona"}
    >
      {/* Body */}
      <div className="px-5 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5" htmlFor="persona-name">
              Name <span className="text-[var(--error)]">*</span>
            </label>
            <input
              id="persona-name"
              ref={nameRef}
              type="text"
              value={draft.name}
              onChange={(e) => {
                if (e.target.value.length <= 40) setField("name", e.target.value);
              }}
              disabled={!canEdit}
              maxLength={40}
              placeholder="e.g. The Morning Regular"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none transition-colors bg-[var(--background)] disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)] ${
                nameError ? "border-[var(--error)]" : "border-[var(--border)] focus:border-[var(--teal)]"
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-[var(--error)]">{nameError}</p>}
          </div>

          {/* Why they visit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)]" htmlFor="persona-why">
                Why they visit <span className="text-[var(--error)]">*</span>
              </label>
              {canEdit && onWriteWithAi && (
                <button
                  type="button"
                  onClick={() => triggerAI("whyTheyVisit")}
                  className="flex items-center gap-1 text-[10px] font-medium text-[var(--teal)] hover:underline"
                >
                  <Sparkles size={9} aria-hidden />
                  Ask Scout
                </button>
              )}
            </div>
            <textarea
              id="persona-why"
              value={draft.whyTheyVisit}
              onChange={(e) => setField("whyTheyVisit", e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="What brings this person in? What are they hoping for?"
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)] ${
                whyError ? "border-[var(--error)]" : "border-[var(--border)] focus:border-[var(--teal)]"
              }`}
            />
            {whyError && <p className="mt-1 text-xs text-[var(--error)]">{whyError}</p>}
          </div>

          {/* Pain points */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)]" htmlFor="persona-pain">
                Pain points
              </label>
              {canEdit && onWriteWithAi && (
                <button
                  type="button"
                  onClick={() => triggerAI("painPoints")}
                  className="flex items-center gap-1 text-[10px] font-medium text-[var(--teal)] hover:underline"
                >
                  <Sparkles size={9} aria-hidden />
                  Ask Scout
                </button>
              )}
            </div>
            <textarea
              id="persona-pain"
              value={draft.painPoints ?? ""}
              onChange={(e) => setField("painPoints", e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="What frustrates them about existing coffee shops?"
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
            />
          </div>

          {/* TIM-1476: Typical order. TIM-2898 / TIM-2383: per-field Ask Scout parity with other fields. */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)]" htmlFor="persona-order">
                What do they typically order?
              </label>
              {canEdit && onWriteWithAi && (
                <button
                  type="button"
                  onClick={() => triggerAI("typicalOrder")}
                  className="flex items-center gap-1 text-[10px] font-medium text-[var(--teal)] hover:underline"
                >
                  <Sparkles size={9} aria-hidden />
                  Ask Scout
                </button>
              )}
            </div>
            <textarea
              id="persona-order"
              value={draft.typicalOrder ?? ""}
              onChange={(e) => setField("typicalOrder", e.target.value || undefined)}
              disabled={!canEdit}
              rows={2}
              placeholder="e.g. Oat milk cortado plus an almond croissant on weekday mornings."
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
            />
          </div>

          {/* Values chips */}
          <div>
            <p className="text-xs font-semibold text-[var(--foreground)] mb-2">What They Value</p>
            <div className="flex flex-wrap gap-2">
              {PERSONA_VALUE_OPTIONS.map((v) => {
                const selected = (draft.values ?? []).includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleValue(v)}
                    className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                      selected
                        ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                        : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
                    }`}
                  >
                    {PERSONA_VALUE_LABELS[v]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* About them (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setAboutOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none"
              aria-expanded={aboutOpen}
            >
              <span className="text-[10px] leading-none">{aboutOpen ? "▾" : "▸"}</span>
              About Them
            </button>

            {aboutOpen && (
              <div className="mt-3 space-y-4 pl-3 border-l border-[var(--border)]">
                {/* Age range */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">Age Range</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERSONA_AGE_RANGE_LABELS) as PersonaAgeRange[]).map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setField("ageRange", draft.ageRange === ar ? undefined : ar)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                          draft.ageRange === ar
                            ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                            : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)]"
                        }`}
                      >
                        {PERSONA_AGE_RANGE_LABELS[ar]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Occupation */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5" htmlFor="persona-occ">
                    Occupation
                  </label>
                  <input
                    id="persona-occ"
                    type="text"
                    value={draft.occupation ?? ""}
                    onChange={(e) => setField("occupation", e.target.value || undefined)}
                    disabled={!canEdit}
                    placeholder="e.g. Nurse, designer, student..."
                    className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
                  />
                </div>

                {/* Income range */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">Income Range</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERSONA_INCOME_RANGE_LABELS) as PersonaIncomeRange[]).map((ir) => (
                      <button
                        key={ir}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setField("incomeRange", draft.incomeRange === ir ? undefined : ir)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                          draft.incomeRange === ir
                            ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                            : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)]"
                        }`}
                      >
                        {PERSONA_INCOME_RANGE_LABELS[ir]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Daily context */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5" htmlFor="persona-daily">
                    Daily Context
                  </label>
                  <textarea
                    id="persona-daily"
                    value={draft.dailyContext ?? ""}
                    onChange={(e) => setField("dailyContext", e.target.value || undefined)}
                    disabled={!canEdit}
                    rows={2}
                    placeholder="What does their day look like? Where are they going before or after?"
                    className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Habits */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-[var(--foreground)]">Habits</p>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Visit Frequency</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PERSONA_VISIT_FREQUENCY_LABELS) as PersonaVisitFrequency[]).map((vf) => (
                  <button
                    key={vf}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setField("visitFrequency", draft.visitFrequency === vf ? undefined : vf)
                    }
                    className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                      draft.visitFrequency === vf
                        ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                        : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)]"
                    }`}
                  >
                    {PERSONA_VISIT_FREQUENCY_LABELS[vf]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Spend per Visit</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PERSONA_SPEND_LABELS) as PersonaSpendPerVisit[]).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setField("spendPerVisit", draft.spendPerVisit === sp ? undefined : sp)
                    }
                    className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                      draft.spendPerVisit === sp
                        ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                        : "bg-white text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)]"
                    }`}
                  >
                    {PERSONA_SPEND_LABELS[sp]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes (with migration notice if migrated) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5" htmlFor="persona-notes">
              Notes
            </label>
            {draft.notes && !persona.whyTheyVisit.trim() && (
              <p className="text-xs text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 mb-2 leading-relaxed">
                Your previous target customer description was moved here. Flesh out the fields above and clear this when you are ready.
              </p>
            )}
            <textarea
              id="persona-notes"
              value={draft.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value || undefined)}
              disabled={!canEdit}
              rows={3}
              placeholder="Any other notes about this customer..."
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-[var(--background)] resize-none leading-relaxed disabled:bg-[var(--surface-warm-200)] disabled:text-[var(--muted-foreground)]"
            />
          </div>

          {/* Primary toggle */}
          {canEdit && (
            <div className="flex items-center justify-between py-3 border-t border-[var(--border)]">
              <span className="text-xs text-[var(--muted-foreground)]">Set as primary persona</span>
              <button
                type="button"
                onClick={() => setField("isPrimary", !draft.isPrimary)}
                disabled={draft.isPrimary}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-default ${
                  draft.isPrimary
                    ? "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20"
                    : "text-[var(--muted-foreground)] border-[var(--border-medium)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
                }`}
              >
                {draft.isPrimary ? "Primary" : "Make primary"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
          {canEdit && !isNew ? (
            <button
              type="button"
              onClick={handleDelete}
              className={`text-xs font-medium transition-colors ${
                confirmDelete
                  ? "text-white bg-[var(--error)] px-3 py-1.5 rounded-lg"
                  : "text-[var(--error)] hover:underline"
              }`}
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                className="text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
              >
                {isNew ? "Add persona" : "Save"}
              </button>
            )}
          </div>
      </div>
    </div>
  );
}
