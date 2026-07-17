// TIM-3953: Hiring & Onboarding v3 revert preference API.
// PATCH /api/account/hiring-revamp-v3 — { enabled: boolean } sets the
// gw_hiring_revamp_v3_override cookie so SSR can revert to v1 without a
// DB column.
//
// Standing Engineering Rules applied:
// Rule 2 — server-side auth re-check.
// Rule 3 — manual body validation.
// Rule 5 — no raw errors to the client.

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HIRING_REVAMP_V3_OVERRIDE_COOKIE } from "@/lib/hiring-revamp-v3";

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
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(HIRING_REVAMP_V3_OVERRIDE_COOKIE, body.enabled ? "true" : "false", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });

  return Response.json({ data: { enabled: body.enabled } });
}
