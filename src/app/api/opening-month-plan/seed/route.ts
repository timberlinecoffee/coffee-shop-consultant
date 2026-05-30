// TIM-1411: Seed a starter Opening Month Plan playbook into `soft_open_plan_items`.
// Skips if the owner has already populated the workspace. Tasks are Title Case
// at rest per the AGENTS.md title-case rule.

import { createClient } from "@/lib/supabase/server";
import { isSubscriptionActive, isBetaWaived } from "@/lib/access";
import type { LaunchItemStatus } from "@/types/supabase";

interface SeedRow {
  day_offset: number;
  task: string;
  owner: string | null;
  notes: string | null;
}

const SEED_ROWS: SeedRow[] = [
  // ── Pre-Open Weeks ────────────────────────────────────────────────────────
  { day_offset: -28, task: "Lock Staff Training Schedule", owner: "Founder", notes: "Week-by-week milk, espresso, register, and POS run-throughs." },
  { day_offset: -21, task: "Place First Supplier Orders", owner: "Founder", notes: "Coffee, milk, cups, lids, syrups, pastry — confirm lead times." },
  { day_offset: -14, task: "Walk The Neighborhood", owner: "Founder", notes: "Drop intro cards at nearby businesses, offices, and residential buildings." },
  { day_offset: -10, task: "Friends And Family Soft Open Date", owner: "Founder", notes: "Pick a date and an invite list. Treat it as a real dress rehearsal." },
  { day_offset: -7, task: "Soft Open Dry Run With Staff", owner: "Founder", notes: "Full opening flow with no customers. Time the bar and identify gaps." },
  { day_offset: -3, task: "Confirm Grand Open Marketing Push", owner: "Founder", notes: "Sign, social posts, local press follow-up, neighborhood signage." },

  // ── Opening Week ──────────────────────────────────────────────────────────
  { day_offset: 0, task: "Grand Open Day", owner: "Founder", notes: "Plan staffing as if you'll be twice as busy. Have backup bar staff." },
  { day_offset: 1, task: "Daily Debrief With Staff", owner: "Founder", notes: "Fifteen minutes after close. What broke, what worked, what to change." },
  { day_offset: 3, task: "Restock From First Sales Read", owner: "Founder", notes: "Reorder anything sold faster than projected. Adjust par levels." },
  { day_offset: 7, task: "First Week Recap", owner: "Founder", notes: "Sales by daypart, top sellers, customer feedback themes, staff notes." },

  // ── First 30 Days ─────────────────────────────────────────────────────────
  { day_offset: 10, task: "Lock Supplier Delivery Cadence", owner: "Founder", notes: "Confirm weekly cadence with each vendor based on real sell-through." },
  { day_offset: 14, task: "Two Week KPI Check", owner: "Founder", notes: "Ticket size, drink mix, labor as % of sales, waste. Note what to tweak." },
  { day_offset: 21, task: "Three Week Staff Review", owner: "Founder", notes: "One-on-ones with each opener. Address coverage gaps before month two." },
  { day_offset: 28, task: "Month One Recap And Plan", owner: "Founder", notes: "What stays, what changes for month two. Update training and menu as needed." },
];

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

  if (countErr) return Response.json({ error: "Failed to seed" }, { status: 500 });
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

  if (error) return Response.json({ error: "Failed to seed" }, { status: 500 });
  return Response.json({ items: data ?? [], seeded: data?.length ?? 0 });
}
