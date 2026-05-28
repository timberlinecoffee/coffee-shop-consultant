// TIM-1103: Financial Planner — PDF export endpoint.
// Renders a standalone, landscape-when-monthly PDF of the financials section
// with charts. Currency + fiscal-year aware. No emojis (TIM-196).

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import {
  defaultMonthlyProjections,
  mergeEquipmentItemsIntoMp,
  type MonthlyProjections,
  type EquipmentSummary,
} from "@/lib/financial-projection";
import {
  FinancialPlannerPdf,
  renderPlannerCharts,
  slugify,
  fmtYyyymmdd,
} from "@/lib/pdf/financial-planner/render";

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
    .select("subscription_status, beta_waiver_until, email")
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
    .select("id, shop_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return Response.json({ error: "No plan found" }, { status: 404 });
  }

  const { data: model } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", plan.id)
    .maybeSingle();

  const mp: MonthlyProjections =
    (model?.forecast_inputs as MonthlyProjections | null) ??
    defaultMonthlyProjections();

  // Pull equipment totals (matches the workspace's behavior — financed totals
  // feed depreciation and the loan schedule on MonthlySlice math).
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

  const charts = await renderPlannerCharts(mpFinal, equipment);
  const generatedDate = fmtDateLong(new Date());

  const element = FinancialPlannerPdf({
    mp: mpFinal,
    equipment,
    shopName: plan.shop_name,
    generatedDate,
    charts,
  });

  const { renderToStream } = await import("@react-pdf/renderer");
  const stream = await renderToStream(element);

  const slug = slugify(plan.shop_name);
  const date = fmtYyyymmdd(new Date());
  const filename = `groundwork-financials-${slug}-${date}.pdf`;

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
