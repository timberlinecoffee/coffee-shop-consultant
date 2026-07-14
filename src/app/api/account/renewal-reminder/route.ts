// TIM-1660: Opt annual subscribers in for a renewal reminder email.
// Persists to user_ui_prefs under key "renewal-reminder".

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as Record<string, unknown>).email).trim()
      : user.email ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "A valid email address is required." }, { status: 422 });
  }

  const prefData = {
    optedIn: true,
    email,
    optedInAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("user_ui_prefs")
    .upsert(
      { user_id: user.id, pref_key: "renewal-reminder", pref_data: prefData, updated_at: new Date().toISOString() },
      { onConflict: "user_id,pref_key" }
    );

  if (error) {
    console.error("[renewal-reminder] DB error:", error);
    return Response.json({ error: "Failed to save preference." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
