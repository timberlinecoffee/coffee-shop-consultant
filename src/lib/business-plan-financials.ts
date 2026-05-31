// TIM-1483: Single source of truth for financial documents in the business plan appendix.
// New documents added later only need a registry entry + a builder in the PDF template.

export type FinancialDocumentKey =
  | "profit_and_loss"
  | "cash_flow"
  | "balance_sheet";

export interface FinancialDocumentMeta {
  key: FinancialDocumentKey;
  title: string;
  source: string;
  defaultVisible: boolean;
}

export const FINANCIAL_DOCUMENTS: FinancialDocumentMeta[] = [
  {
    key: "profit_and_loss",
    title: "Profit & Loss",
    source: "Financials — Revenue & Expenses",
    defaultVisible: true,
  },
  {
    key: "cash_flow",
    title: "Cash Flow",
    source: "Financials — Cash Flow",
    defaultVisible: true,
  },
  {
    key: "balance_sheet",
    title: "Balance Sheet",
    source: "Financials — Balance Sheet",
    defaultVisible: true,
  },
];

export type FinancialDocumentVisibility = Record<FinancialDocumentKey, boolean>;

export function buildFinancialDocVisibility(
  savedRows: { document_key: string; is_visible: boolean }[]
): FinancialDocumentVisibility {
  const saved = new Map(savedRows.map((r) => [r.document_key, r.is_visible]));
  return Object.fromEntries(
    FINANCIAL_DOCUMENTS.map((doc) => [
      doc.key,
      saved.has(doc.key) ? saved.get(doc.key)! : doc.defaultVisible,
    ])
  ) as FinancialDocumentVisibility;
}
