"use client";

// TIM-1177: Section G — natural-language description → structured equipment list.
// Describe your setup in plain English → AI preview → commit.
// Supports iterative refinement: re-run to merge new items into existing list.

import { useRef, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { useCurrency } from "@/components/CurrencyProvider";
import { MoneyInput } from "@/components/ui/money-input";
import type { ParsedRow } from "@/app/api/workspaces/buildout/import/route";
import type { ListSection } from "@/types/buildout";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";

// ── Step types ────────────────────────────────────────────────────────────────

type Step = "input" | "generating" | "preview" | "committing" | "done";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sections: ListSection[];
  hasExistingItems: boolean;
  onClose: () => void;
  onCommitted: (newItems: EquipmentItem[], newSections: ListSection[]) => void;
}

const EXAMPLE_DESCRIPTIONS = [
  "Two-group La Marzocco Linea PB, two EK43s, a Modbar pour-over for the slow bar, Mahlkonig X54 for batch. POS is a Square terminal on an iPad. Two undercounter fridges for milk. A small pastry display case. Seating for 20.",
  "Drive-thru only — 1500 sqft. One double-group espresso machine, one grinder dedicated to espresso, one for batch. Batch brewer for the window. Three-bin compost and trash station. Drive-thru order screen and menu board.",
  "Multi-roaster cafe with a dedicated slow bar: two EK43s on the manual brew side, a batch brewer, a single-group La Marzocco on espresso. Large retail shelving for beans. POS with two iPads.",
];

// ── Component ─────────────────────────────────────────────────────────────────

export function DescribeSetupModal({ sections, hasExistingItems, onClose, onCommitted }: Props) {
  const { format } = useCurrency();
  const [step, setStep] = useState<Step>("input");
  const [description, setDescription] = useState("");
  const [includeConceptContext, setIncludeConceptContext] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const existingStationNames = sections.map((s) => s.name);
  const parsedStationNames = [...new Set(rows.map((r) => r.section_name).filter(Boolean))];
  const allStationNames = [...new Set([...existingStationNames, ...parsedStationNames])].sort();

  // ── Generate ──

  async function handleGenerate() {
    const trimmed = description.trim();
    if (!trimmed) return;

    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/workspaces/buildout/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          includeConceptContext,
        }),
      });

      if (res.status === 402) {
        setStep("input");
        setError("Subscription required to use this feature.");
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
      setStep("input");
      setError(err instanceof Error ? err.message : "Generation failed. Please try again.");
    }
  }

  // ── Row editing ──

  function updateRow(id: string, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r._id !== id));
  }

  // ── Commit ──

  async function handleCommit() {
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
        body: JSON.stringify({ rows: toCommit }),
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

  // ── Refine (go back to input, keep description for iteration) ──

  function handleRefine() {
    setMergeMode(true);
    setRows([]);
    setError(null);
    setStep("input");
  }

  // ── Summary stats ──

  const activeRows = rows.filter((r) => !r.skip);
  const totalCents = activeRows.reduce((s, r) => s + r.unit_cost_cents * r.quantity, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative mt-10 mb-10 mx-4 w-full max-w-5xl bg-background rounded-2xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Describe Your Setup</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {mergeMode
                ? "Refine your description to add or adjust items."
                : "Describe your equipment in plain English. AI builds the structured list."}
            </p>
          </div>
          <CollapseButton
            onClick={onClose}
            size={18}
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)]"
            aria-label="Close"
          />
        </div>

        <div className="flex-1 px-6 py-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>

          {/* ── Step: input ── */}
          {step === "input" && (
            <div className="space-y-4">
              {mergeMode && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  Items from this run will be added to your existing list. Nothing will be removed.
                </div>
              )}

              <div>
                <label htmlFor="setup-description" className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
                  What equipment does your setup include?
                </label>
                <textarea
                  ref={textareaRef}
                  id="setup-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Two-group La Marzocco, two EK43 grinders, a Modbar pour-over for the slow bar, a small pastry case, POS on two iPads…"
                  rows={6}
                  maxLength={4000}
                  className="w-full text-sm text-[var(--foreground)] border border-[var(--neutral-cool-350)] rounded-xl px-4 py-3 focus:border-[var(--teal)] focus-visible:outline-none resize-none leading-relaxed placeholder:text-[var(--neutral-cool-400)]"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-[var(--dark-grey)]">
                    {description.length}/4000 characters
                  </span>
                  {description.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const example = EXAMPLE_DESCRIPTIONS[Math.floor(Math.random() * EXAMPLE_DESCRIPTIONS.length)];
                        setDescription(example);
                      }}
                      className="text-[10px] text-[var(--teal)] hover:underline"
                    >
                      Try an example
                    </button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeConceptContext}
                  onChange={(e) => setIncludeConceptContext(e.target.checked)}
                  className="accent-[var(--teal)] w-3.5 h-3.5"
                />
                <span className="text-xs text-[var(--muted-foreground)]">
                  Include concept context (service model, capacity, style)
                </span>
              </label>

              {error && (
                <p className="text-sm text-[var(--error)]">{error}</p>
              )}
            </div>
          )}

          {/* ── Step: generating ── */}
          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">Building equipment list...</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">This usually takes 10–15 seconds.</p>
            </div>
          )}

          {/* ── Step: preview ── */}
          {step === "preview" && (
            <div>
              {error && (
                <p className="mb-3 text-sm text-[var(--error)]">{error}</p>
              )}

              {/* Summary bar */}
              <div className="flex items-center gap-6 mb-4 px-4 py-3 bg-[var(--teal-tint-500)] rounded-xl border border-[var(--teal-bg-d0)]">
                <div>
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Items</p>
                  <p className="text-sm font-bold text-[var(--teal)]">{activeRows.length}</p>
                </div>
                {totalCents > 0 && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Est. Total</p>
                      <p className="text-sm font-bold text-[var(--foreground)]">{format(totalCents / 100)}</p>
                    </div>
                  </>
                )}
                <div className="ml-auto text-xs text-[var(--muted-foreground)]">
                  Edit any cell before committing. Uncheck rows to skip them.
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-8">No items were generated. Try a more detailed description.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead>
                      <tr className="bg-[var(--gray-100)] border-b border-[var(--border)]">
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] w-8"></th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[180px]">Name</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[150px]">Station</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[110px]">Brand</th>
                        <th className="text-right px-3 py-2 font-semibold text-[var(--muted-foreground)] w-20">Cost</th>
                        <th className="text-right px-3 py-2 font-semibold text-[var(--muted-foreground)] w-16">Qty</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[140px]">Notes</th>
                        <th className="w-8"></th>
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

          {/* ── Step: committing ── */}
          {step === "committing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">Adding items to your equipment list...</p>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-10 h-10 rounded-full bg-[var(--teal-bg-800)] flex items-center justify-center mb-4">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3.5 9L7.5 13L14.5 5" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm font-bold text-[var(--foreground)]">Equipment list updated</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Review the items and adjust costs or quantities.</p>
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
        {step === "input" && (
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
              onClick={handleGenerate}
              disabled={!description.trim()}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Generate List
            </button>
          </div>
        )}

        {step === "preview" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRefine}
                className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                Refine Description
              </button>
              {hasExistingItems && !mergeMode && (
                <span className="text-xs text-[var(--dark-grey)]">
                  Items will be added to your existing list
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCommit}
              disabled={activeRows.length === 0}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Add {activeRows.length} {activeRows.length === 1 ? "item" : "items"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview row ───────────────────────────────────────────────────────────────

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
    <tr className={`border-b border-[var(--neutral-cool-150)] ${skipped ? "opacity-40" : "hover:bg-[var(--neutral-cool-50)]"}`}>
      {/* Skip toggle */}
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          checked={!skipped}
          onChange={(e) => onChange({ skip: !e.target.checked })}
          className="accent-[var(--teal)] w-3.5 h-3.5"
          aria-label="Include item"
        />
      </td>

      {/* Name */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={skipped}
          className="w-full min-w-[160px] text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
        />
      </td>

      {/* Station dropdown */}
      <td className="px-2 py-1.5">
        <div className="relative">
          <select
            value={row.section_name}
            onChange={(e) => onChange({ section_name: e.target.value })}
            disabled={skipped}
            className="w-full min-w-[130px] text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none appearance-none pr-5 transition-colors disabled:pointer-events-none"
          >
            {stationOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            {!stationOptions.includes(row.section_name) && row.section_name && (
              <option value={row.section_name}>{row.section_name}</option>
            )}
          </select>
          <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] pointer-events-none" />
        </div>
      </td>

      {/* Brand */}
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

      {/* Cost */}
      <td className="px-2 py-1.5 text-right">
        <MoneyInput
          compact
          value={row.unit_cost_cents > 0 ? row.unit_cost_cents / 100 : ""}
          onChange={(e) => onChange({ unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
          disabled={skipped}
          className="w-full text-right text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded pr-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
        />
      </td>

      {/* Qty */}
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

      {/* Notes */}
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

      {/* Remove */}
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

// Station options for the select (standard list + any custom stations from existing sections)
const allStationOptions = [
  "Espresso Bar",
  "Pour Over / Manual Brew",
  "Batch Brew",
  "Cold Beverage",
  "Point of Sale / Cashier",
  "Front of House / Service",
  "Kitchen / Food Prep",
  "Back of House",
  "Furniture & Seating",
  "Decor & Ambiance",
  "Smallwares",
  "Cleaning & Sanitation",
];
