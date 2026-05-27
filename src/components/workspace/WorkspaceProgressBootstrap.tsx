import { createClient } from "@/lib/supabase/server";
import { normalizeConceptV2, getConceptV2Progress } from "@/lib/concept";
import { WorkspaceProgressApplier } from "./WorkspaceProgressApplier";

// TIM-1093: Server component that fetches sidebar progress out-of-band so
// it never blocks the WorkspaceLayout from rendering the sidebar shell.
// Rendered inside a Suspense boundary in workspace/layout.tsx; if any
// query fails or hangs, the sidebar keeps working with manifest defaults.
export async function WorkspaceProgressBootstrap({ userId }: { userId: string }) {
  const completed: Record<number, number> = {};

  try {
    const supabase = await createClient();

    const { data: plan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (plan?.id) {
      const [{ data: conceptDoc }, { data: responses }] = await Promise.all([
        supabase
          .from("workspace_documents")
          .select("content")
          .eq("plan_id", plan.id)
          .eq("workspace_key", "concept")
          .maybeSingle(),
        supabase
          .from("module_responses")
          .select("module_number")
          .eq("plan_id", plan.id)
          .eq("status", "completed"),
      ]);

      if (conceptDoc?.content) {
        const progress = getConceptV2Progress(normalizeConceptV2(conceptDoc.content));
        completed[1] = progress.filled;
      }

      for (const row of responses ?? []) {
        const n = row.module_number;
        completed[n] = (completed[n] ?? 0) + 1;
      }
    }
  } catch {
    // Swallow — the sidebar shell already rendered with zeros via the
    // provider's initialItems. A missing progress patch is a soft fail.
  }

  return <WorkspaceProgressApplier completed={completed} />;
}
