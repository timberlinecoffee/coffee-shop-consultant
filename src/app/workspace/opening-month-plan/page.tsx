// TIM-1521: legacy route. The suite was split into a Launch Plan umbrella
// with two sub-pages — Launch Milestones and Opening Month Plan. Old
// bookmarks land on the umbrella so the founder can pick which half they
// wanted. Kept for one release; remove after links in marketing/onboarding
// have been audited.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OpeningMonthPlanLegacyRedirect() {
  redirect("/workspace/launch-plan");
}
