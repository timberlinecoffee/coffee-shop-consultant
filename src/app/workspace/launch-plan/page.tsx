// TIM-1634: Launch Plan suite entry. The two-card landing page was the only
// suite in Groundwork that navigated via clickable cards (board flagged the
// inconsistency on TIM-1407). The suite now follows the standard nav-bar/tab
// pattern (see LaunchPlanSubNav, mirroring the Equipment & Supplies suite):
// the suite root redirects to its first tab, and both sub-pages carry the
// shared sub-nav strip. No bespoke landing UI.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LaunchPlanUmbrellaPage() {
  redirect("/workspace/launch-plan/milestones");
}
