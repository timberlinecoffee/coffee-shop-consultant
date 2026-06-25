// TIM-1147: Read + write manual workspace/component status.
//
// GET  → returns all status rows for the active plan as { [componentKey]: status }.
// POST → upserts a single component's status.
//
// Auto-promotion: clients fire-and-forget POST with mode='promote_on_edit'
// when a workspace receives its first edit; the server promotes
// `not_started` → `in_progress` only, never overrides `complete`.
//
// TIM-3070: plan lookup uses the canonical getActivePlanId resolver so writes
// land on users.current_plan_id, matching the read paths in
// WorkspaceStatusBootstrap (TIM-2962) and dashboard/plan-overview. The
// previous latest-by-created_at resolver caused writes to land on a different
// plan than the one being read for multi-plan users, so the Concept (and any)
// workspace appeared to revert on reload and the dashboard never reflected
// the change.

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function loadPlanId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 };

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return { error: "No plan found" as const, status: 404 };
  return { planId };
}

export async function GET() {
  const supabase = await createClient();
  const ctx = await loadPlanId(supabase);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await supabase
    .from("workspace_status")
    .select("component_key, status, updated_at")
    .eq("plan_id", ctx.planId);

  if (error) {
    return Response.json({ error: "Failed to load workspace status" }, { status: 500 });
  }

  const statuses: Record<string, WorkspaceStatus> = {};
  const updatedAt: Record<string, string> = {};
  for (const row of data ?? []) {
    if (isWorkspaceStatus(row.status)) {
      statuses[row.component_key] = row.status;
      updatedAt[row.component_key] = row.updated_at;
    }
  }
  return Response.json({ statuses, updatedAt });
}

interface PostBody {
  componentKey?: unknown;
  status?: unknown;
  mode?: unknown; // 'set' (default) | 'promote_on_edit'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const ctx = await loadPlanId(supabase);
  if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const componentKey = typeof body.componentKey === "string" ? body.componentKey.trim() : "";
  if (!componentKey || componentKey.length > 128) {
    return Response.json({ error: "componentKey is required" }, { status: 400 });
  }

  const mode = body.mode === "promote_on_edit" ? "promote_on_edit" : "set";

  if (mode === "promote_on_edit") {
    // Only promote not_started → in_progress; never overwrite in_progress/complete.
    const { data: existing } = await supabase
      .from("workspace_status")
      .select("status")
      .eq("plan_id", ctx.planId)
      .eq("component_key", componentKey)
      .maybeSingle();

    if (existing && existing.status !== "not_started") {
      return Response.json({
        componentKey,
        status: existing.status as WorkspaceStatus,
        promoted: false,
      });
    }

    const { error } = await supabase
      .from("workspace_status")
      .upsert(
        { plan_id: ctx.planId, component_key: componentKey, status: "in_progress" },
        { onConflict: "plan_id,component_key" }
      );

    if (error) {
      return Response.json({ error: "Failed to promote status" }, { status: 500 });
    }
    return Response.json({ componentKey, status: "in_progress" as WorkspaceStatus, promoted: true });
  }

  // mode === 'set' — explicit user action; allows any 3-state transition.
  if (!isWorkspaceStatus(body.status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_status")
    .upsert(
      { plan_id: ctx.planId, component_key: componentKey, status: body.status },
      { onConflict: "plan_id,component_key" }
    );

  if (error) {
    return Response.json({ error: "Failed to update status" }, { status: 500 });
  }

  return Response.json({ componentKey, status: body.status, promoted: false });
}
