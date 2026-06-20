// TIM-2759: Business Plan V2 — Financial Plan tab.
// Sections: Forecast, Unit Economics, Break-even, Sensitivity, Financing,
//           DSCR, CapEx Schedule, Depreciation, Working Capital, Statements.
// FinancialDocumentsPanel renders on this tab only (spec §6).
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpFinancialPlanPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="financial-plan" {...data} />;
}
