// TIM-2759: Business Plan V2 — Opportunity tab.
// Sections: Problem & Solution, Target Market, Competition, Risks.
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpOpportunityPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="opportunity" {...data} />;
}
