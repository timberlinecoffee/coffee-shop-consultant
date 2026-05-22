"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { MenuItem, MenuItemCategory } from "./MenuItemsTable";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowNum: number;
  name: string;
  category: MenuItemCategory | null;
  price_cents: number | null;
  cogs_cents: number | null;
  expected_mix_pct: number;
  prep_time_seconds: number | null;
  notes: string | null;
  errors: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_ALIASES: Record<string, MenuItemCategory> = {
  espresso: "espresso", esp: "espresso", expresso: "espresso",
  drip: "drip", coffee: "drip", "drip coffee": "drip", "filter coffee": "drip",
  specialty: "specialty", spc: "specialty", specials: "specialty",
  food: "food", snack: "food", snacks: "food",
  retail: "retail", merch: "retail", merchandise: "retail",
  other: "other", misc: "other",
};

const COL_MAP: Record<string, string> = {
  name: "name", item: "name", "item name": "name", item_name: "name", product: "name",
  category: "category", cat: "category", type: "category",
  price: "price", price_cents: "price", "selling price": "price", retail_price: "price",
  cogs: "cogs", cogs_cents: "cogs", cost: "cogs", "cost of goods": "cogs", cog: "cogs",
  mix: "mix_pct", mix_pct: "mix_pct", expected_mix_pct: "mix_pct", "mix%": "mix_pct",
  "mix percent": "mix_pct", mix_percent: "mix_pct",
  prep: "prep_time", prep_time: "prep_time", prep_time_seconds: "prep_time",
  prep_seconds: "prep_time", "prep time": "prep_time", "prep time (sec)": "prep_time",
  notes: "notes", note: "notes", description: "notes", comments: "notes",
};

// ── Parsers ────────────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  const k = h.trim().toLowerCase();
  return COL_MAP[k] ?? k.replace(/\s+/g, "_");
}

function detectSep(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  return (firstLine.match(/\t/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length
    ? "\t"
    : ",";
}

function splitRow(line: string, sep: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      result.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map((s) => s.replace(/^"|"$/g, "").trim());
}

function parseDollars(val: string): number | null {
  const n = parseFloat(val.replace(/[$,\s]/g, ""));
  return isNaN(n) ? null : Math.round(n * 100);
}

function parsePct(val: string): number | null {
  const n = parseFloat(val.replace(/[%\s]/g, ""));
  return isNaN(n) ? null : Math.max(0, n);
}

function parseTabularText(text: string): ParsedRow[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = detectSep(text);
  const headers = splitRow(lines[0], sep).map(normalizeHeader);

  return lines.slice(1, 101).map((line, i) => {
    const cells = splitRow(line, sep);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => { raw[h] = cells[idx] ?? ""; });

    const errors: string[] = [];

    const name = (raw["name"] ?? "").trim();
    if (!name) errors.push("Missing: name");

    const rawCat = (raw["category"] ?? "").trim().toLowerCase();
    const category: MenuItemCategory | null = rawCat
      ? (CATEGORY_ALIASES[rawCat] ?? null)
      : null;
    if (!rawCat) errors.push("Missing: category");
    else if (!category) errors.push(`Unknown category: "${raw["category"]}" — use espresso, drip, specialty, food, retail, or other`);

    const rawPrice = (raw["price"] ?? "").trim();
    const price_cents = rawPrice ? parseDollars(rawPrice) : null;
    if (!rawPrice) errors.push("Missing: price");
    else if (price_cents === null) errors.push(`Invalid price: "${rawPrice}"`);

    const rawCogs = (raw["cogs"] ?? "").trim();
    const cogs_cents = rawCogs ? parseDollars(rawCogs) : null;
    if (!rawCogs) errors.push("Missing: cogs");
    else if (cogs_cents === null) errors.push(`Invalid cogs: "${rawCogs}"`);

    const rawMix = (raw["mix_pct"] ?? "").trim();
    const mix_pct = rawMix ? parsePct(rawMix) : null;
    if (rawMix && mix_pct === null) errors.push(`Invalid mix%: "${rawMix}"`);

    const rawPrep = (raw["prep_time"] ?? "").trim();
    const prep_int = rawPrep ? parseInt(rawPrep, 10) : null;
    if (rawPrep && (prep_int === null || isNaN(prep_int))) errors.push(`Invalid prep time: "${rawPrep}" (must be whole seconds)`);

    return {
      rowNum: i + 2,
      name,
      category,
      price_cents,
      cogs_cents,
      expected_mix_pct: mix_pct ?? 0,
      prep_time_seconds: rawPrep && prep_int !== null && !isNaN(prep_int) ? prep_int : null,
      notes: (raw["notes"] ?? "").trim() || null,
      errors,
    };
  });
}

// ── BulkImportDrawer ──────────────────────────────────────────────────────────

interface Props {
  planId: string;
  open: boolean;
  onClose: () => void;
  onImported: (items: MenuItem[]) => void;
}

type Step = "input" | "preview";
type InputMode = "paste" | "upload";

export function BulkImportDrawer({ planId, open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set());
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setStep("input");
      setInputMode("paste");
      setPasteText("");
      setRows([]);
      setRemovedRows(new Set());
      setCommitting(false);
      setCommitError(null);
      setImportedCount(null);
    }
  }, [open]);

  const parseAndPreview = useCallback((text: string) => {
    const parsed = parseTabularText(text);
    setRows(parsed);
    setRemovedRows(new Set());
    setStep("preview");
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseAndPreview(text);
    };
    reader.readAsText(file);
  }, [parseAndPreview]);

  const activeRows = rows.filter((r) => !removedRows.has(r.rowNum));
  const errorRows = activeRows.filter((r) => r.errors.length > 0);
  const canCommit = activeRows.length > 0 && errorRows.length === 0 && !committing && importedCount === null;

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setCommitting(true);
    setCommitError(null);

    const payload = activeRows.map((r) => ({
      name: r.name,
      category: r.category!,
      price_cents: r.price_cents!,
      cogs_cents: r.cogs_cents!,
      expected_mix_pct: r.expected_mix_pct,
      prep_time_seconds: r.prep_time_seconds,
      notes: r.notes,
    }));

    try {
      const res = await fetch("/api/menu-items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, items: payload }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setCommitError(data.error ?? "Failed to import items — please try again");
        setCommitting(false);
        return;
      }

      const { items } = await res.json();
      setImportedCount(items.length);
      onImported(items);
    } catch {
      setCommitError("Network error — please try again");
    } finally {
      setCommitting(false);
    }
  }, [canCommit, activeRows, planId, onImported]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl w-full max-w-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Bulk import menu items"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Bulk import</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Paste from Google Sheets or upload a .csv — max 100 rows
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="Close drawer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Step 1: Input ─────────────────────────────────── */}
          {step === "input" && (
            <div className="px-6 py-5 flex flex-col gap-5">
              <div className="flex gap-2">
                {(["paste", "upload"] as InputMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setInputMode(mode)}
                    className={cn(
                      "px-4 py-1.5 text-sm rounded-lg font-medium transition-colors",
                      inputMode === mode
                        ? "bg-teal text-white"
                        : "text-neutral-600 hover:bg-neutral-100"
                    )}
                  >
                    {mode === "paste" ? "Paste from spreadsheet" : "Upload CSV"}
                  </button>
                ))}
              </div>

              <div className="bg-neutral-50 rounded-xl px-4 py-3 text-xs text-neutral-600 border border-neutral-200 leading-relaxed">
                <p>
                  <span className="font-semibold text-neutral-800">Required columns:</span>{" "}
                  {["name", "category", "price", "cogs"].map((c) => (
                    <code key={c} className="bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700 mx-0.5">{c}</code>
                  ))}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-neutral-800">Optional:</span>{" "}
                  {["expected_mix_pct", "prep_time_seconds", "notes"].map((c) => (
                    <code key={c} className="bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700 mx-0.5">{c}</code>
                  ))}
                </p>
                <p className="mt-1">
                  <span className="font-semibold text-neutral-800">Categories:</span>{" "}
                  {["espresso", "drip", "specialty", "food", "retail", "other"].map((c) => (
                    <code key={c} className="bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700 mx-0.5">{c}</code>
                  ))}
                </p>
              </div>

              {inputMode === "paste" ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-neutral-700">
                    Paste spreadsheet content (TSV or CSV with header row)
                  </label>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"name\tcategory\tprice\tcogs\nLatte\tespresso\t5.50\t1.75\nDrip Coffee\tdrip\t3.00\t0.45"}
                    rows={10}
                    className="w-full text-xs font-mono border border-neutral-300 rounded-xl px-3 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-teal/40 focus:border-teal transition-shadow placeholder-neutral-300"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-neutral-300 rounded-xl py-14 px-6 cursor-pointer hover:border-teal/50 hover:bg-teal/5 transition-colors"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileUpload(file);
                  }}
                >
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" x2="8" y1="13" y2="13"/>
                    <line x1="16" x2="8" y1="17" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  <div className="text-center">
                    <p className="text-sm font-medium text-neutral-700">Drop a .csv file here</p>
                    <p className="text-xs text-neutral-400 mt-1">or click to browse</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Preview ───────────────────────────────── */}
          {step === "preview" && (
            <div className="flex flex-col">
              {/* Success banner */}
              {importedCount !== null && (
                <div className="mx-6 mt-5 mb-1 px-4 py-3 rounded-xl text-sm bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
                  </svg>
                  <span className="font-medium">{importedCount} item{importedCount !== 1 ? "s" : ""} imported.</span>
                  {" "}Close to see them in the table.
                </div>
              )}

              {/* Validation summary */}
              {importedCount === null && (
                <div className={cn(
                  "mx-6 mt-5 mb-1 px-4 py-3 rounded-xl text-sm flex items-start gap-2 border",
                  errorRows.length > 0
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}>
                  {errorRows.length > 0 ? (
                    <>
                      <svg className="mt-0.5 flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
                      </svg>
                      <span>
                        <span className="font-medium">{errorRows.length} row{errorRows.length > 1 ? "s" : ""} with errors.</span>
                        {" "}Fix or remove them (×) before committing.
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="mt-0.5 flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
                      </svg>
                      <span>
                        <span className="font-medium">{activeRows.length} row{activeRows.length !== 1 ? "s" : ""} ready to import.</span>
                        {" "}All columns validated.
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Commit error */}
              {commitError && (
                <div className="mx-6 mt-2 px-4 py-3 rounded-xl text-sm bg-red-50 text-red-700 border border-red-200">
                  {commitError}
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-neutral-200 text-neutral-500 uppercase tracking-wide font-semibold">
                      <th className="pl-6 pr-2 py-2.5">#</th>
                      <th className="px-2 py-2.5 min-w-[120px]">Name</th>
                      <th className="px-2 py-2.5">Category</th>
                      <th className="px-2 py-2.5 text-right">Price</th>
                      <th className="px-2 py-2.5 text-right">COGS</th>
                      <th className="px-2 py-2.5 text-right">Mix%</th>
                      <th className="px-2 py-2.5 min-w-[160px]">Errors</th>
                      <th className="pr-4 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const removed = removedRows.has(row.rowNum);
                      const hasErrors = row.errors.length > 0;
                      return (
                        <tr
                          key={row.rowNum}
                          className={cn(
                            "border-b border-neutral-100 transition-colors",
                            removed && "opacity-40 bg-neutral-50",
                            !removed && hasErrors && "bg-red-50/50",
                            !removed && !hasErrors && "hover:bg-neutral-50/60"
                          )}
                        >
                          <td className="pl-6 pr-2 py-2 text-neutral-400 tabular-nums">{row.rowNum}</td>
                          <td className={cn("px-2 py-2 font-medium text-neutral-800 max-w-[120px] truncate", removed && "line-through")}>
                            {row.name || <span className="text-red-400 italic not-italic font-normal">empty</span>}
                          </td>
                          <td className="px-2 py-2 text-neutral-600">
                            {row.category ?? <span className="text-red-400">?</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {row.price_cents !== null
                              ? `$${(row.price_cents / 100).toFixed(2)}`
                              : <span className="text-red-400">?</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {row.cogs_cents !== null
                              ? `$${(row.cogs_cents / 100).toFixed(2)}`
                              : <span className="text-red-400">?</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-neutral-500">
                            {row.expected_mix_pct > 0 ? `${row.expected_mix_pct}%` : <span className="text-neutral-300">--</span>}
                          </td>
                          <td className="px-2 py-2 text-red-600 max-w-[200px]">
                            {!removed && hasErrors && (
                              <span title={row.errors.join("\n")} className="block truncate">
                                {row.errors[0]}
                                {row.errors.length > 1 && ` (+${row.errors.length - 1})`}
                              </span>
                            )}
                          </td>
                          <td className="pr-4 py-2">
                            {!removed ? (
                              <button
                                onClick={() => setRemovedRows((s) => new Set([...s, row.rowNum]))}
                                title="Remove this row"
                                className="p-1 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={() => setRemovedRows((s) => { const n = new Set(s); n.delete(row.rowNum); return n; })}
                                title="Restore this row"
                                className="p-1 rounded text-neutral-300 hover:text-teal hover:bg-teal/10 transition-colors"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                  <path d="M3 3v5h5"/>
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {rows.length === 0 && (
                  <div className="text-center py-10 text-sm text-neutral-400">
                    No data rows found — check that your input has a header row.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between gap-3 bg-white flex-shrink-0">
          {step === "input" ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => parseAndPreview(pasteText)}
                disabled={inputMode === "paste" && !pasteText.trim()}
                className="px-5 py-2 bg-teal text-white text-sm font-medium rounded-xl hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Preview →
              </button>
            </>
          ) : importedCount !== null ? (
            <>
              <span />
              <button
                onClick={onClose}
                className="px-5 py-2 bg-teal text-white text-sm font-medium rounded-xl hover:bg-teal/90 transition-colors"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep("input"); setRows([]); setRemovedRows(new Set()); setCommitError(null); }}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleCommit}
                disabled={!canCommit}
                className="px-5 py-2 bg-teal text-white text-sm font-medium rounded-xl hover:bg-teal/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
              >
                {committing ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Importing…
                  </>
                ) : (
                  `Import ${activeRows.length} item${activeRows.length !== 1 ? "s" : ""}`
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
