"use client";

// TIM-1176: Section F — Spreadsheet import modal.
// Upload .xlsx / .csv → AI-parse → editable preview → commit to equipment table.

import { useRef, useState } from "react";
import { X, Upload, Trash2, ChevronDown } from "lucide-react";
import { useCurrency } from "@/components/CurrencyProvider";
import type { ParsedRow } from "@/app/api/workspaces/buildout/import/route";
import type { ListSection } from "@/types/buildout";
import type { EquipmentItem } from "@/app/(app)/workspace/financials/financials-workspace";

// ── Category / station constants ──────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "espresso_station",    label: "Espresso Station" },
  { value: "brew_platform",       label: "Brew Platform" },
  { value: "milk_beverage_prep",  label: "Milk & Beverage Prep" },
  { value: "refrigeration",       label: "Refrigeration" },
  { value: "plumbing_water",      label: "Plumbing & Water" },
  { value: "electrical",          label: "Electrical" },
  { value: "pos_tech",            label: "POS & Technology" },
  { value: "furniture_fixtures",  label: "Furniture & Fixtures" },
  { value: "signage_decor",       label: "Signage & Decor" },
  { value: "smallwares",          label: "Smallwares" },
  { value: "ceramics",            label: "Ceramics" },
  { value: "glassware",           label: "Glassware" },
  { value: "to_go_ware",          label: "To-Go Ware" },
  { value: "miscellaneous",       label: "Miscellaneous" },
];

// ── Step types ────────────────────────────────────────────────────────────────

type Step = "upload" | "parsing" | "preview" | "committing" | "done";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sections: ListSection[];
  onClose: () => void;
  onCommitted: (newItems: EquipmentItem[], newSections: ListSection[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarStringToCents(s: string): number {
  const n = parseFloat(s.replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SpreadsheetImportModal({ sections, onClose, onCommitted }: Props) {
  const { format } = useCurrency();
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build station name list from existing sections + parsed rows
  const existingStationNames = sections.map((s) => s.name);
  const parsedStationNames = [...new Set(rows.map((r) => r.section_name).filter(Boolean))];
  const allStationNames = [...new Set([...existingStationNames, ...parsedStationNames])].sort();

  // ── File selection + upload ──

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAndParse(file);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadAndParse(file);
  }

  async function uploadAndParse(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
      setError("Only .xlsx and .csv files are supported.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File is too large. Maximum size is 5 MB.");
      return;
    }

    setError(null);
    setStep("parsing");
    setUploadProgress("Uploading file...");

    const fd = new FormData();
    fd.append("file", file);

    try {
      setUploadProgress("Parsing spreadsheet and mapping columns with AI...");
      const res = await fetch("/api/workspaces/buildout/import", {
        method: "POST",
        body: fd,
      });

      if (res.status === 402) {
        setStep("upload");
        setError("Subscription required to use the import feature.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Parse failed (${res.status})`);
      }

      const data = await res.json() as { rows: ParsedRow[] };
      setRows(data.rows ?? []);
      setStep("preview");
    } catch (err) {
      setStep("upload");
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
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
      setError("No rows selected to import.");
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

      // Reload equipment + sections for the parent
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

  // ── Summary stats ──

  const activeRows = rows.filter((r) => !r.skip);
  const totalCents = activeRows.reduce((s, r) => s + r.unit_cost_cents * r.quantity, 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[51] flex flex-col max-h-[92dvh] bg-white rounded-t-2xl shadow-2xl lg:inset-x-auto lg:inset-y-auto lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:w-[min(94vw,64rem)] lg:max-h-[90vh] lg:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)]">Import from Spreadsheet</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Upload a .xlsx or .csv file — AI maps columns and assigns stations automatically.
            </p>
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

        <div className="flex-1 px-6 py-5 overflow-y-auto">

          {/* ── Step: upload ── */}
          {(step === "upload") && (
            <div>
              <div
                className="border-2 border-dashed border-[var(--teal-bg-d0)] rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--teal)] hover:bg-[var(--teal-tint-500)] transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} className="text-[var(--teal)] mb-3" aria-hidden="true" />
                <p className="text-sm font-semibold text-[var(--foreground)]">Drop a spreadsheet here, or click to browse</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Supports .xlsx and .csv — max 5 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                onChange={handleFileChange}
              />
              {error && (
                <p className="mt-3 text-sm text-[var(--error)]">{error}</p>
              )}
            </div>
          )}

          {/* ── Step: parsing ── */}
          {step === "parsing" && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-semibold text-[var(--foreground)]">{uploadProgress || "Processing..."}</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">This usually takes 10–20 seconds.</p>
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
                  <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Rows to Import</p>
                  <p className="text-sm font-bold text-[var(--teal)]">{activeRows.length}</p>
                </div>
                {totalCents > 0 && (
                  <>
                    <div className="h-8 w-px bg-[var(--border)]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wide">Total Value</p>
                      <p className="text-sm font-bold text-[var(--foreground)]">{format(totalCents / 100)}</p>
                    </div>
                  </>
                )}
                <div className="ml-auto text-xs text-[var(--muted-foreground)]">
                  Edit any cell before committing. Uncheck rows to skip them.
                </div>
              </div>

              {rows.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-8">No rows were parsed from the file.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-[var(--gray-100)] border-b border-[var(--border)]">
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] w-8"></th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[180px]">Name</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[150px]">Station</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[110px]">Brand</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[110px]">Model</th>
                        <th className="text-left px-3 py-2 font-semibold text-[var(--muted-foreground)] min-w-[110px]">Vendor</th>
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
              <p className="text-sm font-semibold text-[var(--foreground)]">Saving equipment items...</p>
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
              <p className="text-sm font-bold text-[var(--foreground)]">Import complete</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Your equipment list has been updated.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 text-sm font-semibold bg-[var(--teal)] text-white px-5 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="px-6 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => { setStep("upload"); setRows([]); setError(null); }}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Upload different file
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={activeRows.length === 0}
              className="text-sm font-semibold bg-[var(--teal)] text-white px-6 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
            >
              Commit {activeRows.length} {activeRows.length === 1 ? "item" : "items"}
            </button>
          </div>
        )}
      </div>
    </>
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
    <tr
      className={`border-b border-[var(--neutral-cool-150)] ${skipped ? "opacity-40" : "hover:bg-[var(--neutral-cool-50)]"}`}
    >
      {/* Skip toggle */}
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          checked={!skipped}
          onChange={(e) => onChange({ skip: !e.target.checked })}
          className="accent-[var(--teal)] w-3.5 h-3.5"
          aria-label="Include row"
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

      {/* Model */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.model}
          onChange={(e) => onChange({ model: e.target.value })}
          disabled={skipped}
          placeholder="Model"
          className="w-full text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none placeholder:text-[var(--neutral-cool-400)]"
        />
      </td>

      {/* Vendor/Supplier */}
      <td className="px-2 py-1.5">
        <input
          type="text"
          value={row.supplier}
          onChange={(e) => onChange({ supplier: e.target.value })}
          disabled={skipped}
          placeholder="Vendor"
          className="w-full text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none placeholder:text-[var(--neutral-cool-400)]"
        />
      </td>

      {/* Cost */}
      <td className="px-2 py-1.5 text-right">
        <input
          type="text"
          value={centsToDollarString(row.unit_cost_cents)}
          onChange={(e) => onChange({ unit_cost_cents: dollarStringToCents(e.target.value) })}
          disabled={skipped}
          className="w-full text-right text-xs text-[var(--foreground)] bg-transparent border border-transparent rounded px-1 py-0.5 hover:border-[var(--neutral-cool-350)] focus:border-[var(--teal)] focus-visible:outline-none transition-colors disabled:pointer-events-none"
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
          aria-label="Remove row"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
  );
}
