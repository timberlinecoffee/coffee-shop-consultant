"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MenuItemCategory = "espresso" | "drip" | "specialty" | "food" | "retail" | "other";

export interface MenuItem {
  id: string;
  plan_id: string;
  position: number;
  name: string;
  category: MenuItemCategory;
  price_cents: number;
  cogs_cents: number;
  expected_mix_pct: number;
  prep_time_seconds: number | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

type SortField = "category" | "margin";
type SortDir = "asc" | "desc";

const CATEGORY_LABELS: Record<MenuItemCategory, string> = {
  espresso: "Espresso",
  drip: "Drip",
  specialty: "Specialty",
  food: "Food",
  retail: "Retail",
  other: "Other",
};

const CATEGORIES: MenuItemCategory[] = ["espresso", "drip", "specialty", "food", "retail", "other"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeMargin(price_cents: number, cogs_cents: number): number | null {
  if (price_cents <= 0) return null;
  return ((price_cents - cogs_cents) / price_cents) * 100;
}

function fmtPct(val: number | null): string {
  if (val === null) return "--";
  return `${val.toFixed(1)}%`;
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parseDollars(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// Footer: weighted avg margin pct
function computeFooter(items: MenuItem[]) {
  const active = items.filter((i) => !i.archived);
  if (active.length === 0) return null;

  const count = active.length;

  const totalMix = active.reduce((s, i) => s + i.expected_mix_pct, 0);

  // Avg margin: simple mean of margin_pct per item (skip items with price=0)
  const priced = active.filter((i) => i.price_cents > 0);
  const avgMargin = priced.length > 0
    ? priced.reduce((s, i) => s + computeMargin(i.price_cents, i.cogs_cents)!, 0) / priced.length
    : null;

  // Weighted margin: sum(mix_i * margin_i) / sum(mix_i) for items with price > 0
  const pricedWithMix = active.filter((i) => i.price_cents > 0 && i.expected_mix_pct > 0);
  let weightedMargin: number | null = null;
  if (pricedWithMix.length > 0) {
    const sumMix = pricedWithMix.reduce((s, i) => s + i.expected_mix_pct, 0);
    const sumWeighted = pricedWithMix.reduce(
      (s, i) => s + i.expected_mix_pct * computeMargin(i.price_cents, i.cogs_cents)!,
      0
    );
    weightedMargin = sumMix > 0 ? sumWeighted / sumMix : null;
  }

  // Margin contribution per 100 covers (customers)
  // Z = sum(mix_i * (price_i - cogs_i)) / totalMix / 100  [dollars]
  let marginPer100: number | null = null;
  if (totalMix > 0) {
    const sumContrib = active.reduce(
      (s, i) => s + i.expected_mix_pct * (i.price_cents - i.cogs_cents),
      0
    );
    marginPer100 = sumContrib / totalMix / 100;
  }

  return { count, avgMargin, weightedMargin, marginPer100 };
}

// ── Editable Cell ─────────────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  isLast?: boolean;
  onTabFromLast?: () => void;
  type?: "text" | "number";
  align?: "left" | "right";
}

function EditableCell({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  isLast,
  onTabFromLast,
  type = "text",
  align = "left",
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sync external value changes when not editing
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  return (
    <td
      className={cn(
        "px-2 py-1.5 whitespace-nowrap text-sm",
        align === "right" && "text-right",
        className
      )}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
            if (e.key === "Tab" && isLast) {
              e.preventDefault();
              commit();
              onTabFromLast?.();
            }
          }}
          className={cn(
            "w-full border-0 border-b border-teal bg-transparent outline-none text-sm px-0 py-0",
            align === "right" && "text-right",
            inputClassName
          )}
        />
      ) : (
        <span
          className={cn(
            "block cursor-text rounded px-1 py-0.5 hover:bg-neutral-100 min-w-[40px]",
            !value && "text-neutral-400",
            align === "right" && "text-right"
          )}
        >
          {value || placeholder}
        </span>
      )}
    </td>
  );
}

// ── Select Cell ───────────────────────────────────────────────────────────────

interface SelectCellProps {
  value: MenuItemCategory;
  onSave: (val: MenuItemCategory) => void;
}

function SelectCell({ value, onSave }: SelectCellProps) {
  const [editing, setEditing] = useState(false);

  return (
    <td className="px-2 py-1.5 whitespace-nowrap text-sm" onClick={() => setEditing(true)}>
      {editing ? (
        <select
          autoFocus
          value={value}
          onChange={(e) => {
            onSave(e.target.value as MenuItemCategory);
            setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          className="border-0 border-b border-teal bg-transparent outline-none text-sm py-0"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      ) : (
        <span className="block cursor-text rounded px-1 py-0.5 hover:bg-neutral-100">
          {CATEGORY_LABELS[value]}
        </span>
      )}
    </td>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  item: MenuItem;
  onUpdate: (id: string, patch: Partial<MenuItem>) => void;
  onDelete: (id: string) => void;
  onTabFromLast: () => void;
}

function Row({ item, onUpdate, onDelete, onTabFromLast }: RowProps) {
  const margin = computeMargin(item.price_cents, item.cogs_cents);
  const marginColor =
    margin === null ? "text-neutral-400"
    : margin >= 65 ? "text-emerald-600"
    : margin >= 45 ? "text-amber-600"
    : "text-red-600";

  return (
    <tr className="group border-b border-neutral-100 hover:bg-neutral-50/60 transition-colors">
      <EditableCell
        value={item.name}
        placeholder="Item name"
        onSave={(v) => onUpdate(item.id, { name: v })}
        className="min-w-[140px]"
      />
      <SelectCell
        value={item.category}
        onSave={(v) => onUpdate(item.id, { category: v })}
      />
      <EditableCell
        value={item.price_cents > 0 ? (item.price_cents / 100).toFixed(2) : ""}
        placeholder="0.00"
        type="number"
        align="right"
        onSave={(v) => onUpdate(item.id, { price_cents: parseDollars(v) })}
        className="w-20"
      />
      <EditableCell
        value={item.cogs_cents > 0 ? (item.cogs_cents / 100).toFixed(2) : ""}
        placeholder="0.00"
        type="number"
        align="right"
        onSave={(v) => onUpdate(item.id, { cogs_cents: parseDollars(v) })}
        className="w-20"
      />
      <td className={cn("px-2 py-1.5 text-sm text-right font-medium w-16 tabular-nums", marginColor)}>
        {fmtPct(margin)}
      </td>
      <EditableCell
        value={item.expected_mix_pct > 0 ? item.expected_mix_pct.toFixed(1) : ""}
        placeholder="0.0"
        type="number"
        align="right"
        onSave={(v) => onUpdate(item.id, { expected_mix_pct: Math.max(0, parseFloat(v) || 0) })}
        className="w-16"
        isLast
        onTabFromLast={onTabFromLast}
      />
      <td className="px-2 py-1.5 text-sm text-right text-neutral-400 w-16">
        {item.prep_time_seconds != null
          ? `${Math.round(item.prep_time_seconds / 60)}m`
          : <span className="text-neutral-200">--</span>}
      </td>
      <td className="px-2 py-1.5 w-8 text-right">
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-500 p-1 rounded"
          aria-label="Delete item"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ── Footer Summary ────────────────────────────────────────────────────────────

function FooterSummary({ items }: { items: MenuItem[] }) {
  const stats = computeFooter(items);
  if (!stats) return null;

  const { count, avgMargin, weightedMargin, marginPer100 } = stats;

  return (
    <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 text-sm text-neutral-600 flex flex-wrap gap-x-4 gap-y-1">
      <span>
        <span className="font-medium text-neutral-900">{count}</span>{" "}
        {count === 1 ? "item" : "items"}
      </span>
      <span className="text-neutral-300">·</span>
      <span>
        Avg margin{" "}
        <span className="font-medium text-neutral-900">{fmtPct(avgMargin)}</span>
      </span>
      <span className="text-neutral-300">·</span>
      <span>
        Weighted margin{" "}
        <span className="font-medium text-neutral-900">{fmtPct(weightedMargin)}</span>
      </span>
      <span className="text-neutral-300">·</span>
      <span>
        Margin per 100 covers{" "}
        <span className="font-medium text-neutral-900">
          {marginPer100 !== null ? `$${marginPer100.toFixed(2)}` : "--"}
        </span>
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface MenuItemsTableProps {
  planId: string;
  initialItems?: MenuItem[];
}

export function MenuItemsTable({ planId, initialItems = [] }: MenuItemsTableProps) {
  const [items, setItems] = useState<MenuItem[]>(initialItems);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // ── Sort logic ───────────────────────────────────────────────────────────
  const sorted = [...items].sort((a, b) => {
    if (!sortField) return a.position - b.position;
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortField === "category") return mul * a.category.localeCompare(b.category);
    if (sortField === "margin") {
      const ma = computeMargin(a.price_cents, a.cogs_cents) ?? -Infinity;
      const mb = computeMargin(b.price_cents, b.cogs_cents) ?? -Infinity;
      return mul * (ma - mb);
    }
    return 0;
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return <span className="ml-0.5 text-neutral-300">↕</span>;
    return <span className="ml-0.5 text-teal">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  // ── Optimistic update + persist ──────────────────────────────────────────
  const handleUpdate = useCallback(
    async (id: string, patch: Partial<MenuItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      );
      setSaving((s) => new Set(s).add(id));
      try {
        await fetch(`/api/menu-items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } finally {
        setSaving((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  // ── Delete (soft) ────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await fetch(`/api/menu-items/${id}`, { method: "DELETE" });
  }, []);

  // ── Add new row ──────────────────────────────────────────────────────────
  const handleAddRow = useCallback(async () => {
    const res = await fetch("/api/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId,
        name: "",
        category: "espresso",
        price_cents: 0,
        cogs_cents: 0,
        expected_mix_pct: 0,
      }),
    });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => [...prev, item]);
    }
  }, [planId]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l4-4 4 4 4-4 4 4"/>
            <path d="M3 19h18"/>
            <path d="M3 15h18"/>
          </svg>
        </div>
        <p className="text-neutral-700 font-medium mb-1">Your menu is empty</p>
        <p className="text-sm text-neutral-500 mb-6 max-w-xs">
          Add items to start tracking prices, costs, and margin across your menu.
        </p>
        <button
          onClick={handleAddRow}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal text-white text-sm font-medium rounded-xl hover:bg-teal/90 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
          </svg>
          Add your first item
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              <th className="px-2 py-2.5 min-w-[140px]">Item</th>
              <th
                className="px-2 py-2.5 cursor-pointer hover:text-neutral-900 transition-colors select-none"
                onClick={() => toggleSort("category")}
              >
                Category{sortIcon("category")}
              </th>
              <th className="px-2 py-2.5 text-right w-20">Price</th>
              <th className="px-2 py-2.5 text-right w-20">COGS</th>
              <th
                className="px-2 py-2.5 text-right w-16 cursor-pointer hover:text-neutral-900 transition-colors select-none"
                onClick={() => toggleSort("margin")}
              >
                Margin{sortIcon("margin")}
              </th>
              <th className="px-2 py-2.5 text-right w-16">Mix%</th>
              <th className="px-2 py-2.5 text-right w-16 text-neutral-400">Prep</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <Row
                key={item.id}
                item={item}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onTabFromLast={handleAddRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row button */}
      <div className="px-2 py-2 border-b border-neutral-100">
        <button
          onClick={handleAddRow}
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-teal transition-colors px-1 py-1 rounded hover:bg-neutral-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>
          </svg>
          Add item
        </button>
      </div>

      {/* Footer summary */}
      <FooterSummary items={items} />

      {/* Saving indicator */}
      {saving.size > 0 && (
        <div className="px-4 py-1.5 text-xs text-neutral-400 flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
          Saving...
        </div>
      )}
    </div>
  );
}
