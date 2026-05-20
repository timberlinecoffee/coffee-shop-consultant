import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { ExportPdfButton } from "@/components/location-lease/ExportPdfButton";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function LocationLeaseWorkspacePage() {
  const { planId } = await loadWorkspaceContext();

  return (
    <WorkspaceShell
      planId={planId}
      workspaceKey="location_lease"
      title="Location & Lease"
      description="Score sites, model rent against your concept, and lock in lease terms that match your financial plan. The Co-pilot keeps your shortlist and numbers in context."
      icon="map"
      shipsWith="W2 — Location & Lease workspace (TIM-620)"
      currentFocusLabel="Location & Lease workspace overview"
      actions={<ExportPdfButton planId={planId} />}
    />
  );
}
