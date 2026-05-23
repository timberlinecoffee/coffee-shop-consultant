import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { loadWorkspaceContext } from "../_shared";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LocationLeaseWorkspacePage() {
  const { planId, trialMessagesUsed } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="location_lease"
      title="Location & Lease"
      description="Score sites, model rent against your concept, and lock in lease terms that match your financial plan. The Co-pilot keeps your shortlist and numbers in context."
      icon={MapPin}
      currentFocusLabel="Location & Lease workspace overview"
      trialMessagesUsed={trialMessagesUsed}
    />
  );
}
