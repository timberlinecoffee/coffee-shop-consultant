// TIM-2477 / TIM-2454 F5: Launch Plan payroll total must use the canonical
// `personnelLoadedMonthlyCents` selector instead of `monthly_cost_cents *
// headcount`, otherwise the card under-states monthly payroll by the role's
// benefits load (12-18% for typical coffee shop staffing — see
// `defaultPersonnel` in `src/lib/financial-projection.ts`).
//
// The Launch Plan card lets users enter "Monthly cost" per row directly.
// That value is interpreted as **monthly base pay per head** (the same
// convention the card uses today by multiplying by `headcount`). The adapter
// below pipes those rows through the canonical selector so the Launch Plan
// total includes benefits load like the Hiring workspace and Financials.
//
// `benefits_pct` / `benefits_fixed_cents` are taken from the row when
// present (the GET endpoint hydrates them from the matching PersonnelLine
// via `org_role_id`). When a row has no matching PersonnelLine, we fall
// back to `DEFAULT_BENEFITS_PCT` — chosen as the midpoint of the two
// `defaultPersonnel` lines (12% barista + 18% manager).

import type { PersonnelLine } from "../../lib/financial-projection.ts";
import { personnelLoadedMonthlyCents } from "../../lib/financial-projection.ts";

export const DEFAULT_BENEFITS_PCT = 15;

export interface LaunchPlanHiringRow {
  id: string;
  role_title: string;
  headcount: number;
  monthly_cost_cents: number | null;
  benefits_pct?: number | null;
  benefits_fixed_cents?: number | null;
}

export function toPersonnelLine(row: LaunchPlanHiringRow): PersonnelLine {
  const line: PersonnelLine = {
    id: row.id,
    role: row.role_title,
    headcount: Math.max(0, Math.floor(row.headcount || 0)),
    pay_basis: "monthly",
    pay_amount_cents: Math.max(0, Math.round(row.monthly_cost_cents ?? 0)),
    benefits_pct:
      typeof row.benefits_pct === "number" && row.benefits_pct >= 0
        ? row.benefits_pct
        : DEFAULT_BENEFITS_PCT,
    cost_category: "overhead",
  };
  if (
    typeof row.benefits_fixed_cents === "number" &&
    row.benefits_fixed_cents > 0
  ) {
    line.benefits_fixed_cents = Math.round(row.benefits_fixed_cents);
  }
  return line;
}

export function totalLoadedMonthlyCents(rows: LaunchPlanHiringRow[]): number {
  return rows.reduce((sum, r) => sum + personnelLoadedMonthlyCents(toPersonnelLine(r)), 0);
}
