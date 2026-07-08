// TIM-3694: ui_revamp_v3 preference API.
// PATCH /api/account/ui-revamp-v3 — { enabled: boolean } updates the mirror
// cookie so SSR renders v3 or v1 without a DB round-trip.
//
// No DB column for v3 (cookie-only opt-out sufficient for default-ON flag).
//
// Standing Engineering Rules applied:
// Rule 2 — server-side auth re-check on every request.
// Rule 3 — manual validation on the PATCH body.
// Rule 5 — no raw errors to the client.

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UI_REVAMP_V3_COOKIE, resolveUiRevampV3 } from "@/lib/ui-revamp-v3";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const enabled = resolveUiRevampV3({
    mirrorCookie: cookieStore.get(UI_REVAMP_V3_COOKIE)?.value,
  });

  return Response.json({ data: { enabled } });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return Response.json(
      { error: "enabled must be a boolean" },
      { status: 400 }
    );
  }

  const enabled = body.enabled;

  const cookieStore = await cookies();
  cookieStore.set(UI_REVAMP_V3_COOKIE, enabled ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  return Response.json({ data: { enabled } });
}
