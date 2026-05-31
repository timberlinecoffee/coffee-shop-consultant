// TIM-1521: Launch Milestones sub-page. Owns its own AI Generate CTA so a
// streaming-timer fire on milestones can't take the Opening Month Plan
// playbook with it.
import { OpeningMonthPlanWorkspace } from "../../opening-month-plan/opening-month-plan-workspace";
import { loadLaunchPlanWorkspaceData } from "../_loader";

export const dynamic = "force-dynamic";

export default async function LaunchMilestonesPage() {
  const data = await loadLaunchPlanWorkspaceData();
  return <OpeningMonthPlanWorkspace {...data} section="milestones" />;
}
