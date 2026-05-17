import { FinancialsWorkspace } from "@/components/workspace/FinancialsWorkspace";
import { FinancialsClient } from "@/components/financials/FinancialsClient";
import { AiFindingsSidebar } from "@/components/financials/AiFindingsSidebar";
import { loadWorkspaceContext } from "../_shared";
import { createClient } from "@/lib/supabase/server";
import type { FinancialInputs } from "@/lib/financials/calc";
import type { Flag } from "@/lib/financials/sanityChecks";

export const dynamic = "force-dynamic";

function extractFinancialInputs(
  content: Record<string, unknown> | null,
): Partial<FinancialInputs> | null {
  if (!content) return null;
  const proj =
    typeof content.monthly_projections === "object" && content.monthly_projections !== null
      ? (content.monthly_projections as Record<string, unknown>)
      : null;
  const startup =
    typeof content.startup_costs === "object" && content.startup_costs !== null
      ? (content.startup_costs as Record<string, unknown>)
      : null;
  if (!proj && !startup) return null;
  return {
    startupCosts: Number(startup?.total ?? 0) || 0,
    monthlyRevenue: Number(proj?.monthlyRevenue ?? 0) || 0,
    monthlyCogs: Number(proj?.monthlyCogs ?? 0) || 0,
    monthlyRent: Number(proj?.monthlyRent ?? 0) || 0,
    monthlyOtherFixed: Number(proj?.monthlyOtherFixed ?? 0) || 0,
  };
}

export default async function FinancialsWorkspacePage() {
  const { planId } = await loadWorkspaceContext();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "financials")
    .maybeSingle();

  const content = (doc?.content as Record<string, unknown> | null) ?? null;
  const financialInputs = extractFinancialInputs(content);

  const aiFindings = content?.ai_findings as
    | { last_run_at: string; flags: Flag[] }
    | null
    | undefined;
  const flags: Flag[] = aiFindings?.flags ?? [];
  const lastRunAt: string | null = aiFindings?.last_run_at ?? null;

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <FinancialsWorkspace planId={planId} />
        <FinancialsClient planId={planId} inputs={financialInputs} />
      </div>
      {flags.length > 0 && (
        <div className="w-72 shrink-0 sticky top-6">
          <AiFindingsSidebar flags={flags} lastRunAt={lastRunAt} />
        </div>
      )}
    </div>
  );
}
