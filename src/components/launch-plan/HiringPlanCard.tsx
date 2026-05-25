"use client";

import { useLaunchPlanRows } from "./useLaunchPlanRows";
import type { HiringRoleStatus } from "@/types/supabase";

type HiringRole = {
  id: string;
  plan_id: string;
  role_title: string;
  headcount: number;
  start_date: string | null;
  monthly_cost_cents: number | null;
  status: HiringRoleStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: HiringRoleStatus[] = ["planned", "posted", "interviewing", "hired"];

const STATUS_LABELS: Record<HiringRoleStatus, string> = {
  planned: "Planned",
  posted: "Posted",
  interviewing: "Interviewing",
  hired: "Hired",
};

const STATUS_PILL: Record<HiringRoleStatus, string> = {
  planned: "bg-[#f0f0f0] text-[#6b6b6b]",
  posted: "bg-[#e8f4f5] text-[#155e63]",
  interviewing: "bg-[#fff8e6] text-[#8a6200]",
  hired: "bg-[#e6f4e6] text-[#2d6a2d]",
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function HiringPlanCard() {
  const { loading, items, error, paywall, addItem, updateItem, removeItem } =
    useLaunchPlanRows<HiringRole>("/api/launch-plan/hiring-plan");

  const totalPayrollCents = items.reduce(
    (sum, r) => sum + (r.monthly_cost_cents ?? 0) * r.headcount,
    0,
  );
  const totalHeadcount = items.reduce((sum, r) => sum + r.headcount, 0);

  const handleAdd = () => {
    addItem({
      role_title: "New role",
      headcount: 1,
      start_date: null,
      monthly_cost_cents: null,
      status: "planned",
      notes: null,
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-[#efefef] p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg text-[#1a1a1a]">Hiring plan</h2>
          <p className="text-xs text-[#6b6b6b]">
            Roles, headcount, start dates, and monthly payroll cost.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-[#155e63] text-white hover:bg-[#0f4a4e] disabled:opacity-50"
        >
          + Add role
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-[#6b6b6b]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[#6b6b6b] italic">No roles yet. Add one to start building your team plan.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border border-[#efefef] p-3"
            >
              <label className="text-xs text-[#6b6b6b] md:col-span-3">
                <span className="block mb-1">Role</span>
                <input
                  type="text"
                  defaultValue={row.role_title}
                  onBlur={(e) =>
                    e.target.value !== row.role_title &&
                    updateItem(row.id, { role_title: e.target.value || "Role" })
                  }
                  className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                  placeholder="Barista"
                />
              </label>
              <label className="text-xs text-[#6b6b6b] md:col-span-1">
                <span className="block mb-1">Count</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={row.headcount}
                  onBlur={(e) => {
                    const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                    if (n !== row.headcount) updateItem(row.id, { headcount: n });
                  }}
                  className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a] text-center"
                />
              </label>
              <label className="text-xs text-[#6b6b6b] md:col-span-2">
                <span className="block mb-1">Start date</span>
                <input
                  type="date"
                  defaultValue={row.start_date ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { start_date: e.target.value || null })
                  }
                  className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                />
              </label>
              <label className="text-xs text-[#6b6b6b] md:col-span-2">
                <span className="block mb-1">Monthly cost (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={
                    row.monthly_cost_cents != null
                      ? (row.monthly_cost_cents / 100).toFixed(0)
                      : ""
                  }
                  onBlur={(e) => {
                    const cents = parseDollarsToCents(e.target.value);
                    if (cents !== row.monthly_cost_cents)
                      updateItem(row.id, { monthly_cost_cents: cents });
                  }}
                  className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                  placeholder="0"
                />
              </label>
              <label className="text-xs text-[#6b6b6b] md:col-span-2">
                <span className="block mb-1">Status</span>
                <select
                  value={row.status}
                  onChange={(e) =>
                    updateItem(row.id, { status: e.target.value as HiringRoleStatus })
                  }
                  className="w-full border border-[#dcdcdc] rounded px-2 py-1 text-sm text-[#1a1a1a]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[#6b6b6b] md:col-span-1">
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
              <div className="md:col-span-1 flex flex-col items-end justify-between gap-1">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_PILL[row.status]}`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(row.id)}
                  className="text-xs text-[#b1454a] hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 flex items-center justify-between border-t border-[#efefef] pt-3">
        <div className="text-sm text-[#1a1a1a] flex gap-4">
          <span>
            <span className="text-[#6b6b6b]">Total headcount: </span>
            <span className="font-semibold">{totalHeadcount}</span>
          </span>
          <span>
            <span className="text-[#6b6b6b]">Monthly payroll: </span>
            <span className="font-semibold">
              {totalPayrollCents > 0 ? formatCents(totalPayrollCents) : "—"}
            </span>
          </span>
        </div>
        {(error || paywall) && (
          <div className="text-xs">
            {paywall ? (
              <a href="/pricing" className="text-[#155e63] underline">Upgrade to save</a>
            ) : (
              <span className="text-[#b1454a]" role="alert">{error}</span>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
