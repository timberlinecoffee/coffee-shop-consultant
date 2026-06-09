// TIM-2589: ui_revamp_v2 preference API.
// GET  /api/account/ui-revamp  — current effective setting.
// PATCH /api/account/ui-revamp — { enabled: boolean } updates DB + mirror cookie.
//
// Standing Engineering Rules applied:
// Rule 2 — server-side auth re-check on every request.
// Rule 3 — zod-style manual validation on the PATCH body.
// Rule 5 — no raw errors to the client.

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  UI_REVAMP_COOKIE,
  UI_REVAMP_OVERRIDE_COOKIE,
  getUiRevampSetting,
  resolveUiRevamp,
} from "@/lib/ui-revamp";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const dbValue = await getUiRevampSetting(supabase, user.id);
  const enabled = resolveUiRevamp({
    dbValue,
    overrideCookie: cookieStore.get(UI_REVAMP_OVERRIDE_COOKIE)?.value,
    mirrorCookie: cookieStore.get(UI_REVAMP_COOKIE)?.value,
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

  const { error } = await supabase
    .from("users")
    .update({ ui_revamp_v2: enabled, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return Response.json({ error: "Could not save preference" }, { status: 500 });

  // Mirror to session cookie so the next SSR render picks it up without a
  // DB round-trip. Use a long-lived persistent cookie (1 year) so it survives
  // tab closes; the DB is the authoritative source on login.
  const cookieStore = await cookies();
  cookieStore.set(UI_REVAMP_COOKIE, enabled ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  return Response.json({ data: { enabled } });
}
