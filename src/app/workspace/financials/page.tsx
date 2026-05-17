import { FinancialsWorkspaceRedesign } from "@/components/workspace/FinancialsWorkspaceRedesign";
import { loadWorkspaceContext } from "../_shared";

export const dynamic = "force-dynamic";

export default async function FinancialsWorkspacePage() {
  const { planId } = await loadWorkspaceContext();
  return <FinancialsWorkspaceRedesign planId={planId} />;
}
