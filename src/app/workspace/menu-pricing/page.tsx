import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function MenuPricingWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="menu_pricing"
      title="Menu & Pricing"
      description="Design your menu, source your beans and milks, and price for margin. The Co-pilot helps you stress-test prices against your projected ticket and traffic."
      icon="🍽️"
      shipsWith="W4 — Menu & Pricing workspace (TIM-622)"
      currentFocusLabel="Menu & Pricing workspace overview"
    />
  );
}
