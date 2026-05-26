// TIM-1103: Smoke test for the Excel export builder. Verifies the workbook
// has the four required sheets, currency formatting follows the selected ISO
// code, and the month columns honor the fiscal-year start setting.

import test from "node:test";
import assert from "node:assert/strict";

import { defaultMonthlyProjections } from "../financial-projection.ts";
import { buildFinancialPlannerWorkbook } from "./xlsx-export.ts";

const equipment = { total_cost_cents: 0, financed_cost_cents: 0 };

test("xlsx-export: workbook has the four required sheets", () => {
  const wb = buildFinancialPlannerWorkbook({
    mp: defaultMonthlyProjections(),
    equipment,
    shopName: "Test Coffee",
    generatedDate: "May 26, 2026",
  });
  const names = wb.worksheets.map((w) => w.name);
  assert.deepEqual(names, ["P&L", "Cash Flow", "Balance Sheet", "Assumptions"]);
});

test("xlsx-export: currency follows selected ISO code (EUR)", () => {
  const mp = { ...defaultMonthlyProjections(), currency_code: "EUR" };
  const wb = buildFinancialPlannerWorkbook({
    mp,
    equipment,
    shopName: null,
    generatedDate: "May 26, 2026",
  });
  const pl = wb.getWorksheet("P&L");
  // The header row 3 says "Currency: EUR (Euro) · Generated …"
  const headerText = String(pl.getCell("A3").value ?? "");
  assert.match(headerText, /EUR/);
});

test("xlsx-export: month headers follow fiscal_year_start_month", () => {
  const mp = { ...defaultMonthlyProjections(), fiscal_year_start_month: 4 };
  const wb = buildFinancialPlannerWorkbook({
    mp,
    equipment,
    shopName: null,
    generatedDate: "May 26, 2026",
  });
  const pl = wb.getWorksheet("P&L");
  // Headers are written on row 5, columns B..M
  const firstMonth = pl.getCell("B5").value;
  const lastMonth = pl.getCell("M5").value;
  assert.equal(firstMonth, "Apr");
  assert.equal(lastMonth, "Mar");
});

test("xlsx-export: P&L sheet has SUM formula in totals column", () => {
  const wb = buildFinancialPlannerWorkbook({
    mp: defaultMonthlyProjections(),
    equipment,
    shopName: null,
    generatedDate: "May 26, 2026",
  });
  const pl = wb.getWorksheet("P&L");
  // Net revenue line lives at row 6 (header on row 5). Year total in column N.
  const totalCell = pl.getCell("N6").value;
  assert.ok(typeof totalCell === "object" && totalCell !== null && "formula" in totalCell);
  assert.match(totalCell.formula, /^SUM\(B6:M6\)$/);
});
