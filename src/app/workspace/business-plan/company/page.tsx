// TIM-2759: Business Plan V2 — Company tab.
// Sections: Overview, Team.
import { loadBusinessPlanData } from "../_loader";
import { BusinessPlanTabWorkspace } from "../business-plan-tab-workspace";

export const dynamic = "force-dynamic";

export default async function BpCompanyPage() {
  const data = await loadBusinessPlanData();
  return <BusinessPlanTabWorkspace tabKey="company" {...data} />;
}
