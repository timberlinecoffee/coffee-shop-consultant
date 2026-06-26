"use client";

// TIM-3242: concept-aware "Write with AI" modal for Equipment & Supplies.
// Replaces "Describe your setup" (DescribeSetupModal / TIM-1177).
//
// Source A — concept-driven: reads Concept Suite outputs automatically when rich enough.
// Source B — prompt fallback: short form (floor area, seat count, station breakdown, service model).
// Overwrite guard: if items already exist, asks add-to or replace before committing.
//
// UI pattern: matches the Concept Suite AIAssistCallout affordance — same modal
// chrome, same teal action button, same loading/error states. Reference:
// src/app/(app)/workspace/concept/concept-editor.tsx (Write with AI per-card buttons).
// Style guide sections consulted: Buttons → Primary, Cards → Modal, Inputs → Text.

import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Trash2, ChevronDown } from "lucide-react";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import type { ParsedRow } from "@/app/api/workspaces/buildout/import/route";
import type { ListSection } from "@/types/buildout";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";

// ── Step types ─────────────────────────────────────────────────────────────────

type Step =
  | "checking"     // fetching concept richness on mount
  | "source-a"     // concept rich: auto-generating (shows spinner)
  | "source-b"     // concept sparse: show short form
  | "generating"   // AI call in flight (from source-b)
  | "preview"      // generated rows ready for review
  | "overwrite"    // existing list present: ask add vs replace
  | "committing"   // commit API call
  | "done";        // success

type OverwriteChoice = "add" | "replace" | null;

interface ConceptFields {
  shopIdentity: string;
  vision: string;
  location: string;
  offering: string;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  sections: ListSection[];
  hasExistingItems: boolean;
  onClose: () => void;
  onCommitted: (newItems: EquipmentItem[], newSections: ListSection[]) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function WriteWithAIModal({ sections, hasExistingItems, onClose, onCommitted }: Props) {
  const { format } = useCurrency();

  const [step, setStep] = useState<Step>("checking");
  const [conceptRich, setConceptRich] = useState(false);
  const [conceptFields, setConceptFields] = useState<ConceptFields | null>(null);

  // Source B inputs
  const [floorArea, setFloorArea] = useState("");
  const [seatCount, setSeatCount] = useState("");
  const [stationBreakdown, setStationBreakdown] = useState("");
  const [serviceModel, setServiceModel] = useState("");

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [overwriteChoice, setOverwriteChoice] = useState<OverwriteChoice>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const existingStationNames = sections.map((s) => s.name);
  const parsedStationNames = [...new Set(rows.map((r) => r.section_name).filter(Boolean))];
  const allStationNames = [...new Set([...existingStationNames, ...parsedStationNames])].sort();

  // ── On mount: check concept richness ────────────────────────────────────────

  useEffect(() => {
    async function checkConcept() {
      try {
        const res = await fetch("/api/workspaces/buildout/ai-write");
        if (!res.ok) {
          setConceptRich(false);
          setStep("source-b");
          return;
        }
        const data = await res.json() as { conceptRich: boolean; fields: ConceptFields | null };
        setConceptRich(data.conceptRich);
        setConceptFields(data.fields);
        if (data.conceptRich) {
          setStep("source-a");
          void generateFromConcept();
        } else {
          setStep("source-b");
        }
      } catch {
        setConceptRich(false);
        setStep("source-b");
      }
    }
    void checkConcept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Source A: generate from concept ─────────────────────────────────────────

  async function generateFromConcept() {
    setError(null);
    try {
      const res = await fetch("/api/workspaces/buildout/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "concept" }),
      });

      if (res.status === 402) {
        setStep("source-b");
        setError("Subscription required to use this feature.");
        return;
      }
      if (res.status === 429) {
        setStep("source-b");
        setError("Too many requests. Wait a moment and try again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        // Concept too sparse → fall through to Source B form
        if (res.status === 422) {
          setConceptRich(false);
          setStep("source-b");
          return;
        }
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }

      const data = await res.json() as { rows: ParsedRow[] };
      setRows(data.rows ?? []);
      setStep("preview");
    } catch (err) {
      setStep("source-b");
      setError(err instanceof Error ? err.message : "Generation failed. Try the form below.");
    }
  }

  // ── Source B: generate from short prompt ─────────────────────────────────────

  async function handleGenerateFromPrompt() {
    if (!floorArea.trim() && !seatCount.trim() && !stationBreakdown.trim() && !serviceModel.trim()) {
      setError("Fill in at least one field to generate a list.");
      return;
    }
    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/workspaces/buildout/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "prompt",
          floorArea,
          seatCount,
          stationBreakdown,
          serviceModel,
        }),
      });

      if (res.status === 402) {
        setStep("source-b");
        setError("Subscription required to use this feature.");
        return;
      }
      if (res.status === 429) {
        setStep("source-b");
        setError("Too many requests. Wait a moment and try again.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }

      const data = await res.json() as { rows: ParsedRow[] };
      setRows(data.rows ?? []);
      setStep("preview");
    } catch (err) {
      setStep("source-b");
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    }
  }

  // ── Row editing ──────────────────────────────────────────────────────────────

  function updateRow(id: string, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }

  // ── Commit flow ──────────────────────────────────────────────────────────────

  function handleProceedToCommit() {
    if (hasExistingItems) {
      setStep("overwrite");
    } else {
      void handleCommit("add");
    }
  }

  async function handleCommit(choice: OverwriteChoice) {
    const toCommit = rows.filter((r) => !r.skip && r.name?.trim());
    if (toCommit.length === 0) {
      setError("No items selected to add.");
      return;
    }

    setError(null);
    setStep("committing");

    try {
      const res = await fetch("/api/workspaces/buildout/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: toCommit, replaceExisting: choice === "replace" }),
      });

      if (res.status === 402) {
        setStep("preview");
        setError("Subscription required.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Commit failed (${res.status})`);
      }

      const [eqRes, secRes] = await Promise.all([
        fetch("/api/workspaces/financials/equipment"),
        fetch("/api/workspaces/buildout/sections?list_type=equipment"),
      ]);

      const [newEq, newSec] = await Promise.all([
        eqRes.json() as Promise<EquipmentItem[]>,
        secRes.json() as Promise<ListSection[]>,
      ]);

      setStep("done");
      onCommitted(newEq, newSec);
    } catch (err) {
      setStep("preview");
      setError(err instanceof Error ? err.message : "Commit failed. Please try again.");
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  const activeRows = rows.filter((r) => !r.skip);
  const totalCents = activeRows.reduce((s, r) => s + r.unit_cost_cents * r.quantity, 0);

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative mt-10 mb-10 mx-4 w-full max-w-5xl bg-background rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <Sparkles size={16} className="text-[var(--teal)]" aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold text-[var(--foreground)]">Write with AI</h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {step === "checking" && "Checking your concept..."}
                {step === "source-a" && "Reading your concept and building the list..."}
                {step === "source-b" && (conceptRich ? "AI draft" : "Tell us about your setup")}
                {step === "generating" && "Building equipment list..."}
                {step === "preview" && "Review the AI-generated list. Edit before adding."}
                {step === "overwrite" && "You already have items on this list."}
                {step === "committing" && "Adding items..."}
                {step === "done" && "Equipment list updated."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 px-6 py-5 overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 200px)" }}
        >
          {/* ── Checking / Source A (auto-generating) ── */}
          {(step === "checking" || step === "source-a") && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {step === "checking" ? "Checking concept..." : "Building equipment list from your concept..."}
              </p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {step === "source-a" && "Reading your Concept Suite outputs. Usually takes 10–20 seconds."}
              </p>
              {error && (
                <p className="mt-4 text-sm text-[var(--error)]">{error}</p>
              )}
            </div>
          )}

          {/* ── Source B: short prompt form ── */}
          {step === "source-b" && (
            <div className="space-y-5">
              {!conceptRich && conceptFields !== null && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--neutral-cool-50)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
                  <span className="font-semibold text-[var(--foreground)]">Tip:</span> Fill in
                  Location and Offering in your{" "}
                  <a href="/workspace/concept" className="text-[var(--teal)] underline">
                    Concept Suite
                  </a>{" "}
                  and the AI can generate your equipment list automatically next time.
                </div>
              )}

              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="wai-floor-area"
                    className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                  >
                    Floor area
                  </label>
                  <input
                    id="wai-floor-area"
                    type="text"
                    value={floorArea}
                    onChange={(e) => setFloorArea(e.target.value)}
                    placeholder="e.g. 1,200 sq ft"
                    className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-4 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="wai-seat-count"
                    className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                  >
                    Seating
                  </label>
                  <input
                    id="wai-seat-count"
                    type="text"
                    value={seatCount}
                    onChange={(e) => setSeatCount(e.target.value)}
                    placeholder="e.g. 24 seats"
                    className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-4 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="wai-service-model"
                    className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                  >
                    Service model
                  </label>
                  <input
                    id="wai-service-model"
                    type="text"
                    value={serviceModel}
                    onChange={(e) => setServiceModel(e.target.value)}
                    placeholder="e.g. walk-up counter, slow bar, drive-thru"
                    className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-4 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="wai-stations"
                    className="block text-xs font-semibold text-[var(--foreground)] mb-1.5"
                  >
                    Station breakdown
                  </label>
                  <input
                    id="wai-stations"
                    type="text"
                    value={stationBreakdown}
                    onChange={(e) => setStationBreakdown(e.target.value)}
                    placeholder="e.g. espresso bar, slow bar, batch brew"
                    className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-4 py-2.5 focus:border-[var(--teal)] focus-visible:outline-none placeholder:text-[var(--neutral-cool-400)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Generating (Source B in flight) ── */}
          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">Building equipment list...</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Usually takes 10–20 seconds.
              </p>
            </div>
          )}

          {/* ── Preview ── */}
          {step === "preview" && (
            <div>
              {error && (
                <p className="mb-3 text-sm text-[var(--error)]">{error}</p>
              )}

              <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-[var(--teal-tint-500)] rounded-xl border border-[var(--teal-bg-d0)]">
                <div>
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                    Items
                  </p>
                  <p className="text-sm font-bold text-[var(--teal)]">{activeRows.length}</p>
                </div>
                {totalCents > 0 && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                        Est. Total
                      </p>
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {format(totalCents / 100)}
                      </p>
                    </div>
                  </>
                )}
                <div className="ml-auto text-xs text-[var(--muted-foreground)]">
                  Edit any cell before adding. Uncheck rows to skip them.
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
                  No items were generated. Add more detail and try again.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead>
                      <tr className="bg-[var(--gray-100)] border-b border-[var(--border)]">
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] w-8" />
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[180px]">
                          Name
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[150px]">
                          Station
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[110px]">
                          Brand
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-[var(--muted-foreground)] w-20">
                          Cost
                        </th>
                        <th className="text-right px-3 py-2 font-semibold text-[var(--muted-foreground)] w-16">
                          Qty
                        </th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[140px]">
                          Notes
                        </th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <PreviewRow
                          key={row._id}
                          row={row}
                          stationOptions={allStationNames}
                          onChange={(patch) => updateRow(row._id, patch)}
                          onRemove={() => removeRow(row._id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Overwrite confirmation ── */}
          {step === "overwrite" && (
            <div className="py-6 space-y-4 max-w-lg mx-auto">
              <p className="text-sm text-[var(--foreground)] font-medium">
                Your equipment list already has items. How should these{" "}
                <span className="text-[var(--teal)] font-semibold">{activeRows.length}</span> new items be added?
              </p>

              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    overwriteChoice === "add"
                      ? "border-[var(--teal)] bg-[var(--teal-tint-500)]"
                      : "border-[var(--border)] hover:border-[var(--neutral-cool-350)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="overwrite"
                    value="add"
                    checked={overwriteChoice === "add"}
                    onChange={() => setOverwriteChoice("add")}
                    className="mt-0.5 accent-[var(--teal)]"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      Add alongside existing items
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      Nothing is removed. New items are appended to your list.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                    overwriteChoice === "replace"
                      ? "border-[var(--error)] bg-red-50"
                      : "border-[var(--border)] hover:border-[var(--neutral-cool-350)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="overwrite"
                    value="replace"
                    checked={overwriteChoice === "replace"}
                    onChange={() => setOverwriteChoice("replace")}
                    className="mt-0.5 accent-[var(--error)]"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      Replace existing list
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      All current items will be archived. Only the new AI-generated items remain.
                    </p>
                  </div>
                </label>
              </div>

              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}
            </div>
          )}

          {/* ── Committing ── */}
          {step === "committing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Adding items to your equipment list...
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 rounded-full bg-[var(--teal-bg-800)] flex items-center justify-center mb-4">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 9L7.5 13L14.5 5"
                    stroke="var(--teal)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-sm font-bold text-[var(--foreground)]">Equipment list updated</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Review the items and adjust costs or quantities.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 text-sm font-semibold bg-[var(--teal)] text-white px-5 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "source-b" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerateFromPrompt}
              disabled={
                !floorArea.trim() && !seatCount.trim() && !stationBreakdown.trim() && !serviceModel.trim()
              }
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Generate list
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setRows([]);
                setError(null);
                setStep("source-b");
              }}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Adjust inputs
            </button>
            <button
              type="button"
              onClick={handleProceedToCommit}
              disabled={activeRows.length === 0}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Add {activeRows.length} {activeRows.length === 1 ? "item" : "items"}
            </button>
          </div>
        )}

        {step === "overwrite" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep("preview")}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Back to preview
            </button>
            <button
              type="button"
              onClick={() => void handleCommit(overwriteChoice)}
              disabled={overwriteChoice === null}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview row ────────────────────────────────────────────────────────────────

function PreviewRow({
  row,
  stationOptions,
  onChange,
  onRemove,
}: {
  row: ParsedRow;
  stationOptions: string[];
  onChange: (patch: Partial<ParsedRow>) => void;
  onRemove: () => void;
}) {
  const skipped = row.skip;

  return (
    <tr
      className={`border-b border-[var(--neutral-cool-150)] ${
        skipped ? "opacity-40" : "hover:bg-[var(--neutral-cool-50)]"
      }`}
    >
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          checked={!skipped}
          onChange={(e) => onChange({ skip: !e.target.checked })}
          className="accent-[var(--teal)] w-3.5 h-3.5"
          aria-label="Include item"
        />
      </td>

      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={skipped}
          className="w-full min-w-[160px] text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
        />
      </td>

      <td className="px-2 py-1.5">
        <div className="relative">
          <select
            value={row.section_name}
            onChange={(e) => onChange({ section_name: e.target.value })}
            disabled={skipped}
            className="w-full min-w-[130px] text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none appearance-none pr-5 transition-colors disabled:pointer-events-none"
          >
            {stationOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {!stationOptions.includes(row.section_name) && row.section_name && (
              <option value={row.section_name}>{row.section_name}</option>
            )}
          </select>
          <ChevronDown
            size={10}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] pointer-events-none"
          />
        </div>
      </td>

      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.vendor}
          onChange={(e) => onChange({ vendor: e.target.value })}
          disabled={skipped}
          placeholder="Brand"
          className="w-full text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none placeholder:text-[var(--neutral-cool-400)]"
        />
      </td>

      <td className="px-2 py-1.5 text-right">
        <MoneyInput
          compact
          value={row.unit_cost_cents > 0 ? row.unit_cost_cents / 100 : ""}
          onChange={(e) =>
            onChange({ unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
          }
          disabled={skipped}
          className="w-full text-right text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded pr-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
        />
      </td>

      <td className="px-2 py-1.5 text-right">
        <input
          type="number"
          min={1}
          value={row.quantity}
          onChange={(e) => onChange({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
          disabled={skipped}
          className="w-full text-right text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
        />
      </td>

      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          disabled={skipped}
          placeholder="Notes"
          className="w-full text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none placeholder:text-[var(--neutral-cool-400)]"
        />
      </td>

      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--dark-grey)] hover:text-[var(--error)] transition-colors"
          aria-label="Remove item"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}
