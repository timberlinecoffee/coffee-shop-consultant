// TIM-1483: Single source of truth for financial documents in the business plan.
// TIM-1496: Expanded to 12 documents across 4 sub-blocks (Forecast / Financing /
// Statements / Appendix-monthly). Old keys profit_and_loss / cash_flow /
// balance_sheet renamed to monthly_pl / monthly_cash_flow / monthly_balance_sheet;
// a one-shot migration moves existing DB rows (see supabase/migrations/).

export type FinancialSubBlock = "forecast" | "financing" | "statements" | "appendix";

export interface FinancialSubBlockMeta {
  key: FinancialSubBlock;
  title: string;
}

export const FINANCIAL_SUB_BLOCKS: FinancialSubBlockMeta[] = [
  { key: "forecast",   title: "Forecast" },
  { key: "financing",  title: "Financing" },
  { key: "statements", title: "Statements" },
  { key: "appendix",   title: "Appendix" },
];

export type FinancialDocumentKey =
  // Forecast
  | "key_assumptions"
  | "revenue_by_month"
  | "expenses_by_month"
  | "net_profit_by_year"
  // Financing
  | "use_of_funds"
  | "sources_of_funds"
  // Statements
  | "projected_pl"
  | "projected_balance_sheet"
  | "projected_cash_flow"
  // Appendix — monthly
  | "monthly_pl"
  | "monthly_balance_sheet"
  | "monthly_cash_flow";

export interface FinancialDocumentMeta {
  key: FinancialDocumentKey;
  title: string;
  source: string;
  subBlock: FinancialSubBlock;
  defaultVisible: boolean;
}

export const FINANCIAL_DOCUMENTS: FinancialDocumentMeta[] = [
  // Forecast
  { key: "key_assumptions",     title: "Key Assumptions",      source: "Financials workspace",           subBlock: "forecast",   defaultVisible: true },
  { key: "revenue_by_month",    title: "Revenue by Month",     source: "Financials — Revenue & Expenses", subBlock: "forecast",   defaultVisible: true },
  { key: "expenses_by_month",   title: "Expenses by Month",    source: "Financials — Revenue & Expenses", subBlock: "forecast",   defaultVisible: true },
  { key: "net_profit_by_year",  title: "Net Profit by Year",   source: "Financials — Revenue & Expenses", subBlock: "forecast",   defaultVisible: true },
  // Financing
  { key: "use_of_funds",        title: "Use of Funds",         source: "Financials — Startup Costs",      subBlock: "financing",  defaultVisible: true },
  { key: "sources_of_funds",    title: "Sources of Funds",     source: "Financials — Funding",            subBlock: "financing",  defaultVisible: true },
  // Statements
  { key: "projected_pl",            title: "Projected P&L",           source: "Financials workspace", subBlock: "statements", defaultVisible: true },
  { key: "projected_balance_sheet", title: "Projected Balance Sheet",  source: "Financials workspace", subBlock: "statements", defaultVisible: true },
  { key: "projected_cash_flow",     title: "Projected Cash Flow",      source: "Financials workspace", subBlock: "statements", defaultVisible: true },
  // Appendix — monthly detail
  { key: "monthly_pl",           title: "Monthly P&L",           source: "Financials workspace", subBlock: "appendix", defaultVisible: true },
  { key: "monthly_balance_sheet", title: "Monthly Balance Sheet", source: "Financials workspace", subBlock: "appendix", defaultVisible: true },
  { key: "monthly_cash_flow",    title: "Monthly Cash Flow",      source: "Financials workspace", subBlock: "appendix", defaultVisible: true },
];

export type FinancialDocumentVisibility = Record<FinancialDocumentKey, boolean>;

// Legacy key aliases — old DB rows had these names before the TIM-1496 migration.
const LEGACY_KEY_MAP: Record<string, FinancialDocumentKey> = {
  profit_and_loss: "monthly_pl",
  cash_flow:       "monthly_cash_flow",
  balance_sheet:   "monthly_balance_sheet",
};

export function buildFinancialDocVisibility(
  savedRows: { document_key: string; is_visible: boolean }[]
): FinancialDocumentVisibility {
  const saved = new Map<string, boolean>();
  for (const r of savedRows) {
    const resolvedKey = LEGACY_KEY_MAP[r.document_key] ?? r.document_key;
    saved.set(resolvedKey, r.is_visible);
  }
  return Object.fromEntries(
    FINANCIAL_DOCUMENTS.map((doc) => [
      doc.key,
      saved.has(doc.key) ? saved.get(doc.key)! : doc.defaultVisible,
    ])
  ) as FinancialDocumentVisibility;
}

export function getDocumentsBySubBlock(subBlock: FinancialSubBlock): FinancialDocumentMeta[] {
  return FINANCIAL_DOCUMENTS.filter((d) => d.subBlock === subBlock);
}
