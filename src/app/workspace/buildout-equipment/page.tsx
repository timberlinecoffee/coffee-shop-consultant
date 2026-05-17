// TIM-729: Real layout for /workspace/buildout-equipment.
// Replaces the WorkspaceShell stub. Loads equipment items + _digest server-side.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { EquipmentTable } from "@/components/buildout-equipment/EquipmentTable";
import { ContractorBidsCard } from "@/components/buildout-equipment/ContractorBidsCard";
import { BuildoutTimelineCard } from "@/components/buildout-equipment/BuildoutTimelineCard";
import { PermitsChecklistCard } from "@/components/buildout-equipment/PermitsChecklistCard";
import { BuildoutPlanPdfButton } from "@/components/buildout-equipment/BuildoutPlanPdfButton";

export const dynamic = "force-dynamic";

type EquipmentItem = {
  id: string;
  plan_id: string;
  name: string;
  category: string;
  vendor: string | null;
  model: string | null;
  quantity: number;
  unit_cost_cents: number;
  priority_tier: "must_have" | "important" | "nice_to_have";
  notes: string | null;
  archived: boolean;
  position: number;
};

type Digest = {
  equipment_total_cents?: number;
  buildout_bid_total_cents?: number;
};

async function loadBuildoutContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) redirect("/onboarding");

  const [itemsResult, wsDocResult] = await Promise.all([
    supabase
      .from("buildout_equipment_items")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "buildout_equipment")
      .maybeSingle(),
  ]);

  const digest = ((wsDocResult.data?.content as Record<string, unknown>)?._digest ?? {}) as Digest;

  return {
    planId: plan.id,
    initialItems: (itemsResult.data ?? []) as EquipmentItem[],
    digest,
  };
}

function fmtUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function BuildoutEquipmentWorkspacePage() {
  const { planId, initialItems, digest } = await loadBuildoutContext();

  const startupTotal =
    (digest.equipment_total_cents ?? 0) + (digest.buildout_bid_total_cents ?? 0);
  const hasDigest = startupTotal > 0;

  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 lg:pb-0">
      {/* Nav */}
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-[#155e63] font-medium hover:underline"
          >
            ← Back to dashboard
          </Link>
          <div className="flex items-center gap-3">
            <BuildoutPlanPdfButton />
            <span
              className="text-xs text-[#6b6b6b] hidden sm:inline"
              data-workspace-key="buildout_equipment"
            >
              Workspace · Build-out &amp; Equipment
            </span>
          </div>
        </div>
      </nav>

      {/* Cost-rollup banner */}
      <div className="sticky top-0 z-20 bg-[#155e63] text-white px-6 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium">
            Build-out &amp; Equipment → Financials startup costs:{" "}
            <span className="font-bold">
              {hasDigest ? fmtUsd(startupTotal) : "$0"}
            </span>{" "}
            <span className="text-white/70 text-xs font-normal">(auto-rolled)</span>
          </span>
          <Link
            href="/workspace/financials"
            className="text-xs font-medium text-white/90 underline hover:text-white transition-colors"
          >
            View in Financials →
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <div>
          <h1 className="font-semibold text-2xl text-[#1a1a1a]">
            🛠️ Build-out &amp; Equipment
          </h1>
          <p className="text-sm text-[#6b6b6b] mt-1">
            Plan bar layout, equipment spec, and construction timeline. The
            Co-pilot ties equipment choices back to your menu and build-out
            budget.
          </p>
        </div>

        {/* Equipment table */}
        <section id="equipment">
          <h2 className="font-semibold text-base text-[#1a1a1a] mb-4">
            Equipment
          </h2>
          <EquipmentTable planId={planId} initialItems={initialItems} />
        </section>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-6">
          <ContractorBidsCard />
          <BuildoutTimelineCard />
          <PermitsChecklistCard />
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="buildout_equipment"
        currentFocus={{ label: "Build-out & Equipment workspace" }}
      />

      <BottomTabBar />
    </div>
  );
}
