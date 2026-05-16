import { FinancialsWorkspace } from "@/components/workspace/FinancialsWorkspace";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function FinancialsWorkspacePage() {
  const { planId } = await loadWorkspaceContext();
  return <FinancialsWorkspace planId={planId} />;
}
