// TIM-1411: Seed a starter Opening Month Plan playbook into `soft_open_plan_items`.
// Skips if the owner has already populated the workspace. Tasks are Title Case
// at rest per the AGENTS.md title-case rule.
// TIM-2980: switched off inline latest-by-created plan resolver — use canonical
// getActivePlanId (TIM-2377) so plan ID agrees with users.current_plan_id.

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
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

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 });

  const { count: existingCount, error: countErr } = await supabase
    .from("soft_open_plan_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);

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
    plan_id: planId,
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
      plan_id: planId,
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
