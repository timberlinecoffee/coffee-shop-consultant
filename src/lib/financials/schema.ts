import { z } from "zod";
import { EMPTY_FINANCIALS } from "./defaults.ts";
import type { FinancialsContent } from "../../types/financials.ts";

const StartupCostCategorySchema = z.enum([
  "build_out",
  "equipment",
  "licenses",
  "deposits",
  "inventory",
  "other",
]);

const RevenueStreamSchema = z.enum([
  "coffee",
  "food",
  "wholesale",
  "catering",
  "other",
]);

const LaborRoleSchema = z.enum(["owner", "barista", "manager", "other"]);

const FixedCostCategorySchema = z.enum([
  "rent",
  "utilities",
  "insurance",
  "software",
  "marketing",
  "other",
]);

const FundingSourceSchema = z.enum([
  "self",
  "sba",
  "family",
  "investor",
  "grant",
  "other",
]);

const FindingSeveritySchema = z.enum(["warn", "error", "info"]);

const StartupCostLineSchema = z.object({
  id: z.string(),
  category: StartupCostCategorySchema,
  label: z.string(),
  amount_cents: z.number().int().nonnegative(),
  note: z.string().optional(),
});

const RevenueLineSchema = z.object({
  id: z.string(),
  stream: RevenueStreamSchema,
  label: z.string(),
  monthly_cents: z.number().int().nonnegative(),
});

const LaborLineSchema = z.object({
  id: z.string(),
  role: LaborRoleSchema,
  headcount: z.number().int().positive(),
  monthly_cents: z.number().int().nonnegative(),
});

const FixedCostLineSchema = z.object({
  id: z.string(),
  category: FixedCostCategorySchema,
  label: z.string(),
  monthly_cents: z.number().int().nonnegative(),
});

const MonthlyPnlSchema = z.object({
  revenue: z.array(RevenueLineSchema).default([]),
  cogs_percent: z.number().int().min(0).max(100).default(28),
  labor: z.array(LaborLineSchema).default([]),
  fixed_costs: z.array(FixedCostLineSchema).default([]),
});

const BreakEvenSchema = z.object({
  assumptions_note: z.string().optional(),
});

const FundingLineSchema = z.object({
  id: z.string(),
  source: FundingSourceSchema,
  label: z.string(),
  amount_cents: z.number().int().nonnegative(),
  terms_note: z.string().optional(),
});

const AiFlagSchema = z.object({
  rule_id: z.string(),
  severity: FindingSeveritySchema,
  message: z.string(),
  evidence: z.string().optional(),
});

const AiFindingsSchema = z.object({
  last_run_at: z.string(),
  flags: z.array(AiFlagSchema).default([]),
});

export const FinancialsContentSchema = z.object({
  schema_version: z.literal(1).default(1),
  startup_costs: z.array(StartupCostLineSchema).default([]),
  monthly_pnl: MonthlyPnlSchema.default({
    revenue: [],
    cogs_percent: 28,
    labor: [],
    fixed_costs: [],
  }),
  break_even: BreakEvenSchema.default({}),
  funding: z.array(FundingLineSchema).default([]),
  ai_findings: AiFindingsSchema.optional(),
});

export type FinancialsContentParsed = z.infer<typeof FinancialsContentSchema>;

export function parseFinancialsContent(raw: unknown): FinancialsContent {
  const result = FinancialsContentSchema.safeParse(raw);
  if (result.success) {
    return result.data as FinancialsContent;
  }
  // Partial parse: merge valid fields over EMPTY_FINANCIALS.
  if (raw && typeof raw === "object") {
    const partial = FinancialsContentSchema.partial().safeParse(raw);
    if (partial.success) {
      return {
        ...EMPTY_FINANCIALS,
        ...Object.fromEntries(
          Object.entries(partial.data).filter(([, v]) => v !== undefined)
        ),
      } as FinancialsContent;
    }
  }
  return { ...EMPTY_FINANCIALS };
}
