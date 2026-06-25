// TIM-2949: Server-issued signed URL for a private menu-item-photos object.
// Lets the menu workspace render <img> without the client needing service-role
// access. Auth gate + plan-ownership check match the upload route.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { createClient } from "@/lib/supabase/server";
import { getActivePlanId } from "@/lib/plan-context";
import type { NextRequest } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) return Response.json({ error: "No plan" }, { status: 404 });

  const { data: item } = await supabase
    .from("menu_items")
    .select("photo_path")
    .eq("id", id)
    .eq("plan_id", planId)
    .maybeSingle();
  if (!item) return Response.json({ error: "Item not found" }, { status: 404 });
  if (!item.photo_path) return Response.json({ signedUrl: null });

  const { data: signed, error } = await supabase.storage
    .from("menu-item-photos")
    .createSignedUrl(item.photo_path, 60 * 60);
  if (error || !signed) {
    return Response.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return Response.json({ signedUrl: signed.signedUrl });
}
