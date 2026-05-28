// TIM-1103: Financial Planner — Excel (.xlsx) export.
// Sheets: P&L, Cash Flow, Balance Sheet, Assumptions.
// Months are columns, line items are rows. Uses Excel formulas for totals and
// % of sales so the spreadsheet remains live. Currency formatting follows the
// selected ISO 4217 code on MonthlyProjections.

import ExcelJS from "exceljs";
import {
  type MonthlyProjections,
  type MonthlySlice,
  type EquipmentSummary,
  computeMonthlySlices,
  fiscalYearMonthLabels,
} from "../financial-projection.ts";
import { getCurrencyMeta } from "../currency.ts";

// Excel currency format: matches the selected currency symbol with grouping
// and (red) negative parens. Example USD: "$#,##0;[Red](-$#,##0)".
function excelCurrencyFormat(code: string): string {
  const meta = getCurrencyMeta(code);
  // Probe the formatter for the symbol so we get the locale-appropriate
  // glyph (€, £, ¥, R$, etc.) without dragging an extra dependency in.
  const parts = new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: meta.fractionDigits,
    maximumFractionDigits: meta.fractionDigits,
  }).formatToParts(1234.5);

  let symbol = meta.code;
  let symbolPosition: "prefix" | "suffix" = "prefix";
  let hasSeenNumber = false;
  for (const p of parts) {
    if (p.type === "currency") {
      symbol = p.value;
      symbolPosition = hasSeenNumber ? "suffix" : "prefix";
    } else if (p.type === "integer") {
      hasSeenNumber = true;
    }
  }
  // Escape currency symbol to be safe in number-format strings.
  const safe = symbol.replace(/"/g, '""');
  const fractionPart =
    meta.fractionDigits > 0 ? "." + "0".repeat(meta.fractionDigits) : "";
  const num = `#,##0${fractionPart}`;
  if (symbolPosition === "prefix") {
    return `"${safe}"${num};[Red]("${safe}"${num})`;
  }
  return `${num}"${safe}";[Red](${num}"${safe}")`;
}

function fiscalReorder<T>(items: T[], fiscalStart: number): T[] {
  const s = Math.min(12, Math.max(1, Math.round(fiscalStart || 1))) - 1;
  return Array.from({ length: items.length }, (_, i) => items[(s + i) % 12]);
}

function toMajor(minor: number, code: string): number {
  const meta = getCurrencyMeta(code);
  const divisor = Math.pow(10, meta.fractionDigits);
  return minor / divisor;
}

// Column letter for 1-indexed column. (B…M are the 12 month cols when label is A.)
function colLetter(idx: number): string {
  let n = idx;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface PlannerWorkbookOpts {
  mp: MonthlyProjections;
  equipment: EquipmentSummary;
  shopName: string | null;
  generatedDate: string;
}

export function buildFinancialPlannerWorkbook(
  opts: PlannerWorkbookOpts
): ExcelJS.Workbook {
  const { mp, equipment, shopName, generatedDate } = opts;
  const code = mp.currency_code ?? "USD";
  const meta = getCurrencyMeta(code);
  const moneyFormat = excelCurrencyFormat(code);
  const fiscalStart = mp.fiscal_year_start_month ?? 1;
  const months = fiscalYearMonthLabels(fiscalStart);

  const allSlices: MonthlySlice[] = computeMonthlySlices(mp, equipment, {});
  const y1 = allSlices.filter((s) => s.year === 1);
  const y1Ordered = fiscalReorder(y1, fiscalStart);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Groundwork";
  wb.created = new Date();

  // ── P&L sheet ────────────────────────────────────────────────────────────
  const pl = wb.addWorksheet("P&L");
  buildPlSheet(pl, {
    months,
    slices: y1Ordered,
    code,
    moneyFormat,
    shopName,
    generatedDate,
    meta,
  });

  // ── Cash Flow sheet ──────────────────────────────────────────────────────
  const cf = wb.addWorksheet("Cash Flow");
  buildCashFlowSheet(cf, {
    months,
    slices: y1Ordered,
    code,
    moneyFormat,
    shopName,
    generatedDate,
    meta,
  });

  // ── Balance Sheet sheet ──────────────────────────────────────────────────
  const bs = wb.addWorksheet("Balance Sheet");
  buildBalanceSheet(bs, {
    months,
    slices: y1Ordered,
    code,
    moneyFormat,
    shopName,
    generatedDate,
    meta,
  });

  // ── Assumptions sheet ────────────────────────────────────────────────────
  const asm = wb.addWorksheet("Assumptions");
  buildAssumptions(asm, { mp, moneyFormat, shopName, generatedDate, meta, code });

  return wb;
}

interface SheetCtx {
  months: string[];
  slices: MonthlySlice[];
  code: string;
  moneyFormat: string;
  shopName: string | null;
  generatedDate: string;
  meta: ReturnType<typeof getCurrencyMeta>;
}

function writeHeader(ws: ExcelJS.Worksheet, title: string, ctx: SheetCtx) {
  ws.getCell("A1").value = "Groundwork — Financial Planner";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1A6E3B" } };
  ws.getCell("A2").value = `${ctx.shopName ?? "Your coffee shop"} · ${title}`;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `Currency: ${ctx.meta.code} (${ctx.meta.name})  ·  Generated ${ctx.generatedDate}`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF6B7B70" } };
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
}

function writeMonthHeader(
  ws: ExcelJS.Worksheet,
  startRow: number,
  ctx: SheetCtx,
  includeTotal: boolean
) {
  ws.getCell(`A${startRow}`).value = "Line item";
  ws.getCell(`A${startRow}`).font = { bold: true };
  ws.getCell(`A${startRow}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEF2EE" },
  };
  for (let i = 0; i < ctx.months.length; i++) {
    const cell = ws.getCell(`${colLetter(2 + i)}${startRow}`);
    cell.value = ctx.months[i];
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  if (includeTotal) {
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${startRow}`);
    cell.value = "Year 1";
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  ws.getColumn(1).width = 38;
  for (let i = 0; i < ctx.months.length + (includeTotal ? 1 : 0); i++) {
    ws.getColumn(2 + i).width = 14;
  }
}

interface LineSpec {
  label: string;
  values: number[]; // major units (Excel-side numbers, not cents)
  bold?: boolean;
  totalFormula?: boolean; // SUM(B:M) for this row
  formatPct?: boolean;
}

function writeLineRow(
  ws: ExcelJS.Worksheet,
  row: number,
  spec: LineSpec,
  ctx: SheetCtx,
  includeTotal: boolean
) {
  ws.getCell(`A${row}`).value = spec.label;
  if (spec.bold) ws.getCell(`A${row}`).font = { bold: true };
  for (let i = 0; i < spec.values.length; i++) {
    const cell = ws.getCell(`${colLetter(2 + i)}${row}`);
    cell.value = spec.values[i];
    cell.numFmt = spec.formatPct ? "0.0%" : ctx.moneyFormat;
    if (spec.bold) cell.font = { bold: true };
  }
  if (includeTotal && spec.totalFormula !== false) {
    const firstCol = colLetter(2);
    const lastCol = colLetter(1 + ctx.months.length);
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${row}`);
    cell.value = { formula: `SUM(${firstCol}${row}:${lastCol}${row})` };
    cell.numFmt = spec.formatPct ? "0.0%" : ctx.moneyFormat;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
}

function buildPlSheet(ws: ExcelJS.Worksheet, ctx: SheetCtx) {
  writeHeader(ws, "P&L (Year 1, monthly)", ctx);
  const headerRow = 5;
  writeMonthHeader(ws, headerRow, ctx, true);

  const { slices, code } = ctx;
  const lines: LineSpec[] = [
    {
      label: "Net revenue",
      values: slices.map((s) => toMajor(s.net_revenue_cents, code)),
      bold: true,
    },
    {
      label: "COGS",
      values: slices.map((s) => -toMajor(s.total_cogs_cents, code)),
    },
  ];
  const REV_ROW = headerRow + 1;
  const COGS_ROW = headerRow + 2;
  const GP_ROW = headerRow + 3;
  // Gross profit = Revenue + COGS (COGS is signed negative)
  const grossProfitFormulas: string[] = [];
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    grossProfitFormulas.push(`${col}${REV_ROW}+${col}${COGS_ROW}`);
  }

  // We'll write Revenue, COGS, then write the GP formula row directly, then opex lines.
  // For simplicity we write the static rows first.
  let row = headerRow + 1;
  writeLineRow(ws, row++, lines[0], ctx, true);
  writeLineRow(ws, row++, lines[1], ctx, true);

  // Gross profit formula row
  ws.getCell(`A${row}`).value = "Gross profit";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let i = 0; i < ctx.months.length; i++) {
    const cell = ws.getCell(`${colLetter(2 + i)}${row}`);
    cell.value = { formula: grossProfitFormulas[i] };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
  }
  {
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${row}`);
    cell.value = { formula: `SUM(${colLetter(2)}${row}:${colLetter(1 + ctx.months.length)}${row})` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  // GP_ROW was claimed to be headerRow+3 — confirm it's `row` (which equals headerRow+3 here).
  void GP_ROW;
  row++;

  // Opex lines
  const opexLines: { label: string; key: keyof MonthlySlice }[] = [
    { label: "Labor", key: "labor_cents" },
    { label: "Rent", key: "rent_cents" },
    { label: "Marketing", key: "marketing_cents" },
    { label: "Utilities", key: "utilities_cents" },
    { label: "Insurance", key: "insurance_cents" },
    { label: "Tech / software", key: "tech_cents" },
    { label: "Maintenance", key: "maintenance_cents" },
    { label: "Supplies", key: "supplies_cents" },
    { label: "Other operating", key: "other_opex_cents" },
  ];
  const opexStartRow = row;
  for (const ol of opexLines) {
    writeLineRow(
      ws,
      row++,
      {
        label: ol.label,
        values: slices.map((s) => -toMajor((s[ol.key] as number) ?? 0, code)),
      },
      ctx,
      true
    );
  }
  const opexEndRow = row - 1;

  // Total opex via SUM of opex rows
  ws.getCell(`A${row}`).value = "Total opex";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    const cell = ws.getCell(`${col}${row}`);
    cell.value = { formula: `SUM(${col}${opexStartRow}:${col}${opexEndRow})` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
  }
  {
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${row}`);
    cell.value = { formula: `SUM(${colLetter(2)}${row}:${colLetter(1 + ctx.months.length)}${row})` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  const totalOpexRow = row;
  row++;

  // Operating income = Gross profit + Total opex (opex stored as negative)
  ws.getCell(`A${row}`).value = "Operating income";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    const cell = ws.getCell(`${col}${row}`);
    // GP row = headerRow + 3
    cell.value = { formula: `${col}${headerRow + 3}+${col}${totalOpexRow}` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
  }
  {
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${row}`);
    cell.value = { formula: `SUM(${colLetter(2)}${row}:${colLetter(1 + ctx.months.length)}${row})` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  row++;

  // Depreciation, Interest, Taxes (stored as outflows; values written negative)
  writeLineRow(
    ws,
    row++,
    {
      label: "Depreciation",
      values: slices.map((s) => -toMajor(s.depreciation_cents, code)),
    },
    ctx,
    true
  );
  writeLineRow(
    ws,
    row++,
    {
      label: "Interest",
      values: slices.map((s) => -toMajor(s.interest_cents, code)),
    },
    ctx,
    true
  );
  writeLineRow(
    ws,
    row++,
    {
      label: "Income tax",
      values: slices.map((s) => -toMajor(s.taxes_cents, code)),
    },
    ctx,
    true
  );

  // Net income (use computed value for clarity; users can derive too)
  writeLineRow(
    ws,
    row++,
    {
      label: "Net income",
      values: slices.map((s) => toMajor(s.net_income_cents, code)),
      bold: true,
    },
    ctx,
    true
  );

  // TIM-1247: sales tax is a pass-through liability (collected then remitted),
  // not revenue or expense — shown as a memo so it never affects net income.
  writeLineRow(
    ws,
    row++,
    {
      label: "Sales tax collected & remitted (pass-through memo)",
      values: slices.map((s) => toMajor(s.sales_tax_collected_cents, code)),
    },
    ctx,
    true
  );

  // % of sales rollups
  row++;
  ws.getCell(`A${row}`).value = "% of sales (selected lines)";
  ws.getCell(`A${row}`).font = { bold: true, italic: true };
  row++;
  // COGS % = COGS_ROW / REV_ROW (COGS row is negative, multiply by -1)
  ws.getCell(`A${row}`).value = "COGS % of revenue";
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    const cell = ws.getCell(`${col}${row}`);
    cell.value = {
      formula: `IFERROR(-${col}${COGS_ROW}/${col}${REV_ROW},0)`,
    };
    cell.numFmt = "0.0%";
  }
  row++;
  // Total opex % of revenue
  ws.getCell(`A${row}`).value = "Total opex % of revenue";
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    const cell = ws.getCell(`${col}${row}`);
    cell.value = {
      formula: `IFERROR(-${col}${totalOpexRow}/${col}${REV_ROW},0)`,
    };
    cell.numFmt = "0.0%";
  }
  row++;

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
}

function buildCashFlowSheet(ws: ExcelJS.Worksheet, ctx: SheetCtx) {
  writeHeader(ws, "Cash flow (Year 1, monthly)", ctx);
  const headerRow = 5;
  writeMonthHeader(ws, headerRow, ctx, true);

  const { slices, code } = ctx;
  let row = headerRow + 1;
  writeLineRow(
    ws,
    row++,
    {
      label: "Net income",
      values: slices.map((s) => toMajor(s.net_income_cents, code)),
    },
    ctx,
    true
  );
  writeLineRow(
    ws,
    row++,
    {
      label: "Depreciation (non-cash)",
      values: slices.map((s) => toMajor(s.depreciation_cents, code)),
    },
    ctx,
    true
  );
  const NI_ROW = headerRow + 1;
  const DEP_ROW = headerRow + 2;
  // Operating cash flow = NI + Depreciation
  ws.getCell(`A${row}`).value = "Operating cash flow";
  ws.getCell(`A${row}`).font = { bold: true };
  for (let i = 0; i < ctx.months.length; i++) {
    const col = colLetter(2 + i);
    const cell = ws.getCell(`${col}${row}`);
    cell.value = { formula: `${col}${NI_ROW}+${col}${DEP_ROW}` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
  }
  {
    const totalCol = colLetter(2 + ctx.months.length);
    const cell = ws.getCell(`${totalCol}${row}`);
    cell.value = { formula: `SUM(${colLetter(2)}${row}:${colLetter(1 + ctx.months.length)}${row})` };
    cell.numFmt = ctx.moneyFormat;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2EE" },
    };
  }
  row++;

  writeLineRow(
    ws,
    row++,
    {
      label: "Capex",
      values: slices.map((s) => -toMajor(s.capex_cents, code)),
    },
    ctx,
    true
  );
  writeLineRow(
    ws,
    row++,
    {
      label: "Loan repayment",
      values: slices.map((s) => -toMajor(s.loan_repayment_cents, code)),
    },
    ctx,
    true
  );

  writeLineRow(
    ws,
    row++,
    {
      label: "Net cash flow",
      values: slices.map((s) => toMajor(s.net_cash_cents, code)),
      bold: true,
    },
    ctx,
    true
  );
  writeLineRow(
    ws,
    row++,
    {
      label: "Ending cash balance",
      values: slices.map((s) => toMajor(s.cash_cents, code)),
      bold: true,
    },
    ctx,
    false
  );

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
}

function buildBalanceSheet(ws: ExcelJS.Worksheet, ctx: SheetCtx) {
  writeHeader(ws, "Balance sheet (Year 1, end of month)", ctx);
  const headerRow = 5;
  writeMonthHeader(ws, headerRow, ctx, false);

  const { slices, code } = ctx;
  const fields: { label: string; key: keyof MonthlySlice; bold?: boolean }[] = [
    { label: "Cash", key: "cash_cents" },
    { label: "Accounts receivable", key: "accounts_receivable_cents" },
    { label: "Inventory", key: "inventory_cents" },
    { label: "Net fixed assets", key: "net_fixed_assets_cents" },
    { label: "Other assets", key: "other_assets_cents" },
    { label: "Total assets", key: "total_assets_cents", bold: true },
    { label: "Accounts payable", key: "accounts_payable_cents" },
    { label: "Current debt", key: "current_debt_cents" },
    { label: "Long-term debt", key: "long_term_debt_cents" },
    { label: "Total liabilities", key: "total_liabilities_cents", bold: true },
    { label: "Owner equity", key: "owner_equity_cents" },
    { label: "Retained earnings", key: "retained_earnings_cents" },
    { label: "Total equity", key: "total_equity_cents", bold: true },
    {
      label: "Total liabilities + equity",
      key: "total_liabilities_and_equity_cents",
      bold: true,
    },
  ];
  let row = headerRow + 1;
  for (const f of fields) {
    writeLineRow(
      ws,
      row++,
      {
        label: f.label,
        values: slices.map((s) => toMajor((s[f.key] as number) ?? 0, code)),
        bold: f.bold,
      },
      ctx,
      false
    );
  }

  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 5 }];
}

function buildAssumptions(
  ws: ExcelJS.Worksheet,
  opts: {
    mp: MonthlyProjections;
    moneyFormat: string;
    shopName: string | null;
    generatedDate: string;
    meta: ReturnType<typeof getCurrencyMeta>;
    code: string;
  }
) {
  const { mp, moneyFormat, shopName, generatedDate, meta, code } = opts;
  ws.getCell("A1").value = "Groundwork — Financial Planner";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1A6E3B" } };
  ws.getCell("A2").value = `${shopName ?? "Your coffee shop"} · Assumptions`;
  ws.getCell("A2").font = { bold: true, size: 12 };
  ws.getCell("A3").value = `Currency: ${meta.code} (${meta.name})  ·  Generated ${generatedDate}`;
  ws.getCell("A3").font = { italic: true, color: { argb: "FF6B7B70" } };

  let row = 5;
  ws.getCell(`A${row}`).value = "Setting";
  ws.getCell(`B${row}`).value = "Value";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 30;
  row++;

  const months = fiscalYearMonthLabels(mp.fiscal_year_start_month ?? 1);
  const settings: { label: string; value: string | number; money?: boolean; pct?: boolean }[] = [
    { label: "Currency", value: `${meta.code} — ${meta.name}` },
    { label: "Fiscal year starts", value: months[0] },
    { label: "Average ticket", value: mp.avg_ticket_cents / Math.pow(10, meta.fractionDigits), money: true },
    { label: "Base COGS rate (%)", value: mp.cogs_pct, pct: true },
    { label: "Income tax rate (%)", value: mp.income_tax_pct, pct: true },
    { label: "Sales tax rate — pass-through (%)", value: mp.sales_tax_pct, pct: true },
    { label: "Revenue ramp (months)", value: mp.ramp_months },
    {
      label: "Growth mode",
      value:
        mp.growth_mode === "simple"
          ? `Simple ${mp.growth_monthly_pct}%/mo`
          : "Custom",
    },
  ];
  for (const s of settings) {
    ws.getCell(`A${row}`).value = s.label;
    const c = ws.getCell(`B${row}`);
    c.value = s.value;
    if (s.money) c.numFmt = moneyFormat;
    if (s.pct) c.numFmt = "0.0";
    row++;
  }

  row++;
  ws.getCell(`A${row}`).value = "Weekly schedule";
  ws.getCell(`A${row}`).font = { bold: true };
  row++;
  ws.getCell(`A${row}`).value = "Day";
  ws.getCell(`B${row}`).value = "Hours";
  ws.getCell(`C${row}`).value = "Customers / day";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`C${row}`).font = { bold: true };
  ws.getColumn(3).width = 20;
  row++;
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const) {
    const sched = mp.weekly_schedule[d];
    ws.getCell(`A${row}`).value = d.toUpperCase();
    ws.getCell(`B${row}`).value = sched.open
      ? `${sched.open_time}–${sched.close_time}`
      : "Closed";
    ws.getCell(`C${row}`).value = sched.open ? mp.daily_flow[d] ?? 0 : 0;
    row++;
  }

  row++;
  ws.getCell(`A${row}`).value = "Forecast lines";
  ws.getCell(`A${row}`).font = { bold: true };
  row++;
  ws.getCell(`A${row}`).value = "Label";
  ws.getCell(`B${row}`).value = "Category";
  ws.getCell(`C${row}`).value = "Mode";
  ws.getCell(`D${row}`).value = "Value";
  ws.getCell(`E${row}`).value = "Ramp";
  ws.getCell(`F${row}`).value = "Growth";
  for (const col of ["A", "B", "C", "D", "E", "F"] as const) {
    ws.getCell(`${col}${row}`).font = { bold: true };
  }
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 24;
  ws.getColumn(6).width = 22;
  row++;
  for (const line of mp.forecast_lines) {
    ws.getCell(`A${row}`).value = line.label;
    ws.getCell(`B${row}`).value = line.category;
    ws.getCell(`C${row}`).value = line.mode === "pct" ? "% of sales" : "Flat";
    const valueCell = ws.getCell(`D${row}`);
    if (line.mode === "pct") {
      valueCell.value = line.value;
      valueCell.numFmt = "0.0";
    } else {
      valueCell.value = line.value / Math.pow(10, meta.fractionDigits);
      valueCell.numFmt = moneyFormat;
    }
    ws.getCell(`E${row}`).value = line.ramp?.enabled
      ? `${line.ramp.ramp_months} mo from ${line.ramp.start_pct}%`
      : "—";
    ws.getCell(`F${row}`).value = line.growth?.enabled
      ? `${line.growth.monthly_pct}%/mo`
      : "—";
    row++;
  }
  void code;
}
