// TIM-713: Financials workspace content shape.
// Stored in workspace_documents.content as jsonb where workspace_key='financials'.
// All monetary values are integer cents. schema_version allows future migrations.

export type StartupCostCategory =
  | "build_out"
  | "equipment"
  | "licenses"
  | "deposits"
  | "inventory"
  | "other";

export type RevenueStream =
  | "coffee"
  | "food"
  | "wholesale"
  | "catering"
  | "other";

export type LaborRole = "owner" | "barista" | "manager" | "other";

export type FixedCostCategory =
  | "rent"
  | "utilities"
  | "insurance"
  | "software"
  | "marketing"
  | "other";

export type FundingSource =
  | "self"
  | "sba"
  | "family"
  | "investor"
  | "grant"
  | "other";

export type FindingSeverity = "warn" | "error" | "info";

export interface StartupCostLine {
  id: string;
  category: StartupCostCategory;
  label: string;
  amount_cents: number;
  note?: string;
}

export interface RevenueLine {
  id: string;
  stream: RevenueStream;
  label: string;
  monthly_cents: number;
}

export interface LaborLine {
  id: string;
  role: LaborRole;
  headcount: number;
  monthly_cents: number;
}

export interface FixedCostLine {
  id: string;
  category: FixedCostCategory;
  label: string;
  monthly_cents: number;
}

export interface MonthlyPnl {
  revenue: RevenueLine[];
  cogs_percent: number;
  labor: LaborLine[];
  fixed_costs: FixedCostLine[];
}

export interface BreakEven {
  assumptions_note?: string;
}

export interface FundingLine {
  id: string;
  source: FundingSource;
  label: string;
  amount_cents: number;
  terms_note?: string;
}

export interface AiFlag {
  rule_id: string;
  severity: FindingSeverity;
  message: string;
  evidence?: string;
}

export interface AiFindings {
  last_run_at: string;
  flags: AiFlag[];
}

export interface FinancialsContent {
  schema_version: 1;
  startup_costs: StartupCostLine[];
  monthly_pnl: MonthlyPnl;
  break_even: BreakEven;
  funding: FundingLine[];
  ai_findings?: AiFindings;
}
