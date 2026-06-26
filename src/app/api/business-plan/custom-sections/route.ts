// TIM-3111: Business Plan custom sections — list and create.

export const dynamic = "force-dynamic";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

const MAX_CUSTOM_SECTIONS = 20;

const CreateBodySchema = z.object({
  title: z.string().min(1).max(200).trim(),
});

// Rule 2: all actions re-verify plan ownership server-side.
async function resolveOwnerPlanId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return plan?.id ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await resolveOwnerPlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  const { data, error } = await supabase
    .from("business_plan_custom_sections")
    .select("id, title, user_content, is_visible, sort_order, created_at")
    .eq("plan_id", planId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: "Failed to load custom sections" }, { status: 500 });

  return Response.json({ customSections: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await resolveOwnerPlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  // Rule 3: validate body.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = CreateBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Cap at MAX_CUSTOM_SECTIONS per plan.
  const { count } = await supabase
    .from("business_plan_custom_sections")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);

  if ((count ?? 0) >= MAX_CUSTOM_SECTIONS) {
    return Response.json(
      { error: `You can add up to ${MAX_CUSTOM_SECTIONS} custom sections per plan.` },
      { status: 422 }
    );
  }

  // sort_order = current count so new items append at the bottom.
  const { data: inserted, error } = await supabase
    .from("business_plan_custom_sections")
    .insert({
      plan_id: planId,
      title: parsed.data.title,
      sort_order: count ?? 0,
    })
    .select("id, title, user_content, is_visible, sort_order, created_at")
    .single();

  if (error || !inserted) {
    return Response.json({ error: "Failed to create custom section" }, { status: 500 });
  }

  return Response.json({ customSection: inserted }, { status: 201 });
}
