// TIM-3152: account owner name update endpoint.
// PATCH /api/account/profile — update full_name in users table + auth metadata.

import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("fullName" in body)) {
    return Response.json({ error: "fullName is required" }, { status: 400 });
  }

  const raw = (body as Record<string, unknown>).fullName;
  if (typeof raw !== "string") {
    return Response.json({ error: "fullName must be a string" }, { status: 400 });
  }

  const fullName = raw.trim();
  if (fullName.length === 0) {
    return Response.json({ error: "Name cannot be empty" }, { status: 422 });
  }
  if (fullName.length > 80) {
    return Response.json(
      { error: "Name must be 80 characters or fewer" },
      { status: 422 }
    );
  }

  const { error: dbError } = await supabase
    .from("users")
    .update({ full_name: fullName, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (dbError) {
    console.error("[profile] db update failed:", dbError.message);
    return Response.json({ error: "Could not update name" }, { status: 500 });
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: fullName },
  });

  if (authError) {
    // Non-fatal: DB already updated. Auth metadata sync is best-effort.
    console.error("[profile] auth metadata sync failed:", authError.message);
  }

  return Response.json({ data: { fullName } });
}
