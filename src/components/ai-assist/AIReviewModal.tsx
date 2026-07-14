"use client";

// TIM-1561: Unified AI proposal review modal.
// One shared component used by every AI invocation site.
// Implements §2 (desktop dialog) and §6 (mobile bottom sheet) from the spec.
// Lazy-loaded by useAIReviewModal so diff-match-patch stays out of the initial bundle.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, Pencil, Sparkles, AlertCircle, Link2, Plus } from "lucide-react";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { COPILOT_NAME } from "@/lib/copilot/branding";
import {
  recomputeEquipmentLinked,
  type EquipmentRecomputeParams,
} from "@/lib/cross-workspace-apply";
import { parseFactValue } from "@/lib/cross-workspace-sync";
import { stripFindingTags } from "@/lib/business-plan/sanitize-finding-text";

// ── Public types ────────────────────────────────────────────────────────────

export interface SuggestionPayload {
  id: string;
  fieldId: string;
  fieldLabel: string;
  originalValue: string;
  proposedValue: string;
  isStructured?: boolean;
  // TIM-3860: when true, use the ingredient-specific table/diff/form-editor UI
  // instead of the generic StructuredDiff. Only set for recipe suggestions.
  isRecipeLines?: boolean;
  // TIM-1798: cross-workspace coordinated proposals. When present, cards are
  // grouped by workspaceLabel. A `derived` card is a linked figure (e.g. the
  // Financials equipment line + startup-cost total that follow an equipment-cost
  // change) — shown read-only with provenance, recomputed when the editable
  // primary (the one carrying `recompute`) is edited.
  workspaceLabel?: string;
  derived?: boolean;
  provenance?: string;
  recompute?: EquipmentRecomputeParams;
  // TIM-2343: per-section self-consistency findings the BP generator surfaced
  // after its proofreader pass (and one regen attempt). Rendered as an
  // advisory block inside the suggestion card so the founder can see the
  // pairs the LLM still couldn't reconcile before accepting the draft.
  // Advisory only — never blocks Accept.
  consistencyContradictions?: SuggestionConsistencyContradiction[];
}

export interface SuggestionConsistencyContradiction {
  kind: "numerical" | "categorical" | "temporal" | "other";
  claim_a: string;
  claim_b: string;
  explanation: string;
}

export interface ApprovedChange {
  suggestionId: string;
  fieldId: string;
  finalValue: string;
  wasEdited: boolean;
}

export interface AIReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (accepted: ApprovedChange[]) => Promise<void>;
  suggestions: SuggestionPayload[];
  isStreaming?: boolean;
  error?: string | null;
  context: {
    workspace: string;
    section?: string;
  };
}

// ── Internal card state ─────────────────────────────────────────────────────

type CardStatus = "unreviewed" | "accepted" | "rejected" | "editing";

interface CardState {
  status: CardStatus;
  editedValue: string;
  wasEdited: boolean;
  applyError: string | null;
  appliedOk: boolean;
}

function initialCard(sug: SuggestionPayload): CardState {
  return {
    status: "unreviewed",
    editedValue: sug.proposedValue,
    wasEdited: false,
    applyError: null,
    appliedOk: false,
  };
}

// ── Word-diff using diff-match-patch ────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dmpInstance: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDmp(): Promise<any> {
  if (dmpInstance) return dmpInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import("diff-match-patch") as any;
  const DMP = mod.diff_match_patch ?? mod.default;
  dmpInstance = new DMP();
  return dmpInstance;
}

type DiffOp = -1 | 0 | 1;
type DiffTuple = [DiffOp, string];

function DiffText({ original, proposed }: { original: string; proposed: string }) {
  const [diffs, setDiffs] = useState<DiffTuple[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDmp().then((dmp) => {
      if (cancelled) return;
      const d = dmp.diff_main(original, proposed) as DiffTuple[];
      dmp.diff_cleanupSemantic(d);
      setDiffs(d);
    });
    return () => { cancelled = true; };
  }, [original, proposed]);

  if (!diffs) {
    return (
      <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
        {proposed}
      </p>
    );
  }

  return (
    <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
      {diffs.map(([op, text], i) => {
        if (op === 0) return <span key={i}>{text}</span>;
        if (op === 1) return (
          <span key={i} className="bg-[var(--teal-tint-500)] rounded-sm">
            {text}
          </span>
        );
        return (
          <span key={i} className="bg-red-50 line-through text-red-600">
            {text}
          </span>
        );
      })}
    </p>
  );
}

// ── Recipe ingredient helpers (structured recipe diff & form editor) ─────────

type RecipeLine = {
  name: string;
  amount: number;
  unit: string;
  inventory_item_id?: string;
};

function parseRecipeLines(value: string): RecipeLine[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as RecipeLine[];
  } catch { /* empty */ }
  return [];
}

function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// Clean ingredient table — identical layout to the diff table, used for the
// Current column so both columns share the same visual structure.
function IngredientTable({ value }: { value: string }) {
  const lines = parseRecipeLines(value);
  if (lines.length === 0) {
    return <p className="text-xs italic text-[var(--dark-grey)]">Empty</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Ingredient</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Amount</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {lines.map((line, i) => (
            <tr key={i} className="bg-white">
              <td className="px-3 py-2 text-neutral-950">{line.name}</td>
              <td className="px-3 py-2 text-neutral-950">{line.amount}</td>
              <td className="px-3 py-2 text-neutral-950">{line.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DiffRowKind = "unchanged" | "added" | "removed" | "changed";

type IngredientDiffRow = {
  kind: DiffRowKind;
  name: string;
  origAmount?: number;
  origUnit?: string;
  propAmount?: number;
  propUnit?: string;
};

function computeIngredientDiff(
  origLines: RecipeLine[],
  propLines: RecipeLine[],
): IngredientDiffRow[] {
  // Match by inventory_item_id first (stable link), then normalized name.
  const origByKey = new Map<string, RecipeLine>();
  for (const line of origLines) {
    origByKey.set(line.inventory_item_id ?? normalizeIngredientName(line.name), line);
  }

  const rows: IngredientDiffRow[] = [];
  const handledKeys = new Set<string>();

  for (const prop of propLines) {
    const key = prop.inventory_item_id ?? normalizeIngredientName(prop.name);
    const orig = origByKey.get(key);
    if (!orig) {
      rows.push({ kind: "added", name: prop.name, propAmount: prop.amount, propUnit: prop.unit });
    } else {
      handledKeys.add(key);
      if (orig.amount === prop.amount && orig.unit === prop.unit) {
        rows.push({ kind: "unchanged", name: prop.name, propAmount: prop.amount, propUnit: prop.unit });
      } else {
        rows.push({ kind: "changed", name: prop.name, origAmount: orig.amount, origUnit: orig.unit, propAmount: prop.amount, propUnit: prop.unit });
      }
    }
  }

  // Rows in original that were not matched → removed by the AI.
  for (const orig of origLines) {
    const key = orig.inventory_item_id ?? normalizeIngredientName(orig.name);
    if (!handledKeys.has(key)) {
      rows.push({ kind: "removed", name: orig.name, origAmount: orig.amount, origUnit: orig.unit });
    }
  }

  return rows;
}

// Diff table — used in the Suggested column. Unchanged rows are unstyled;
// added rows get a green tint; removed rows get a red tint + strikethrough;
// changed rows show the old amount/unit crossed out beside the new value.
function IngredientDiff({ original, proposed }: { original: string; proposed: string }) {
  const rows = computeIngredientDiff(parseRecipeLines(original), parseRecipeLines(proposed));

  if (rows.length === 0) {
    return <p className="text-xs italic text-[var(--dark-grey)]">Empty</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Ingredient</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Amount</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Unit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row, i) => {
            const rowCls =
              row.kind === "added"
                ? "bg-[var(--teal-tint-500)]"
                : row.kind === "removed"
                ? "bg-red-50"
                : "bg-white";

            if (row.kind === "removed") {
              return (
                <tr key={i} className={rowCls}>
                  <td className="px-3 py-2 line-through text-[var(--dark-grey)]">{row.name}</td>
                  <td className="px-3 py-2 line-through text-[var(--dark-grey)]">{row.origAmount}</td>
                  <td className="px-3 py-2 line-through text-[var(--dark-grey)]">{row.origUnit}</td>
                </tr>
              );
            }

            return (
              <tr key={i} className={rowCls}>
                <td className="px-3 py-2 text-neutral-950">{row.name}</td>
                <td className="px-3 py-2">
                  {row.kind === "changed" && row.origAmount !== row.propAmount ? (
                    <><span className="line-through text-[var(--dark-grey)] mr-1">{row.origAmount}</span><span className="text-neutral-950">{row.propAmount}</span></>
                  ) : (
                    <span className="text-neutral-950">{row.propAmount}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.kind === "changed" && row.origUnit !== row.propUnit ? (
                    <><span className="line-through text-[var(--dark-grey)] mr-1">{row.origUnit}</span><span className="text-neutral-950">{row.propUnit}</span></>
                  ) : (
                    <span className="text-neutral-950">{row.propUnit}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Generic structured diff — fallback for isStructured: true suggestions that are
// NOT recipe lines (prep steps, supplier lists, milestones, cross-suite figures).
// The ingredient-specific path requires isRecipeLines: true.
function StructuredDiff({ original, proposed }: { original: string; proposed: string }) {
  let origRows: string[] = [];
  let propRows: string[] = [];
  try { origRows = (JSON.parse(original) as unknown[]).map((r) => JSON.stringify(r)); } catch { origRows = original.split("\n").filter(Boolean); }
  try { propRows = (JSON.parse(proposed) as unknown[]).map((r) => JSON.stringify(r)); } catch { propRows = proposed.split("\n").filter(Boolean); }

  const origSet = new Set(origRows);
  const propSet = new Set(propRows);

  const allRows = [
    ...propRows.filter((r) => !origSet.has(r)).map((r) => ({ row: r, kind: "added" as const })),
    ...origRows.filter((r) => !propSet.has(r)).map((r) => ({ row: r, kind: "removed" as const })),
    ...propRows.filter((r) => origSet.has(r)).map((r) => ({ row: r, kind: "unchanged" as const })),
  ];

  function parseRow(raw: string): Record<string, string> {
    try { return JSON.parse(raw) as Record<string, string>; } catch { return { value: raw }; }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs">
        <tbody>
          {allRows.map(({ row, kind }, i) => {
            const parsed = parseRow(row);
            const cells = Object.values(parsed).slice(0, 4);
            return (
              <tr
                key={i}
                className={
                  kind === "added"
                    ? "bg-[var(--teal-tint-500)]"
                    : kind === "removed"
                    ? "bg-red-50"
                    : "bg-white"
                }
              >
                {cells.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 border-b border-[var(--border)] ${
                      kind === "removed" ? "line-through text-[var(--dark-grey)]" : "text-[var(--foreground)]"
                    }`}
                  >
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Form-based editor for structured recipe ingredient lists (Rule 3: server
// validates fields on the apply route; the form just produces valid JSON).
const RECIPE_UNITS = ["g", "ml", "oz", "each", "piece"] as const;

function IngredientFormEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [rows, setRows] = useState<RecipeLine[]>(() => {
    const parsed = parseRecipeLines(value);
    return parsed.length > 0 ? parsed : [{ name: "", amount: 1, unit: "g" }];
  });

  function updateRows(next: RecipeLine[]) {
    setRows(next);
    onChange(JSON.stringify(next));
  }

  function updateRow(idx: number, patch: Partial<RecipeLine>) {
    updateRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Ingredient</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide w-20">Amount</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide w-20">Unit</th>
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row, i) => (
              <tr key={i} className="bg-white">
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    aria-label={`Ingredient name for row ${i + 1}`}
                    placeholder="Ingredient name"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-neutral-950 placeholder:text-neutral-300 focus-visible:outline-none focus:border-teal transition-colors"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="number"
                    aria-label={`Amount for row ${i + 1}`}
                    min={0}
                    step={0.01}
                    value={row.amount}
                    onChange={(e) => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-neutral-950 focus-visible:outline-none focus:border-teal transition-colors"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    aria-label={`Unit for row ${i + 1}`}
                    value={row.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    className="w-full border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-neutral-950 focus-visible:outline-none focus:border-teal transition-colors"
                  >
                    {RECIPE_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => updateRows(rows.filter((_, j) => j !== i))}
                    aria-label={`Remove ${row.name || "this ingredient"}`}
                    className="w-6 h-6 rounded-lg bg-neutral-200 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors text-neutral-500"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => updateRows([...rows, { name: "", amount: 1, unit: "g" }])}
        className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:underline transition-colors"
      >
        <Plus size={12} aria-hidden /> Add Row
      </button>
    </div>
  );
}

// ── Change card ─────────────────────────────────────────────────────────────

function ChangeCard({
  sug,
  cardState,
  isMobile,
  readOnly = false,
  onAccept,
  onReject,
  onEditStart,
  onEditSave,
  onEditDiscard,
  onEditChange,
}: {
  sug: SuggestionPayload;
  cardState: CardState;
  isMobile: boolean;
  // TIM-1798: derived/linked cards (Financials figures that follow an equipment
  // cost change) render read-only with provenance — they apply together with the
  // editable primary, so they are not separately acceptable.
  readOnly?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditDiscard: () => void;
  onEditChange: (v: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (cardState.status === "editing") textareaRef.current?.focus();
  }, [cardState.status]);

  const isAccepted = !readOnly && cardState.status === "accepted";
  const isRejected = !readOnly && cardState.status === "rejected";
  const isEditing = !readOnly && cardState.status === "editing";

  const cardCls = readOnly
    ? "border border-dashed border-[var(--border)] rounded-xl p-4 space-y-3 bg-[var(--background)]"
    : isAccepted
    ? "border border-[var(--teal)]/30 bg-[var(--teal-tint-500)] rounded-xl p-4 space-y-3"
    : isRejected
    ? "border border-[var(--border)] rounded-xl p-4 space-y-3 opacity-40"
    : "border border-[var(--border)] rounded-xl p-4 space-y-3 bg-white";

  return (
    <div className={cardCls}>
      {/* Field label + accepted / provenance badge */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--dark)]">{sug.fieldLabel}</p>
        {readOnly && sug.provenance && (
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--dark-grey)] bg-white border border-[var(--border)] rounded-full px-2 py-0.5">
            <Link2 size={11} aria-hidden /> {sug.provenance}
          </span>
        )}
        {isAccepted && (
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-[var(--teal)] bg-white border border-[var(--teal)]/30 rounded-full px-2 py-0.5">
              {cardState.wasEdited ? "You edited this" : "Accepted"}
            </span>
          </div>
        )}
        {cardState.appliedOk && (
          <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5">Applied</span>
        )}
      </div>

      {/* Diff view */}
      {!isEditing && (
        isMobile ? (
          /* Stacked on mobile */
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-[var(--dark-grey)] uppercase tracking-wide mb-1">Current</p>
              {sug.isRecipeLines ? (
                <IngredientTable value={sug.originalValue} />
              ) : sug.isStructured ? (
                <div className="rounded-lg bg-[var(--background)] border border-[var(--border)] px-3 py-2">
                  <StructuredDiff original={sug.originalValue} proposed={sug.originalValue} />
                </div>
              ) : (
                <div className="rounded-lg bg-[var(--background)] border border-[var(--border)] px-3 py-2">
                  <p className="text-sm text-[var(--dark-grey)] leading-relaxed whitespace-pre-wrap">
                    {sug.originalValue.trim() || <em className="text-[var(--dark-grey)]">Empty</em>}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--teal)] uppercase tracking-wide mb-1">Suggested</p>
              {sug.isRecipeLines ? (
                <IngredientDiff original={sug.originalValue} proposed={cardState.editedValue} />
              ) : sug.isStructured ? (
                <div className="rounded-lg bg-white border border-[var(--teal)]/30 px-3 py-2">
                  <StructuredDiff original={sug.originalValue} proposed={cardState.editedValue} />
                </div>
              ) : (
                <div className="rounded-lg bg-white border border-[var(--teal)]/30 px-3 py-2">
                  <DiffText original={sug.originalValue} proposed={cardState.editedValue} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Side-by-side on desktop */
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-[var(--dark-grey)] uppercase tracking-wide mb-1.5">Current</p>
              {sug.isRecipeLines ? (
                <IngredientTable value={sug.originalValue} />
              ) : sug.isStructured ? (
                <div className="rounded-lg bg-[var(--background)] border border-[var(--border)] px-3 py-2.5 min-h-[60px]">
                  <StructuredDiff original={sug.originalValue} proposed={sug.originalValue} />
                </div>
              ) : (
                <div className="rounded-lg bg-[var(--background)] border border-[var(--border)] px-3 py-2.5 min-h-[60px]">
                  <p className="text-sm text-[var(--dark-grey)] leading-relaxed whitespace-pre-wrap">
                    {sug.originalValue.trim() || <em className="text-[var(--dark-grey)]">Empty</em>}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--teal)] uppercase tracking-wide mb-1.5">Suggested</p>
              {sug.isRecipeLines ? (
                <IngredientDiff original={sug.originalValue} proposed={cardState.editedValue} />
              ) : sug.isStructured ? (
                <div className="rounded-lg bg-white border border-[var(--teal)]/30 px-3 py-2.5 min-h-[60px]">
                  <StructuredDiff original={sug.originalValue} proposed={cardState.editedValue} />
                </div>
              ) : (
                <div className="rounded-lg bg-white border border-[var(--teal)]/30 px-3 py-2.5 min-h-[60px]">
                  <DiffText original={sug.originalValue} proposed={cardState.editedValue} />
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Edit mode: form editor for structured fields, textarea for plain text */}
      {isEditing && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--teal)] uppercase tracking-wide">
            {sug.isRecipeLines ? "Edit Ingredients" : "Editing Suggested Text"}
          </p>
          {sug.isRecipeLines ? (
            <IngredientFormEditor value={cardState.editedValue} onChange={onEditChange} />
          ) : (
            <textarea
              ref={textareaRef}
              value={cardState.editedValue}
              onChange={(e) => onEditChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onEditSave();
                if (e.key === "Escape") onEditDiscard();
              }}
              aria-label={`Edit suggested text for ${sug.fieldLabel}`}
              className="w-full min-h-[80px] border border-[var(--teal)] rounded-lg p-3 text-sm resize-y focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)]"
            />
          )}
        </div>
      )}

      {/* TIM-2343: per-section self-consistency advisory. Surfaces narrative-
          vs-itself contradictions the proofreader caught that survived the
          regen attempt. Advisory only — Accept is not blocked. */}
      {sug.consistencyContradictions && sug.consistencyContradictions.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 space-y-2">
          <p className="text-xs font-medium text-amber-900 uppercase tracking-wide">
            Internal contradictions flagged ({sug.consistencyContradictions.length})
          </p>
          <ul className="space-y-2">
            {sug.consistencyContradictions.map((c, i) => (
              <li key={i} className="text-xs text-amber-900">
                <span className="inline-block rounded-full bg-amber-200 px-1.5 py-0.5 mr-1.5 text-[10px] font-medium uppercase tracking-wide">
                  {c.kind}
                </span>
                <span className="italic">&ldquo;{stripFindingTags(c.claim_a)}&rdquo;</span>
                <span className="px-1">vs.</span>
                <span className="italic">&ldquo;{stripFindingTags(c.claim_b)}&rdquo;</span>
                <span className="block mt-0.5 not-italic text-amber-800">{stripFindingTags(c.explanation)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-800">
            Review and edit before applying, or accept as-is if you intend the contrast.
          </p>
        </div>
      )}

      {/* Per-card error */}
      {cardState.applyError && (
        <p className="text-xs text-red-600 border border-red-200 rounded-lg px-3 py-2 bg-red-50">
          {cardState.applyError} <button type="button" className="underline ml-1" onClick={onAccept}>Try Again</button>
        </p>
      )}

      {/* Controls */}
      {readOnly ? (
        <p className="text-xs text-[var(--dark-grey)] pt-0.5">
          Updates automatically when you apply the equipment cost change.
        </p>
      ) : isEditing ? (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onEditSave}
            className="border border-[var(--teal)] text-[var(--teal)] text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--teal)]/5 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onEditDiscard}
            className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
          >
            Discard
          </button>
        </div>
      ) : isMobile ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-[var(--border)] -mx-4 -mb-4 mt-1">
          {[
            { label: "Accept", icon: <Check size={13} />, action: onAccept, active: isAccepted, activeCls: "bg-[var(--teal)] text-white" },
            { label: "Reject", icon: <X size={13} /> /* destructive — keep X */, action: onReject, active: isRejected, activeCls: "bg-red-50 text-red-600" },
            { label: "Edit", icon: <Pencil size={13} />, action: onEditStart, active: false, activeCls: "" },
          ].map(({ label, icon, action, active, activeCls }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              aria-label={`${label} this suggestion`}
              className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2.5 transition-colors border-r border-[var(--border)] last:border-r-0 ${
                active ? activeCls : "text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onAccept}
            aria-label="Accept this suggestion"
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isAccepted
                ? "bg-[var(--teal)] text-white"
                : "border border-[var(--teal)]/50 text-[var(--teal)] hover:bg-[var(--teal)]/5"
            }`}
          >
            <Check size={13} aria-hidden /> Accept
          </button>
          <button
            type="button"
            onClick={onReject}
            aria-label="Reject this suggestion"
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isRejected
                ? "bg-red-50 text-red-600 border border-red-200"
                : "border border-[var(--border)] text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--background)]"
            }`}
          >
            <X size={13} aria-hidden />{/* destructive — keep X */} Reject
          </button>
          <button
            type="button"
            onClick={onEditStart}
            aria-label="Edit this suggestion"
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--background)] transition-colors"
          >
            <Pencil size={13} aria-hidden /> Edit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

export function AIReviewModal({
  isOpen,
  onClose,
  onApply,
  suggestions,
  isStreaming = false,
  error = null,
  context,
}: AIReviewModalProps) {
  const [cardStates, setCardStates] = useState<Map<string, CardState>>(new Map());
  const [isApplying, setIsApplying] = useState(false);
  // TIM-1653: error from the apply call itself (e.g. a non-OK API response).
  // Shown in the footer so the accepted cards stay visible for retry.
  const [applyError, setApplyError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  const isMobile = viewportWidth < 640;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Reconcile card states when suggestions change. TIM-2331: streaming flows
  // (Regenerate all) grow the suggestions array one card at a time -- we must
  // preserve accept/reject choices on cards the user has already reviewed.
  // Only add cards for newly-arrived IDs and drop cards whose IDs are gone.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCardStates((prev) => {
      const next = new Map<string, CardState>();
      for (const s of suggestions) {
        next.set(s.id, prev.get(s.id) ?? initialCard(s));
      }
      return next;
    });
    setIsApplying(false);
    setApplyError(null);
  }, [suggestions]);

  // Escape key.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isApplying) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isApplying, onClose]);

  const updateCard = useCallback((id: string, patch: Partial<CardState>) => {
    setCardStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  }, []);

  // TIM-1798: derived/linked cards apply with the primary and are never separately
  // accepted, so counts reflect only the actionable (non-derived) changes.
  const actionable = useMemo(() => suggestions.filter((s) => !s.derived), [suggestions]);

  const acceptedCount = useMemo(
    () => actionable.filter((s) => cardStates.get(s.id)?.status === "accepted").length,
    [actionable, cardStates],
  );

  const totalCount = actionable.length;

  const statusLabel = acceptedCount === 0
    ? "None accepted yet"
    : acceptedCount === totalCount
    ? "All accepted"
    : `${acceptedCount} of ${totalCount} accepted`;

  const handleApply = useCallback(async () => {
    if (acceptedCount === 0 || isApplying) return;
    setIsApplying(true);
    setApplyError(null);
    const accepted: ApprovedChange[] = suggestions
      .filter((s) => cardStates.get(s.id)?.status === "accepted")
      .map((s) => {
        const card = cardStates.get(s.id)!;
        return {
          suggestionId: s.id,
          fieldId: s.fieldId,
          finalValue: card.editedValue,
          wasEdited: card.wasEdited,
        };
      });

    try {
      await onApply(accepted);
    } catch (e) {
      // TIM-1653: surface the failure in the footer. The accepted cards stay
      // visible (onApply rejecting means the caller did not clear them), so the
      // user can retry without re-reviewing.
      setApplyError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't apply your changes. Please try again.",
      );
    } finally {
      setIsApplying(false);
    }
  }, [acceptedCount, isApplying, suggestions, cardStates, onApply]);

  const subtitleParts = [context.workspace, context.section].filter(Boolean).join(" - ");

  // TIM-1798: when the primary equipment-cost card is edited, recompute the linked
  // Financials figures so the dependent totals stay coherent with the new price.
  const onPrimaryEditSave = useCallback(
    (sug: SuggestionPayload, editedValue: string) => {
      updateCard(sug.id, { status: "accepted", wasEdited: editedValue !== sug.proposedValue });
      if (!sug.recompute) return;
      const cents = parseFactValue("currency_cents", editedValue);
      if (typeof cents !== "number") return;
      for (const u of recomputeEquipmentLinked(sug.recompute, cents)) {
        updateCard(u.id, { editedValue: u.proposedValue });
      }
    },
    [updateCard],
  );

  const renderCard = (sug: SuggestionPayload) => {
    const cs = cardStates.get(sug.id) ?? initialCard(sug);
    return (
      <ChangeCard
        key={sug.id}
        sug={sug}
        cardState={cs}
        isMobile={isMobile}
        readOnly={!!sug.derived}
        onAccept={() => updateCard(sug.id, { status: "accepted" })}
        onReject={() => updateCard(sug.id, { status: "rejected" })}
        onEditStart={() => updateCard(sug.id, { status: "editing" })}
        onEditSave={() => onPrimaryEditSave(sug, cs.editedValue)}
        onEditDiscard={() =>
          updateCard(sug.id, {
            status: "unreviewed",
            editedValue: sug.proposedValue,
            wasEdited: false,
          })
        }
        onEditChange={(v) => updateCard(sug.id, { editedValue: v })}
      />
    );
  };

  // TIM-1798: cross-workspace proposals carry a workspaceLabel per card — group
  // them under a per-workspace header so the owner sees each change by suite.
  const isCrossWorkspace = suggestions.some((s) => s.workspaceLabel);
  const groups: Array<{ label: string; items: SuggestionPayload[] }> = [];
  if (isCrossWorkspace) {
    for (const s of suggestions) {
      const label = s.workspaceLabel ?? context.workspace;
      const g = groups.find((x) => x.label === label);
      if (g) g.items.push(s);
      else groups.push({ label, items: [s] });
    }
  }

  const cardList = (
    <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
      {isStreaming && suggestions.length === 0 ? (
        /* Skeleton loaders while streaming */
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="border border-[var(--border)] rounded-xl p-4 animate-pulse">
              <div className="h-3 w-24 bg-[var(--border)] rounded mb-3" />
              <div className="h-16 bg-[var(--border)] rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <AlertCircle className="w-8 h-8 text-[var(--dark-grey)]" />
          <p className="text-sm text-[var(--dark)]">{error}</p>
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <p className="text-sm text-[var(--dark-grey)]">
            {COPILOT_NAME} didn&apos;t have any suggestions for this.
          </p>
          <p className="text-xs text-[var(--dark-grey)]">
            Try adding more detail to your content first.
          </p>
        </div>
      ) : isCrossWorkspace ? (
        groups.map((g) => (
          <div key={g.label} className="space-y-3">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              {g.label}
            </p>
            {g.items.map(renderCard)}
          </div>
        ))
      ) : (
        suggestions.map(renderCard)
      )}
    </div>
  );

  const header = (
    <div className="px-6 py-5 border-b border-[var(--border)] flex items-start gap-3">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isStreaming ? "ai-streaming-avatar" : "ai-gradient-bg"
        }`}
      >
        <Sparkles size={16} className="text-white" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-[var(--dark)] leading-tight">
          {isStreaming ? `${COPILOT_NAME} is thinking...` : `Review ${COPILOT_NAME}'s suggestions`}
        </h2>
        {subtitleParts && (
          <p className="text-sm text-[var(--dark-grey)] mt-0.5 truncate">{subtitleParts}</p>
        )}
      </div>
      <CollapseButton
        onClick={onClose}
        size={16}
        className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 shrink-0 mt-0.5"
        aria-label="Close"
        disabled={isApplying}
      />
    </div>
  );

  const footer = (
    <div className="border-t border-[var(--border)]">
      {/* TIM-1653: apply-level error (e.g. a non-OK API response). Accepted cards above stay visible for retry. */}
      {applyError && (
        <p className="mx-6 mt-3 text-xs text-red-600 border border-red-200 rounded-lg px-3 py-2 bg-red-50 flex items-start gap-1.5">
          <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span>{applyError}</span>
        </p>
      )}
      <div className={`px-6 py-4 flex items-center ${isMobile ? "flex-col gap-2" : "justify-between"}`}>
      <span
        className={`text-sm font-medium ${
          acceptedCount === 0
            ? "text-[var(--dark-grey)]"
            : acceptedCount === totalCount
            ? "text-[var(--teal)]"
            : "text-[var(--teal)]"
        }`}
      >
        {statusLabel}
      </span>
      <div className={`flex items-center gap-2 ${isMobile ? "w-full flex-col" : ""}`}>
        <button
          type="button"
          onClick={isApplying ? undefined : onClose}
          disabled={isApplying}
          className={`text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 ${isMobile ? "w-full py-2 text-center" : ""}`}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={acceptedCount === 0 || isApplying || isStreaming}
          className={`bg-[var(--teal)] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isMobile ? "w-full" : ""}`}
        >
          {isApplying
            ? "Applying..."
            : acceptedCount > 0
            ? `Apply ${acceptedCount} ${acceptedCount === 1 ? "change" : "changes"}`
            : "Apply changes"}
        </button>
      </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  // ── Desktop: centered dialog ─────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${COPILOT_NAME}'s suggestions`}
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={isApplying ? undefined : onClose}
          aria-hidden="true"
        />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
          {header}
          {cardList}
          {footer}
        </div>
      </div>
    );
  }

  // ── Mobile: bottom sheet ─────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Review ${COPILOT_NAME}'s suggestions`}>
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isApplying ? undefined : onClose}
            aria-hidden="true"
          />
          <motion.div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white flex flex-col"
            style={{ maxHeight: "90vh", minHeight: "60vh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
            </div>
            {header}
            {cardList}
            {footer}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
