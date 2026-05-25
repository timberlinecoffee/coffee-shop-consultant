"use client";

import { useLaunchPlanRows } from "./useLaunchPlanRows";
import type { LaunchItemStatus } from "@/types/supabase";

type SoftOpenItem = {
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

const STATUS_OPTIONS: LaunchItemStatus[] = ["pending", "in_progress", "done", "at_risk"];

const STATUS_LABELS: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  at_risk: "At risk",
};

const STATUS_PILL: Record<LaunchItemStatus, string> = {
  pending: "bg-[#f0f0f0] text-[#6b6b6b]",
  in_progress: "bg-[#e8f4f5] text-[#155e63]",
  done: "bg-[#e6f4e6] text-[#2d6a2d]",
  at_risk: "bg-[#fde8e8] text-[#b1454a]",
};

type Bucket = { label: string; min: number; max: number };
const BUCKETS: Bucket[] = [
  { label: "Pre-open", min: -7, max: -1 },
  { label: "Day 0", min: 0, max: 0 },
  { label: "Week 1", min: 1, max: 7 },
  { label: "Month 1", min: 8, max: 30 },
];

function getBucket(dayOffset: number): string {
  for (const b of BUCKETS) {
    if (dayOffset >= b.min && dayOffset <= b.max) return b.label;
  }
  return dayOffset < 0 ? "Pre-open" : "Month 1";
}

function formatOffset(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `${n}`;
}

function parseOffset(s: string): number {
  const n = parseInt(s.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-7, Math.min(30, n));
}

export function SoftOpenPlanCard() {
  const { loading, items, error, paywall, addItem, updateItem, removeItem } =
    useLaunchPlanRows<SoftOpenItem>("/api/launch-plan/soft-open-plan");

  const grouped = BUCKETS.map((b) => ({
    ...b,
    rows: items.filter((r) => {
      const bk = getBucket(r.day_offset);
      return bk === b.label;
    }),
  }));

  const handleAdd = () => {
    addItem({ day_offset: 0, task: "New task", owner: null, status: "pending", notes: null });
  };

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg text-[#1a1a1a]">Soft open plan</h2>
          <p className="text-xs text-[#6b6b6b]">
            Task checklist grouped by day — from pre-open prep through the first month.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-[#155e63] text-white hover:bg-[#0f4a4e] disabled:opacity-50"
        >
          + Add task
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-[#6b6b6b]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#6b6b6b] italic">No tasks yet. Add one to start planning.</p>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ label, rows }) =>
            rows.length === 0 ? null : (
              <div key={label}>
                <h3 className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">
                  {label}
                </h3>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border border-[#efefef] p-3">
                      <label className="text-xs text-[#6b6b6b] md:col-span-1">
                        <span className="block mb-1">Day</span>
                        <input
                          type="number"
                          min={-7}
                          max={30}
                          defaultValue={row.day_offset}
                          onBlur={(e) =>
                            updateItem(row.id, { day_offset: parseOffset(e.target.value) })
                          }
                          className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a] text-center"
                        />
                      </label>
                      <label className="text-xs text-[#6b6b6b] md:col-span-4">
                        <span className="block mb-1">Task</span>
                        <input
                          type="text"
                          defaultValue={row.task}
                          onBlur={(e) =>
                            e.target.value !== row.task &&
                            updateItem(row.id, { task: e.target.value })
                          }
                          className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                        />
                      </label>
                      <label className="text-xs text-[#6b6b6b] md:col-span-2">
                        <span className="block mb-1">Owner</span>
                        <input
                          type="text"
                          defaultValue={row.owner ?? ""}
                          onBlur={(e) =>
                            updateItem(row.id, { owner: e.target.value || null })
                          }
                          className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                          placeholder="Name"
                        />
                      </label>
                      <label className="text-xs text-[#6b6b6b] md:col-span-2">
                        <span className="block mb-1">Status</span>
                        <select
                          value={row.status}
                          onChange={(e) =>
                            updateItem(row.id, { status: e.target.value as LaunchItemStatus })
                          }
                          className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-[#6b6b6b] md:col-span-2">
                        <span className="block mb-1">Notes</span>
                        <input
                          type="text"
                          defaultValue={row.notes ?? ""}
                          onBlur={(e) =>
                            updateItem(row.id, { notes: e.target.value || null })
                          }
                          className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                        />
                      </label>
                      <div className="md:col-span-1 flex items-center gap-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_PILL[row.status]}`}
                        >
                          {formatOffset(row.day_offset)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(row.id)}
                          className="text-xs text-[#b1454a] hover:underline ml-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}

      {(error || paywall) && (
        <div className="mt-3 text-xs">
          {paywall ? (
            <a href="/pricing" className="text-[#155e63] underline">Upgrade to save</a>
          ) : (
            <span className="text-[#b1454a]" role="alert">{error}</span>
          )}
        </div>
      )}
    </section>
  );
}
