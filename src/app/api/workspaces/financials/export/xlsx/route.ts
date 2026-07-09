// TIM-1103: Financial Planner — Excel (.xlsx) export endpoint.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  defaultMonthlyProjections,
  mergeEquipmentItemsIntoMp,
  normalizeMonthlyProjections,
  groupMenuItemsByCategory,
  computeCogsGrandTotalMonthlyCents,
  type MonthlyProjections,
  type EquipmentSummary,
  type MenuItemForCogs,
} from "@/lib/financial-projection";
import { buildFinancialPlannerWorkbook } from "@/lib/financial-planner/xlsx-export";
import { slugify, fmtYyyymmdd } from "@/lib/pdf/financial-planner/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return Response.json(
      { reason: "paywall", tier_required: "starter" },
      { status: 402 }
    );
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "No plan found" }, { status: 404 });
  }

  const [{ data: model }, { data: menuRows }] = await Promise.all([
    supabase
      .from("financial_models")
      .select("forecast_inputs, monthly_projections")
      .eq("plan_id", plan.id)
      .maybeSingle(),
    // TIM-3735: fetch menu items so the COGS Grand Total can be computed.
    supabase
      .from("menu_items_with_cogs")
      .select("id, name, category_id, category_name, price_cents, cogs_cents, computed_cogs_cents, expected_mix_pct, expected_popularity, archived")
      .eq("plan_id", plan.id)
      .order("position"),
  ]);

  const mp: MonthlyProjections =
    (model?.forecast_inputs as MonthlyProjections | null) ??
    defaultMonthlyProjections();

  // TIM-3735: compute centralized COGS Grand Total for the export workbook.
  const menuCogsByCategory = groupMenuItemsByCategory((menuRows ?? []) as MenuItemForCogs[]);
  const mpForCogs = normalizeMonthlyProjections((model as { monthly_projections?: unknown } | null)?.monthly_projections);
  const cogsGrandTotalMonthlyCents = computeCogsGrandTotalMonthlyCents(mpForCogs, menuCogsByCategory) || null;

  // TIM-1255: query full item details so we can inject per-item capex lines.
  const { data: equipmentRows } = await supabase
    .from("buildout_equipment_items")
    .select("id, name, category, quantity, unit_cost_cents, financing_method, useful_life_years, purchase_month, archived")
    .eq("plan_id", plan.id);

  const activeItems = (equipmentRows ?? []).filter((r: { archived: boolean | null }) => !r.archived);

  // Merge equipment items into mp as synthetic capex lines (TIM-1255).
  const mpFinal = mergeEquipmentItemsIntoMp(mp, activeItems);

  const equipment: EquipmentSummary = activeItems.reduce(
    (
      acc: EquipmentSummary,
      r: {
        quantity: number | null;
        unit_cost_cents: number | null;
        financing_method: string | null;
      }
    ) => {
      const cost = (r.quantity ?? 0) * (r.unit_cost_cents ?? 0);
      acc.total_cost_cents += cost;
      if (
        r.financing_method === "loan" ||
        r.financing_method === "lease" ||
        r.financing_method === "in_house_financing"
      ) {
        acc.financed_cost_cents += cost;
      }
      return acc;
    },
    { total_cost_cents: 0, financed_cost_cents: 0 }
  );

  const wb = buildFinancialPlannerWorkbook({
    mp: mpFinal,
    equipment,
    shopName: plan.plan_name,
    generatedDate: fmtDateLong(new Date()),
    cogsGrandTotalMonthlyCents,
  });

  const buffer = await wb.xlsx.writeBuffer();

  const slug = slugify(plan.plan_name);
  const date = fmtYyyymmdd(new Date());
  const filename = `financials-${slug}-${date}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
