// TIM-1259: org-structure <-> Salaries link endpoint.
//   GET  -> the plan's hiring_plan_roles, projected to the OrgRole shape the
//           Salaries Sync panel needs. The opt-in toggle itself lives in the
//           financial model (forecast_inputs.org_sync_enabled), so it is not
//           returned here.
//   POST -> push salaries -> org: upsert hiring_plan_roles from the supplied
//           upserts, then return the refreshed role list (with new ids) so the
//           client can re-establish org_role_id links.
//
// Pulling org -> salaries needs no endpoint: the client already has the roles
// from GET and mutates personnel in-memory (persisted via the model autosave).

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import { toTitleCase } from "@/lib/text";
import type { OrgRole, OrgRoleUpsert } from "@/lib/org-sync";
import type { NextRequest } from "next/server";

async function fetchRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string
): Promise<OrgRole[]> {
  const { data } = await supabase
    .from("hiring_plan_roles")
    .select("id, role_title, headcount, monthly_cost_cents")
    .eq("plan_id", planId)
    .order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    role_title: (r.role_title as string) ?? "",
    headcount: typeof r.headcount === "number" ? r.headcount : 1,
    monthly_cost_cents: typeof r.monthly_cost_cents === "number" ? r.monthly_cost_cents : null,
  }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const roles = await fetchRoles(supabase, planId);
  return Response.json({ roles });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Writes follow the same access gate as the financial model PATCH.
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) && !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  let body: { upserts?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.upserts)) {
    return Response.json({ error: "Missing upserts array" }, { status: 400 });
  }

  // Only operate on roles that belong to this plan (defense against a spoofed id).
  const existing = await fetchRoles(supabase, planId);
  const existingIds = new Set(existing.map((r) => r.id));

  for (const raw of body.upserts as OrgRoleUpsert[]) {
    if (!raw || typeof raw !== "object") continue;
    const role_title = typeof raw.role_title === "string" ? toTitleCase(raw.role_title) : "";
    if (!role_title) continue;
    const headcount =
      typeof raw.headcount === "number" && raw.headcount >= 0 ? Math.floor(raw.headcount) : 1;
    const monthly_cost_cents =
      typeof raw.monthly_cost_cents === "number" && raw.monthly_cost_cents >= 0
        ? Math.round(raw.monthly_cost_cents)
        : 0;

    if (raw.id && existingIds.has(raw.id)) {
      await supabase
        .from("hiring_plan_roles")
        .update({ role_title, headcount, monthly_cost_cents })
        .eq("id", raw.id)
        .eq("plan_id", planId);
    } else {
      await supabase.from("hiring_plan_roles").insert({
        plan_id: planId,
        role_title,
        headcount,
        monthly_cost_cents,
        status: "planned",
      });
    }
  }

  const roles = await fetchRoles(supabase, planId);
  return Response.json({ roles });
}
