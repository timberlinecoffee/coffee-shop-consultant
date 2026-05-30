"use client";

// TIM-1411: Opening Month Plan workspace — tactical playbook covering the
// weeks before opening, opening week, and the first 30 days. Distinct shape
// from Opening Milestones: this is "what are you doing this week", not
// "what's the gating dated milestone".

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Plus, X } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import type { LaunchItemStatus } from "@/types/supabase";

interface Props {
  planId: string;
  canEdit: boolean;
  initialTrialMessagesUsed?: number;
}

type Item = {
  id: string;
  plan_id: string;
  day_offset: number;
  task: string;
  owner: string | null;
  status: LaunchItemStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Buckets mirror the issue spec: pre-open weeks, opening week, first 30 days.
type Bucket = {
  key: string;
  label: string;
  description: string;
  min: number;
  max: number;
};

const BUCKETS: Bucket[] = [
  {
    key: "pre_open",
    label: "Pre-Open Weeks",
    description:
      "Training schedule, supplier first-orders, neighborhood walk-around, friends-and-family soft open.",
    min: -28,
    max: -1,
  },
  {
    key: "opening_week",
    label: "Opening Week",
    description:
      "Grand-open day, hours, marketing push, staffing schedule.",
    min: 0,
    max: 7,
  },
  {
    key: "first_30_days",
    label: "First 30 Days",
    description:
      "KPIs to watch, supplier delivery cadence, daily and weekly rituals, what to tweak.",
    min: 8,
    max: 30,
  },
];

const STATUS_OPTIONS: LaunchItemStatus[] = ["pending", "in_progress", "done", "at_risk"];
const STATUS_LABELS: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  at_risk: "At Risk",
};
const STATUS_STYLES: Record<LaunchItemStatus, string> = {
  pending: "bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)]",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  at_risk: "bg-red-100 text-red-700",
};

function bucketFor(day: number): Bucket {
  for (const b of BUCKETS) {
    if (day >= b.min && day <= b.max) return b;
  }
  return BUCKETS[0];
}

function formatOffset(n: number): string {
  if (n === 0) return "Day 0";
  return n > 0 ? `Day +${n}` : `Day ${n}`;
}

function parseOffset(s: string, fallback: number): number {
  const n = parseInt(s.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-28, Math.min(30, n));
}

function Toast({
  type,
  message,
  onDismiss,
}: {
  type: "success" | "error";
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium ${
        type === "success" ? "bg-[var(--teal)] text-white" : "bg-red-600 text-white"
      }`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function OpeningMonthPlanWorkspace({
  planId,
  canEdit,
  initialTrialMessagesUsed,
}: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, msg });
    toastTimerRef.current = setTimeout(() => setToast(null), 5_000);
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/opening-month-plan/soft-open-plan", { cache: "no-store" });
      if (!res.ok) throw new Error("Load failed");
      const body = (await res.json()) as { items: Item[] };
      setItems(body.items);
    } catch {
      showToast("error", "Couldn't load the playbook. Reload to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const grouped = BUCKETS.map((b) => ({
    bucket: b,
    rows: items
      .filter((r) => {
        const bk = bucketFor(r.day_offset);
        return bk.key === b.key;
      })
      .sort((a, b) => a.day_offset - b.day_offset || a.created_at.localeCompare(b.created_at)),
  }));

  async function addItem(bucket: Bucket) {
    if (!canEdit) {
      setPaywallOpen(true);
      return;
    }
    const defaultDay = bucket.key === "pre_open" ? -7 : bucket.min;
    const optimistic: Item = {
      id: `temp-${Date.now()}`,
      plan_id: planId,
      day_offset: defaultDay,
      task: "New task",
      owner: null,
      status: "pending",
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setItems((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/opening-month-plan/soft-open-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          day_offset: defaultDay,
          task: optimistic.task,
          owner: null,
          status: "pending",
          notes: null,
        }),
      });
      if (res.status === 402) {
        setItems((prev) => prev.filter((r) => r.id !== optimistic.id));
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) throw new Error("Create failed");
      const body = (await res.json()) as { item: Item };
      setItems((prev) => prev.map((r) => (r.id === optimistic.id ? body.item : r)));
    } catch {
      setItems((prev) => prev.filter((r) => r.id !== optimistic.id));
      showToast("error", "Couldn't add the task. Try again.");
    }
  }

  async function updateItem(id: string, patch: Partial<Omit<Item, "id" | "plan_id" | "created_at" | "updated_at">>) {
    const prev = items.find((r) => r.id === id);
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const res = await fetch(`/api/opening-month-plan/soft-open-plan/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.status === 402) {
        if (prev) setItems((rows) => rows.map((r) => (r.id === id ? prev : r)));
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) throw new Error("Update failed");
      const body = (await res.json()) as { item: Item };
      setItems((rows) => rows.map((r) => (r.id === id ? body.item : r)));
    } catch {
      if (prev) setItems((rows) => rows.map((r) => (r.id === id ? prev : r)));
      showToast("error", "Couldn't save that change.");
    }
  }

  async function removeItem(id: string) {
    const prev = items.find((r) => r.id === id);
    if (!prev) return;
    setItems((rows) => rows.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/opening-month-plan/soft-open-plan/${id}`, { method: "DELETE" });
      if (res.status === 402) {
        setItems((rows) => [...rows, prev]);
        setPaywallOpen(true);
      } else if (!res.ok && res.status !== 204) {
        throw new Error("Delete failed");
      }
    } catch {
      setItems((rows) => [...rows, prev]);
      showToast("error", "Couldn't remove that task.");
    }
  }

  async function handleSeed() {
    if (!canEdit) {
      setPaywallOpen(true);
      return;
    }
    setSeeding(true);
    try {
      const res = await fetch("/api/opening-month-plan/seed", { method: "POST" });
      if (res.status === 402) {
        setPaywallOpen(true);
        return;
      }
      if (!res.ok) throw new Error("Seed failed");
      await reload();
      showToast("success", "Starter playbook added. Edit anything you want.");
    } catch {
      showToast("error", "Couldn't seed the playbook. Try again.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">Opening Month Plan</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            The tactical week-by-week playbook for the weeks before opening, opening week itself, and the first 30 days in the shop.
          </p>
        </header>

        <div className="space-y-4">
          {items.length === 0 && !loading && (
            <div className="rounded-xl bg-white border border-[var(--border)] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm text-[var(--foreground)] font-semibold">Start with a tactical playbook</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  We can drop in a starter list of pre-open, opening-week, and first-30-day tasks. Edit anything that doesn&apos;t fit your shop.
                </p>
              </div>
              <button
                onClick={handleSeed}
                disabled={seeding || !canEdit}
                className="px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-dark)] disabled:opacity-50 whitespace-nowrap"
              >
                {seeding ? "Seeding..." : "Seed Starter Playbook"}
              </button>
            </div>
          )}

          {grouped.map(({ bucket, rows }) => (
            <section key={bucket.key} className="bg-white rounded-xl border border-[var(--border)] overflow-hidden">
              <header className="px-4 py-3 border-b border-[var(--neutral-cool-100)]">
                <h2 className="text-base font-semibold text-[var(--foreground)]">{bucket.label}</h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{bucket.description}</p>
              </header>

              {rows.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--dark-grey)]">No tasks yet in this stretch.</div>
              ) : (
                <ul className="divide-y divide-[var(--neutral-cool-100)]">
                  {rows.map((row) => (
                    <li key={row.id} className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                      <label className="md:col-span-1 text-xs text-[var(--muted-foreground)]">
                        <span className="block mb-1">Day</span>
                        <input
                          type="number"
                          min={bucket.min}
                          max={bucket.max}
                          defaultValue={row.day_offset}
                          disabled={!canEdit}
                          onBlur={(e) => {
                            const next = parseOffset(e.target.value, row.day_offset);
                            if (next !== row.day_offset) updateItem(row.id, { day_offset: next });
                          }}
                          className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] text-center disabled:opacity-60"
                        />
                      </label>
                      <label className="md:col-span-4 text-xs text-[var(--muted-foreground)]">
                        <span className="block mb-1">Task</span>
                        <input
                          type="text"
                          defaultValue={row.task}
                          disabled={!canEdit}
                          onBlur={(e) => e.target.value !== row.task && updateItem(row.id, { task: e.target.value })}
                          className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                        />
                      </label>
                      <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                        <span className="block mb-1">Owner</span>
                        <input
                          type="text"
                          defaultValue={row.owner ?? ""}
                          disabled={!canEdit}
                          onBlur={(e) => updateItem(row.id, { owner: e.target.value || null })}
                          placeholder="Founder"
                          className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                        />
                      </label>
                      <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                        <span className="block mb-1">Status</span>
                        <select
                          value={row.status}
                          disabled={!canEdit}
                          onChange={(e) => updateItem(row.id, { status: e.target.value as LaunchItemStatus })}
                          className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="md:col-span-2 text-xs text-[var(--muted-foreground)]">
                        <span className="block mb-1">Notes</span>
                        <input
                          type="text"
                          defaultValue={row.notes ?? ""}
                          disabled={!canEdit}
                          onBlur={(e) => updateItem(row.id, { notes: e.target.value || null })}
                          className="w-full border border-[var(--border-medium)] rounded px-2 py-1 text-sm text-[var(--foreground)] disabled:opacity-60"
                        />
                      </label>
                      <div className="md:col-span-1 flex items-center justify-end gap-2 pt-5">
                        <span className={`hidden md:inline px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                          {formatOffset(row.day_offset)}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => removeItem(row.id)}
                            className="text-xs text-[var(--dark-grey)] hover:text-red-500 transition-colors"
                            title="Remove"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {canEdit && (
                <button
                  onClick={() => addItem(bucket)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] transition-colors w-full border-t border-[var(--neutral-cool-100)]"
                >
                  <Plus size={14} />
                  Add task to {bucket.label}
                </button>
              )}
            </section>
          ))}

          {loading && <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>}
        </div>
      </div>

      <CoPilotDrawer
        workspaceKey="opening_month_plan"
        planId={planId}
        currentFocus={{ anchor: "opening_month_plan", label: "Opening Month Plan" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />

      {toast && <Toast type={toast.type} message={toast.msg} onDismiss={() => setToast(null)} />}
    </div>
  );
}
