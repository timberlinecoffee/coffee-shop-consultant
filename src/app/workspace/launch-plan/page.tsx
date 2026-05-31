// TIM-1521: Launch Plan umbrella URL redirects to the Launch Milestones tab.
// The suite uses the same sub-nav tab pattern as Equipment & Supplies —
// there is no umbrella card page; both sub-pages share a "Launch Plan"
// header with LaunchPlanSubNav tabs below it.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LaunchPlanUmbrellaPage() {
  redirect("/workspace/launch-plan/milestones");
}
