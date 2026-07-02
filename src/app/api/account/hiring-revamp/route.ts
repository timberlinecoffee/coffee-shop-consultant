// TIM-3369: Hiring & Onboarding IA revamp preference API.
// GET  /api/account/hiring-revamp  — current effective setting.
// PATCH /api/account/hiring-revamp — { enabled: boolean } updates DB + mirror cookie.
//
// Standing Engineering Rules applied:
// Rule 2 — server-side auth re-check on every request.
// Rule 3 — manual zod-equivalent body validation.
// Rule 5 — no raw errors leak to the client.

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  HIRING_REVAMP_COOKIE,
  HIRING_REVAMP_OVERRIDE_COOKIE,
  getHiringRevampSetting,
  resolveHiringRevamp,
} from "@/lib/hiring-revamp";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  const dbValue = await getHiringRevampSetting(supabase, user.id);
  const enabled = resolveHiringRevamp({
    dbValue,
    overrideCookie: cookieStore.get(HIRING_REVAMP_OVERRIDE_COOKIE)?.value,
    mirrorCookie: cookieStore.get(HIRING_REVAMP_COOKIE)?.value,
  });

  return Response.json({ data: { enabled } });
}

export async function PATCH(request: Request) {
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
    .update({ hiring_revamp_v2: enabled, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error)
    return Response.json(
      { error: "Could not save preference" },
      { status: 500 }
    );

  const cookieStore = await cookies();
  cookieStore.set(HIRING_REVAMP_COOKIE, enabled ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  return Response.json({ data: { enabled } });
}
