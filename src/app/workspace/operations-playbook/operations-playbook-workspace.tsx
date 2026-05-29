"use client";

// TIM-1061: Operations Playbook workspace — 6 SOP tabs, editable intro + checklist items.
// Each item is reorderable (up/down), editable inline, deletable. AI Improve button per
// SOP calls /api/workspaces/operations_playbook/generate?section=<key>.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Sparkles,
  Check,
  Printer,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import {
  type OperationsPlaybookDocument,
  type SopCategoryKey,
  type SopChecklistItem,
  type SopCadence,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  SOP_CATEGORY_TAGLINES,
} from "@/lib/operations-playbook";

// ── Shared styles — match Concept / Marketing tokens ────────────────────────

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const textareaCls = `${inputCls} resize-none leading-relaxed`;
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
const sectionLabelCls =
  "text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] mb-3";
const cardCls = "rounded-2xl border border-[var(--border)] bg-white";
const helperCls = "text-[10px] text-[var(--dark-grey)] mt-1";

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

interface Props {
  planId: string;
  canEdit: boolean;
  initialDoc: OperationsPlaybookDocument;
  conceptShopIdentity: string;
  initialTrialMessagesUsed?: number;
}

export function OperationsPlaybookWorkspace({
  planId,
  canEdit,
  initialDoc,
  initialTrialMessagesUsed,
}: Props) {
  const [doc, setDoc] = useState<OperationsPlaybookDocument>(initialDoc);
  const [active, setActive] = useState<SopCategoryKey>("opening");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<
    "no_subscription" | "paused" | "expired" | null
  >(null);
  const [generating, setGenerating] = useState<SopCategoryKey | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/operations_playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: docRef.current }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setPaywallReason(body?.reason ?? "no_subscription");
        return;
      }
      if (res.ok) {
        setSavedAt(new Date().toISOString());
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit]);

  // Debounced autosave on doc change (skips initial mount).
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void save();
    }, 700);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [doc, save]);

  const updateDoc = useCallback(
    (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => {
      setDoc((prev) => mut(prev));
    },
    [],
  );

  async function handleGenerate(section: SopCategoryKey) {
    if (!canEdit || generating) return;
    setGenerating(section);
    try {
      const res = await fetch("/api/workspaces/operations_playbook/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setPaywallReason(body?.reason ?? "no_subscription");
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { content: OperationsPlaybookDocument };
      setDoc(body.content);
      setSavedAt(new Date().toISOString());
    } finally {
      setGenerating(null);
    }
  }

  const activeLabel = SOP_CATEGORY_LABELS[active];

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <ClipboardList
                className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
                aria-hidden="true"
              />
              <h1
                className="font-bold text-[var(--foreground)]"
                style={{ fontSize: "28px" }}
              >
                Operations Playbook
              </h1>
            </div>
            <Link
              href="/workspace/operations-playbook/print"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer className="w-3.5 h-3.5" /> Print view
            </Link>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            The standard operating procedures your team runs every day. Edit
            anything. These are templates, not rules from on high.
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-[var(--dark-grey)]">
            <SaveStatus saving={saving} savedAt={savedAt} canEdit={canEdit} />
          </div>
        </header>

        <SectionTabs active={active} onChange={setActive} doc={doc} />

        <div className="mt-6 space-y-6">
          <CategoryEditor
            key={active}
            categoryKey={active}
            label={activeLabel}
            tagline={SOP_CATEGORY_TAGLINES[active]}
            canEdit={canEdit}
            doc={doc}
            updateDoc={updateDoc}
            onGenerate={() => handleGenerate(active)}
            generating={generating === active}
          />
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="operations_playbook"
        currentFocus={{ label: activeLabel }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />

      <PaywallModal
        open={paywallReason !== null}
        reason={paywallReason ?? "no_subscription"}
        onClose={() => setPaywallReason(null)}
      />
    </div>
  );
}

// ── Save status ──────────────────────────────────────────────────────────────

function SaveStatus({
  saving,
  savedAt,
  canEdit,
}: {
  saving: boolean;
  savedAt: string | null;
  canEdit: boolean;
}) {
  if (!canEdit) return <span className="italic">Read-only preview</span>;
  if (saving) return <span>Saving…</span>;
  if (savedAt) {
    const ts = new Date(savedAt);
    const hh = ts.getHours().toString().padStart(2, "0");
    const mm = ts.getMinutes().toString().padStart(2, "0");
    return (
      <span className="flex items-center gap-1">
        <Check className="w-3 h-3 text-[var(--teal)]" />
        Saved {hh}:{mm}
      </span>
    );
  }
  return <span>Autosaves as you type.</span>;
}

// ── Section tabs ─────────────────────────────────────────────────────────────

function SectionTabs({
  active,
  onChange,
  doc,
}: {
  active: SopCategoryKey;
  onChange: (k: SopCategoryKey) => void;
  doc: OperationsPlaybookDocument;
}) {
  const filledMap = useMemo<Record<SopCategoryKey, boolean>>(() => {
    const out = {} as Record<SopCategoryKey, boolean>;
    for (const k of SOP_CATEGORY_KEYS) {
      out[k] = doc[k].items.length > 0;
    }
    return out;
  }, [doc]);

  return (
    <div className={cardCls}>
      <div
        role="tablist"
        aria-label="Operations Playbook sections"
        className="flex flex-wrap gap-1 p-1"
      >
        {SOP_CATEGORY_KEYS.map((key) => {
          const isActive = active === key;
          const filled = filledMap[key];
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onChange(key)}
              className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors ${
                isActive
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--background)]"
              }`}
            >
              {filled && (
                <Check
                  className={`w-3 h-3 ${isActive ? "text-white" : "text-[var(--teal)]"}`}
                />
              )}
              {SOP_CATEGORY_LABELS[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Category editor (shared shape for all six SOPs) ─────────────────────────

interface CategoryEditorProps {
  categoryKey: SopCategoryKey;
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: OperationsPlaybookDocument;
  updateDoc: (mut: (d: OperationsPlaybookDocument) => OperationsPlaybookDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}

function CategoryEditor({
  categoryKey,
  label,
  tagline,
  canEdit,
  doc,
  updateDoc,
  onGenerate,
  generating,
}: CategoryEditorProps) {
  const category = doc[categoryKey];
  const useStation = categoryKey === "cleaning";
  const useDuration =
    categoryKey === "opening" ||
    categoryKey === "closing" ||
    categoryKey === "cleaning";

  function patchItem(idx: number, patch: Partial<SopChecklistItem>) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const items = cat.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const next = idx + delta;
      if (next < 0 || next >= cat.items.length) return d;
      const items = cat.items.slice();
      [items[idx], items[next]] = [items[next], items[idx]];
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function remove(idx: number) {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const items = cat.items.filter((_, i) => i !== idx);
      return { ...d, [categoryKey]: { ...cat, items } };
    });
  }

  function addItem() {
    updateDoc((d) => {
      const cat = d[categoryKey];
      const newItem: SopChecklistItem = {
        id: localId(),
        text: "",
        duration_min: null,
        station: useStation ? "Bar" : null,
        cadence: useStation ? "daily" : null,
      };
      return { ...d, [categoryKey]: { ...cat, items: [...cat.items, newItem] } };
    });
  }

  function setIntro(intro: string) {
    updateDoc((d) => ({ ...d, [categoryKey]: { ...d[categoryKey], intro } }));
  }

  // Group cleaning items visually by station so the editor mirrors the printed shop view.
  const grouped = useMemo(() => {
    if (!useStation) return null;
    const map = new Map<string, number[]>();
    category.items.forEach((item, idx) => {
      const station = item.station ?? "Other";
      const list = map.get(station) ?? [];
      list.push(idx);
      map.set(station, list);
    });
    return Array.from(map.entries());
  }, [useStation, category.items]);

  return (
    <section className={`${cardCls} p-6`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <h2 className={sectionLabelCls}>{label}</h2>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{tagline}</p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canEdit || generating}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:text-[var(--dark-grey)] disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors flex-shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? "Improving…" : "Improve with AI"}
        </button>
      </div>

      <div className="mb-5">
        <label className={labelCls}>How this SOP works</label>
        <textarea
          className={textareaCls}
          rows={3}
          value={category.intro}
          onChange={(e) => setIntro(e.target.value)}
          disabled={!canEdit}
          placeholder="A one-line description for your team."
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {category.items.length} {category.items.length === 1 ? "step" : "steps"}
        </span>
        {category.last_generated_at && (
          <span className="text-[10px] text-[var(--dark-grey)]">
            AI improved{" "}
            {new Date(category.last_generated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>

      {grouped ? (
        <div className="space-y-5">
          {grouped.map(([station, indexes]) => (
            <div key={station}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--teal)] mb-2">
                {station}
              </h3>
              <ol className="space-y-2">
                {indexes.map((idx) => (
                  <ChecklistItemRow
                    key={category.items[idx].id}
                    item={category.items[idx]}
                    idx={idx}
                    total={category.items.length}
                    canEdit={canEdit}
                    useStation={useStation}
                    useDuration={useDuration}
                    onPatch={patchItem}
                    onMove={move}
                    onRemove={remove}
                  />
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <ol className="space-y-2">
          {category.items.map((item, idx) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              idx={idx}
              total={category.items.length}
              canEdit={canEdit}
              useStation={useStation}
              useDuration={useDuration}
              onPatch={patchItem}
              onMove={move}
              onRemove={remove}
            />
          ))}
        </ol>
      )}

      {category.items.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No steps yet. Add your first step below or have AI draft a starter
          checklist for you.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={addItem}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add step
        </button>
      )}

      <p className={helperCls}>
        Tip: Title each step so a brand-new barista could follow it without
        asking questions.
      </p>
    </section>
  );
}

interface ChecklistItemRowProps {
  item: SopChecklistItem;
  idx: number;
  total: number;
  canEdit: boolean;
  useStation: boolean;
  useDuration: boolean;
  onPatch: (idx: number, patch: Partial<SopChecklistItem>) => void;
  onMove: (idx: number, delta: -1 | 1) => void;
  onRemove: (idx: number) => void;
}

function ChecklistItemRow({
  item,
  idx,
  total,
  canEdit,
  useStation,
  useDuration,
  onPatch,
  onMove,
  onRemove,
}: ChecklistItemRowProps) {
  return (
    <li className="flex items-start gap-2">
      <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onMove(idx, -1)}
          disabled={!canEdit || idx === 0}
          aria-label="Move step up"
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMove(idx, 1)}
          disabled={!canEdit || idx === total - 1}
          aria-label="Move step down"
          className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <textarea
          rows={2}
          className={textareaCls}
          value={item.text}
          onChange={(e) => onPatch(idx, { text: e.target.value })}
          disabled={!canEdit}
          placeholder="What does your team do at this step?"
        />
        {(useStation || useDuration) && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {useStation && (
              <>
                <select
                  className="text-[11px] border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.station ?? "Bar"}
                  onChange={(e) => onPatch(idx, { station: e.target.value })}
                  disabled={!canEdit}
                  aria-label="Station"
                >
                  {["Bar", "Retail Floor", "Restroom", "Walk-In", "Dish", "Other"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
                <select
                  className="text-[11px] border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.cadence ?? "daily"}
                  onChange={(e) =>
                    onPatch(idx, { cadence: e.target.value as SopCadence })
                  }
                  disabled={!canEdit}
                  aria-label="Cadence"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </>
            )}
            {useDuration && !useStation && (
              <div className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                <input
                  type="number"
                  min={0}
                  max={120}
                  className="w-14 border border-[var(--border-medium)] rounded-md px-2 py-1 text-[var(--foreground)] text-right focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)]"
                  value={item.duration_min ?? ""}
                  onChange={(e) =>
                    onPatch(idx, {
                      duration_min:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  disabled={!canEdit}
                  placeholder="—"
                  aria-label="Duration in minutes"
                />
                <span>min</span>
              </div>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(idx)}
        disabled={!canEdit}
        aria-label="Remove step"
        className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
