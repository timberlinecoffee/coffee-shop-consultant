// TIM-1215: Per-user UI preferences (column order, visibility).
// GET /api/ui-prefs/:key  — returns pref_data for the key, or null.
// PUT /api/ui-prefs/:key  — upserts pref_data for the key.

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { key } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_ui_prefs")
    .select("pref_data")
    .eq("user_id", user.id)
    .eq("pref_key", key)
    .maybeSingle();

  return Response.json({ data: data?.pref_data ?? null });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const { key } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert(
      { user_id: user.id, pref_key: key, pref_data: body, updated_at: new Date().toISOString() },
      { onConflict: "user_id,pref_key" }
    );

  if (error) { console.error("[ui-prefs] DB error:", error); return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 }); }
  return Response.json({ ok: true });
}
