// TIM-2759: Business Plan V2 — Executive Summary tab.
// Includes CoverBrandingPanel (document front-matter lives on the cover tab).
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpExecutiveSummaryPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="executive-summary" {...data} />;
}
