// TIM-1303: Comp framework read/write for a hiring role card.
// GET ?org_role_id=X  → PersonnelLine linked to that org role (or null)
// POST { org_role_id, role_title, headcount, pay_basis, pay_amount_cents,
//        hours_per_week?, benefits_pct }
//     → upserts the PersonnelLine in forecast_inputs.personnel (preserving
//       financial-only fields), pushes derived monthly_cost_cents back to
//       hiring_plan_roles, returns { line, monthly_cost_cents }

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { PersonnelLine, PersonnelPayBasis } from "@/lib/financial-projection";
import {
  personnelLoadedMonthlyCents,
  normalizeMonthlyProjections,
} from "@/lib/financial-projection";
import { toTitleCase } from "@/lib/text";
import type { NextRequest } from "next/server";

function genStaffId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `staff:${crypto.randomUUID()}`;
  }
  return `staff:${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const orgRoleId = request.nextUrl.searchParams.get("org_role_id");
  if (!orgRoleId) return Response.json({ error: "Missing org_role_id" }, { status: 400 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const { data: modelRow } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();

  if (!modelRow) return Response.json({ line: null });

  const mp = normalizeMonthlyProjections(modelRow.forecast_inputs);
  const line = mp.personnel.find((l) => l.org_role_id === orgRoleId) ?? null;
  return Response.json({ line });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 });
  }

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgRoleId = typeof body.org_role_id === "string" ? body.org_role_id : null;
  if (!orgRoleId) return Response.json({ error: "Missing org_role_id" }, { status: 400 });

  const roleTitle =
    typeof body.role_title === "string" ? toTitleCase(body.role_title) : "";

  const headcount =
    typeof body.headcount === "number" ? Math.max(1, Math.floor(body.headcount)) : 1;

  const payBasis: PersonnelPayBasis = (["annual", "monthly", "hourly"] as const).includes(
    body.pay_basis as PersonnelPayBasis
  )
    ? (body.pay_basis as PersonnelPayBasis)
    : "monthly";

  const payAmountCents =
    typeof body.pay_amount_cents === "number"
      ? Math.max(0, Math.round(body.pay_amount_cents))
      : 0;

  const hoursPerWeek =
    payBasis === "hourly" && typeof body.hours_per_week === "number"
      ? Math.max(0, body.hours_per_week)
      : undefined;

  const benefitsPct =
    typeof body.benefits_pct === "number" ? Math.max(0, body.benefits_pct) : 0;

  // Load current financial model
  const { data: modelRow } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", planId)
    .maybeSingle();

  const mp = normalizeMonthlyProjections(modelRow?.forecast_inputs ?? null);
  const personnel = [...mp.personnel];

  const idx = personnel.findIndex((l) => l.org_role_id === orgRoleId);
  let updatedLine: PersonnelLine;

  if (idx >= 0) {
    // Update existing line — preserve financial-only fields
    const existing = personnel[idx];
    updatedLine = {
      ...existing,
      role: roleTitle || existing.role,
      headcount,
      pay_basis: payBasis,
      pay_amount_cents: payAmountCents,
      benefits_pct: benefitsPct,
    };
    if (payBasis === "hourly") {
      updatedLine.hours_per_week = hoursPerWeek ?? existing.hours_per_week ?? 30;
    } else {
      delete updatedLine.hours_per_week;
    }
    personnel[idx] = updatedLine;
  } else {
    // Create new line linked to this org role
    updatedLine = {
      id: genStaffId(),
      role: roleTitle || "Unnamed Role",
      headcount,
      pay_basis: payBasis,
      pay_amount_cents: payAmountCents,
      benefits_pct: benefitsPct,
      cost_category: "overhead",
      org_role_id: orgRoleId,
    };
    if (payBasis === "hourly") {
      updatedLine.hours_per_week = hoursPerWeek ?? 30;
    }
    personnel.push(updatedLine);
  }

  // Merge personnel back into the raw forecast_inputs (preserve all other fields)
  const rawInputs =
    modelRow?.forecast_inputs && typeof modelRow.forecast_inputs === "object"
      ? (modelRow.forecast_inputs as Record<string, unknown>)
      : {};
  const updatedInputs = { ...rawInputs, personnel };

  await supabase
    .from("financial_models")
    .upsert({ plan_id: planId, forecast_inputs: updatedInputs }, { onConflict: "plan_id" });

  // Compute derived loaded cost and push to hiring_plan_roles
  const loadedCost = personnelLoadedMonthlyCents(updatedLine);

  await supabase
    .from("hiring_plan_roles")
    .update({ monthly_cost_cents: loadedCost })
    .eq("id", orgRoleId)
    .eq("plan_id", planId);

  return Response.json({ line: updatedLine, monthly_cost_cents: loadedCost });
}
