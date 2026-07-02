// TIM-3111: Business Plan custom sections — update and delete by id.

export const dynamic = "force-dynamic";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

const PatchBodySchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  user_content: z.string().max(100_000).nullable().optional(),
  is_visible: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = PatchBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.user_content !== undefined) patch.user_content = parsed.data.user_content;
  if (parsed.data.is_visible !== undefined) patch.is_visible = parsed.data.is_visible;
  if (parsed.data.sort_order !== undefined) patch.sort_order = parsed.data.sort_order;

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true });
  }

  // RLS enforces ownership; plan_id filter is defense-in-depth.
  const { error } = await supabase
    .from("business_plan_custom_sections")
    .update(patch)
    .eq("id", id)
    .eq("plan_id", planId);

  if (error) return Response.json({ error: "Failed to update custom section" }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  const { error } = await supabase
    .from("business_plan_custom_sections")
    .delete()
    .eq("id", id)
    .eq("plan_id", planId);

  if (error) return Response.json({ error: "Failed to delete custom section" }, { status: 500 });

  return Response.json({ ok: true });
}
