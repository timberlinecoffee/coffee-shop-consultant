// TIM-1521: legacy route. The suite was split into Launch Milestones and
// Opening Month Plan sub-pages under the Launch Plan suite.
// TIM-1634: the suite now uses the standard nav-bar/tab pattern instead of a
// two-card landing, so old bookmarks land directly on the first tab (Launch
// Milestones); the sub-nav lets the founder switch to Opening Month Plan.
// Kept for one release; remove after links in marketing/onboarding have been
// audited.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OpeningMonthPlanLegacyRedirect() {
  redirect("/workspace/launch-plan/milestones");
}
