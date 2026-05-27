"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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

interface PersonaEditorProps {
  persona: CustomerPersona;
  allPersonas: CustomerPersona[];
  canEdit: boolean;
  onSave: (updated: CustomerPersona, allPersonas: CustomerPersona[]) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PersonaEditor({
  persona,
  allPersonas,
  canEdit,
  onSave,
  onDelete,
  onClose,
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

  function triggerAI(field: "whyTheyVisit" | "painPoints") {
    const label = field === "whyTheyVisit" ? "Why they visit" : "Pain points";
    const prompt = `Help me describe the "${label}" for a customer persona named "${draft.name}" at a coffee shop.`;
    window.dispatchEvent(
      new CustomEvent("copilot:open-with-prompt", { detail: { prompt, focusLabel: label } })
    );
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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white shadow-xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "Add persona" : "Edit persona"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#efefef]">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">
            {isNew ? "Add persona" : "Edit persona"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#afafaf] hover:text-[#1a1a1a] hover:bg-[#f4f3f1] transition-colors focus:outline-none"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5" htmlFor="persona-name">
              Name <span className="text-[#a13d3d]">*</span>
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
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none transition-colors bg-[#faf9f7] disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b] ${
                nameError ? "border-[#a13d3d]" : "border-[#efefef] focus:border-[#155e63]"
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-[#a13d3d]">{nameError}</p>}
          </div>

          {/* Why they visit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#1a1a1a]" htmlFor="persona-why">
                Why they visit <span className="text-[#a13d3d]">*</span>
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => triggerAI("whyTheyVisit")}
                  className="text-[10px] font-medium text-[#155e63] hover:underline"
                >
                  Ask AI
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
              className={`w-full border rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b] ${
                whyError ? "border-[#a13d3d]" : "border-[#efefef] focus:border-[#155e63]"
              }`}
            />
            {whyError && <p className="mt-1 text-xs text-[#a13d3d]">{whyError}</p>}
          </div>

          {/* Pain points */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#1a1a1a]" htmlFor="persona-pain">
                Pain points
              </label>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => triggerAI("painPoints")}
                  className="text-[10px] font-medium text-[#155e63] hover:underline"
                >
                  Ask AI
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
              className="w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
            />
          </div>

          {/* Values chips */}
          <div>
            <p className="text-xs font-semibold text-[#1a1a1a] mb-2">What They Value</p>
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
                        ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                        : "bg-white text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63] hover:text-[#155e63]"
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
              className="flex items-center gap-2 text-xs font-semibold text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors focus:outline-none"
              aria-expanded={aboutOpen}
            >
              <span className="text-[10px] leading-none">{aboutOpen ? "▾" : "▸"}</span>
              About Them
            </button>

            {aboutOpen && (
              <div className="mt-3 space-y-4 pl-3 border-l border-[#efefef]">
                {/* Age range */}
                <div>
                  <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5">Age Range</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERSONA_AGE_RANGE_LABELS) as PersonaAgeRange[]).map((ar) => (
                      <button
                        key={ar}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setField("ageRange", draft.ageRange === ar ? undefined : ar)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                          draft.ageRange === ar
                            ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                            : "bg-white text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63]"
                        }`}
                      >
                        {PERSONA_AGE_RANGE_LABELS[ar]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Occupation */}
                <div>
                  <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5" htmlFor="persona-occ">
                    Occupation
                  </label>
                  <input
                    id="persona-occ"
                    type="text"
                    value={draft.occupation ?? ""}
                    onChange={(e) => setField("occupation", e.target.value || undefined)}
                    disabled={!canEdit}
                    placeholder="e.g. Nurse, designer, student..."
                    className="w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                  />
                </div>

                {/* Income range */}
                <div>
                  <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5">Income Range</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(PERSONA_INCOME_RANGE_LABELS) as PersonaIncomeRange[]).map((ir) => (
                      <button
                        key={ir}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setField("incomeRange", draft.incomeRange === ir ? undefined : ir)}
                        className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-not-allowed ${
                          draft.incomeRange === ir
                            ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                            : "bg-white text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63]"
                        }`}
                      >
                        {PERSONA_INCOME_RANGE_LABELS[ir]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Daily context */}
                <div>
                  <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5" htmlFor="persona-daily">
                    Daily Context
                  </label>
                  <textarea
                    id="persona-daily"
                    value={draft.dailyContext ?? ""}
                    onChange={(e) => setField("dailyContext", e.target.value || undefined)}
                    disabled={!canEdit}
                    rows={2}
                    placeholder="What does their day look like? Where are they going before or after?"
                    className="w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Habits */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-[#1a1a1a]">Habits</p>

            <div>
              <label className="block text-xs text-[#6b6b6b] mb-1.5">Visit Frequency</label>
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
                        ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                        : "bg-white text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63]"
                    }`}
                  >
                    {PERSONA_VISIT_FREQUENCY_LABELS[vf]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#6b6b6b] mb-1.5">Spend per Visit</label>
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
                        ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                        : "bg-white text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63]"
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
            <label className="block text-xs font-semibold text-[#1a1a1a] mb-1.5" htmlFor="persona-notes">
              Notes
            </label>
            {draft.notes && !persona.whyTheyVisit.trim() && (
              <p className="text-xs text-[#6b6b6b] bg-[#faf9f7] border border-[#efefef] rounded-lg px-3 py-2 mb-2 leading-relaxed">
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
              className="w-full border border-[#efefef] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors bg-[#faf9f7] resize-none leading-relaxed disabled:bg-[#f4f3f1] disabled:text-[#6b6b6b]"
            />
          </div>

          {/* Primary toggle */}
          {canEdit && (
            <div className="flex items-center justify-between py-3 border-t border-[#efefef]">
              <span className="text-xs text-[#6b6b6b]">Set as primary persona</span>
              <button
                type="button"
                onClick={() => setField("isPrimary", !draft.isPrimary)}
                disabled={draft.isPrimary}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors disabled:cursor-default ${
                  draft.isPrimary
                    ? "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20"
                    : "text-[#6b6b6b] border-[#e0e0e0] hover:border-[#155e63] hover:text-[#155e63]"
                }`}
              >
                {draft.isPrimary ? "Primary" : "Make primary"}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#efefef] flex items-center justify-between gap-3">
          {canEdit && !isNew ? (
            <button
              type="button"
              onClick={handleDelete}
              className={`text-xs font-medium transition-colors ${
                confirmDelete
                  ? "text-white bg-[#a13d3d] px-3 py-1.5 rounded-lg"
                  : "text-[#a13d3d] hover:underline"
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
              className="text-xs font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
            >
              Cancel
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={handleSave}
                className="text-xs font-semibold bg-[#155e63] text-white px-4 py-2 rounded-lg hover:bg-[#0e4448] transition-colors"
              >
                {isNew ? "Add persona" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
