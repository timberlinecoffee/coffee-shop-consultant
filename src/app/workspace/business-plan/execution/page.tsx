// TIM-2759: Business Plan V2 — Execution tab.
// Sections: Marketing & Sales, Operations, Milestones & Metrics.
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpExecutionPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="execution" {...data} />;
}
