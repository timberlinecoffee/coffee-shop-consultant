// TIM-2778: Launch Plan suite main tab (v2). Renders the overview tab with
// AccordionSection summaries for milestones and playbook. Previously this was
// a redirect to /milestones; it's now a real page so the 3-tab sub-nav
// (Launch Plan / Milestones / Opening Month) has a home route.
import { OpeningMonthPlanWorkspace } from "../opening-month-plan/opening-month-plan-workspace";
import { loadLaunchPlanWorkspaceData } from "./_loader";

export const dynamic = "force-dynamic";

export default async function LaunchPlanMainPage() {
  const data = await loadLaunchPlanWorkspaceData();
  return <OpeningMonthPlanWorkspace {...data} section="overview" />;
}
