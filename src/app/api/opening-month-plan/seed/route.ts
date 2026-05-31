// TIM-1411: Seed a starter Opening Month Plan playbook into `soft_open_plan_items`.
// Skips if the owner has already populated the workspace. Tasks are Title Case
// at rest per the AGENTS.md title-case rule.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { LaunchItemStatus } from "@/types/supabase";
import { SEED_ROWS } from "./seed-data";

export async function POST() {
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

  const allowed =
    !!profile &&
    (isSubscriptionActive(profile.subscription_status) || isBetaWaived(profile.beta_waiver_until));
  if (!allowed) {
    return Response.json({ reason: "paywall", tier_required: "starter" }, { status: 402 });
  }

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) return Response.json({ error: "No plan found" }, { status: 404 });

  const { count: existingCount, error: countErr } = await supabase
    .from("soft_open_plan_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id);

  if (countErr) {
    return Response.json(
      { error: "Failed to read existing playbook", detail: countErr.message },
      { status: 500 },
    );
  }
  if ((existingCount ?? 0) > 0) {
    return Response.json({ skipped: true, reason: "already_seeded" });
  }

  const inserts = SEED_ROWS.map((r) => ({
    plan_id: plan.id,
    day_offset: r.day_offset,
    task: r.task,
    owner: r.owner,
    status: "pending" as LaunchItemStatus,
    notes: r.notes,
  }));

  const { data, error } = await supabase
    .from("soft_open_plan_items")
    .insert(inserts)
    .select("*");

  if (error) {
    // Surface the underlying Postgres failure so the next regression (e.g.
    // a missed CHECK widening like TIM-1518) shows up in server logs with
    // enough context to diagnose, instead of a generic 500.
    console.error("[opening-month-plan/seed] insert failed", {
      plan_id: plan.id,
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return Response.json(
      { error: "Failed to seed", detail: error.message },
      { status: 500 },
    );
  }
  return Response.json({ items: data ?? [], seeded: data?.length ?? 0 });
}
