import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";
import { BarChart2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinancialsWorkspacePage() {
  const { planId, trialMessagesUsed } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="financials"
      title="Financials"
      description="Build your startup budget, P&L, break-even, and cash-flow runway. The Co-pilot can answer follow-ups against the numbers you've already entered."
      icon={BarChart2}
currentFocusLabel="Financials workspace overview"
      trialMessagesUsed={trialMessagesUsed}
    />
  );
}
