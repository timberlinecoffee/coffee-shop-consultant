// TIM-1521: Opening Month Plan sub-page. The seed-driven playbook for the
// pre-open weeks, opening week, and first 30 days. Standalone Seed CTA so an
// AI-side failure on Launch Milestones can't block the founder from seeding
// the playbook (this is the path founder confirmed working in TIM-1518).
import { OpeningMonthPlanWorkspace } from "../../opening-month-plan/opening-month-plan-workspace";
import { loadLaunchPlanWorkspaceData } from "../_loader";

export const dynamic = "force-dynamic";

export default async function OpeningMonthPlaybookPage() {
  const data = await loadLaunchPlanWorkspaceData();
  return <OpeningMonthPlanWorkspace {...data} section="playbook" />;
}
