// TIM-2759: Business Plan V2 — Appendix tab.
// Sections: Monthly Statements.
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpAppendixPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="appendix" {...data} />;
}
