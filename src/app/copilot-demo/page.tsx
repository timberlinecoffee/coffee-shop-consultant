import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceKey } from "@/types/supabase";
import { CopilotDemoClient } from "./copilot-demo-client";

export const dynamic = "force-dynamic";

const WORKSPACE_KEYS: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
];

export default async function CopilotDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return (
      <main className="min-h-screen bg-[#faf9f7] px-6 py-12">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-[#efefef] p-8">
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Co-pilot demo</h1>
          <p className="mt-2 text-sm text-[#666]">
            You don&apos;t have a coffee shop plan yet. Finish onboarding to start using the co-pilot.
          </p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#155e63] hover:underline"
          >
            Go to onboarding →
          </Link>
        </div>
      </main>
    );
  }

  const requested = (params.workspace ?? "concept") as WorkspaceKey;
  const workspaceKey: WorkspaceKey = WORKSPACE_KEYS.includes(requested) ? requested : "concept";

  return (
    <main className="min-h-screen bg-[#faf9f7] pb-32">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-[#1a1a1a]">CoPilotDrawer demo</h1>
        <p className="mt-2 text-sm text-[#666]">
          Test page for [TIM-633] — streaming, thinking pill, and thread switching.
          Use the workspace selector below to mount the drawer with a different
          <code className="px-1 mx-1 rounded bg-white border border-[#efefef] text-xs">workspaceKey</code>
          prop.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {WORKSPACE_KEYS.map((key) => (
            <Link
              key={key}
              href={`/copilot-demo?workspace=${key}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                key === workspaceKey
                  ? "bg-[#155e63] text-white border-[#155e63]"
                  : "bg-white text-[#1a1a1a] border-[#e5e3df] hover:border-[#155e63]"
              }`}
            >
              {key.replace(/_/g, " ")}
            </Link>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-2xl border border-[#efefef] p-6 text-sm text-[#444] space-y-2">
          <p>
            <span className="font-semibold">Plan id:</span>{" "}
            <code className="text-xs">{plan.id}</code>
          </p>
          <p>
            <span className="font-semibold">Workspace:</span>{" "}
            <code className="text-xs">{workspaceKey}</code>
          </p>
          <p>
            <span className="font-semibold">Try:</span> Tap the floating Co-pilot button. Send a
            question; watch the Thinking… pill, then streaming text. Open the conversations panel
            in the drawer header to switch threads or start a new one.
          </p>
        </div>
      </div>

      <CopilotDemoClient planId={plan.id} workspaceKey={workspaceKey} />
    </main>
  );
}
