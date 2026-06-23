"use client";

import { useLaunchPlanRows } from "./useLaunchPlanRows";
import { totalLoadedMonthlyCents } from "./hiring-payroll";
import { useCurrency } from "@/components/CurrencyProvider";

type HiringRole = {
  id: string;
  plan_id: string;
  role_title: string;
  headcount: number;
  start_date: string | null;
  monthly_cost_cents: number | null;
  // TIM-2477: hydrated from the matching PersonnelLine via `org_role_id` in
  // the GET route so the loaded-payroll selector can pick up the role's real
  // benefits load instead of a flat default. Optional — direct Launch Plan
  // entries without a linked PersonnelLine fall back to DEFAULT_BENEFITS_PCT.
  benefits_pct?: number | null;
  benefits_fixed_cents?: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};


function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function HiringPlanCard() {
  // TIM-2486: surface the active currency code in the per-row "Monthly cost"
  // label so international plans don't show "(USD)" on a CAD/EUR/AUD plan.
  const { formatMinor, currencyCode } = useCurrency();
  const { loading, items, error, paywall, addItem, updateItem, removeItem } =
    useLaunchPlanRows<HiringRole>("/api/opening-month-plan/hiring-plan");

  // TIM-2477 / TIM-2454 F5: use the canonical loaded-payroll selector so the
  // footer total matches the Hiring workspace and Financials instead of
  // dropping the 12–18% benefits load that monthly_cost_cents * headcount
  // ignored.
  const totalPayrollCents = totalLoadedMonthlyCents(items);
  const totalHeadcount = items.reduce((sum, r) => sum + r.headcount, 0);

  const handleAdd = () => {
    addItem({
      role_title: "New role",
      headcount: 1,
      start_date: null,
      monthly_cost_cents: null,
      notes: null,
    });
  };

  return (
    <section className="bg-white rounded-xl border border-[var(--border)] p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg text-[var(--foreground)]">Hiring Plan</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Roles, headcount, start dates, and monthly payroll cost.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-[var(--teal)] text-white hover:bg-[var(--teal-darker)] disabled:opacity-50"
        >
          + Add role
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] italic">No roles yet. Add one to start building your team plan.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border border-[var(--border)] p-3"
            >
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-3">
                <span className="block mb-1">Role</span>
                <input
                  type="text"
                  defaultValue={row.role_title}
                  onBlur={(e) =>
                    e.target.value !== row.role_title &&
                    updateItem(row.id, { role_title: e.target.value || "Role" })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  placeholder="Barista"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-1">
                <span className="block mb-1">Count</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={row.headcount}
                  onBlur={(e) => {
                    const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                    if (n !== row.headcount) updateItem(row.id, { headcount: n });
                  }}
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)] text-center"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-2">
                <span className="block mb-1">Start date</span>
                <input
                  type="date"
                  defaultValue={row.start_date ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { start_date: e.target.value || null })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-2">
                <span className="block mb-1">Monthly cost ({currencyCode})</span>
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
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  placeholder="0"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-3">
                <span className="block mb-1">Notes</span>
                <input
                  type="text"
                  defaultValue={row.notes ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { notes: e.target.value || null })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                />
              </label>
              <div className="md:col-span-1 flex flex-col items-end justify-end gap-1">
                <button
                  type="button"
                  onClick={() => removeItem(row.id)}
                  className="text-xs text-[var(--error-light)] hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <div className="text-sm text-[var(--foreground)] flex gap-4">
          <span>
            <span className="text-[var(--muted-foreground)]">Total headcount: </span>
            <span className="font-semibold">{totalHeadcount}</span>
          </span>
          <span>
            <span className="text-[var(--muted-foreground)]">Monthly payroll: </span>
            <span className="font-semibold">
              {totalPayrollCents > 0 ? formatMinor(totalPayrollCents) : "—"}
            </span>
          </span>
        </div>
        {(error || paywall) && (
          <div className="text-xs">
            {paywall ? (
              <a href="/pricing" className="text-[var(--teal)] underline">Upgrade to save</a>
            ) : (
              <span className="text-[var(--error-light)]" role="alert">{error}</span>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
