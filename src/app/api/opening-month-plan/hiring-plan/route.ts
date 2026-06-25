// TIM-2980: switched off inline .single() plan resolver — use canonical
// getActivePlanId (TIM-2377) so plan ID agrees with users.current_plan_id.
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { isSubscriptionActive } from "@/lib/access";
import { normalizeMonthlyProjections } from "@/lib/financial-projection";
import type { NextRequest } from "next/server";

async function checkPaywall(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status")
    .eq("id", userId)
    .single();
  return profile && isSubscriptionActive(profile.subscription_status);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .select("*")
    .eq("plan_id", planId)
    .order("start_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: "Failed to load" }, { status: 500 });

  // TIM-2477 / TIM-2454 F5: hydrate `benefits_pct` / `benefits_fixed_cents`
  // from the matching PersonnelLine (via `org_role_id`). The Launch Plan
  // payroll total uses the canonical `personnelLoadedMonthlyCents` selector
  // and needs these fields to match the Hiring workspace and Financials. If
  // the role has no matching PersonnelLine, the client falls back to
  // `DEFAULT_BENEFITS_PCT` so the total still reflects a sensible burden.
  const { data: modelRow } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();

  const personnel = modelRow
    ? normalizeMonthlyProjections(modelRow.forecast_inputs).personnel
    : [];
  const benefitsByRoleId = new Map<string, { benefits_pct: number; benefits_fixed_cents?: number }>();
  for (const line of personnel) {
    if (typeof line.org_role_id === "string" && line.org_role_id.length > 0) {
      benefitsByRoleId.set(line.org_role_id, {
        benefits_pct: line.benefits_pct,
        benefits_fixed_cents: line.benefits_fixed_cents,
      });
    }
  }

  const items = (data ?? []).map((row) => {
    const match = benefitsByRoleId.get(row.id);
    return match
      ? {
          ...row,
          benefits_pct: match.benefits_pct,
          benefits_fixed_cents: match.benefits_fixed_cents ?? null,
        }
      : row;
  });

  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  if (!(await checkPaywall(supabase, user.id))) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { role_title, headcount, start_date, monthly_cost_cents, notes } = body as {
    role_title?: string;
    headcount?: number;
    start_date?: string | null;
    monthly_cost_cents?: number | null;
    notes?: string | null;
  };

  if (!role_title) {
    return Response.json({ error: "role_title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("hiring_plan_roles")
    .insert({
      plan_id: planId,
      role_title,
      headcount: headcount ?? 1,
      start_date: start_date ?? null,
      monthly_cost_cents: monthly_cost_cents ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: "Failed to create" }, { status: 500 });
  return Response.json({ item: data }, { status: 201 });
}
