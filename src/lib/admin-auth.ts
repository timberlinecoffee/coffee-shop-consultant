// TIM-1179 / TIM-1942: Admin gate.
// Auth model: email allowlist via APP_ADMIN_EMAIL env var. Single source of
// truth used by every /api/admin/* route and the /admin pages.
//
// Two helpers:
//   requireAdmin()      — for API routes; returns a typed { ok, response } so
//                         the caller can early-return a 401/403/503 Response.
//   requireAdminPage()  — for server pages/layouts; calls notFound() to 404
//                         non-admins per TIM-1942 spec (don't reveal /admin
//                         exists). Returns { userId, email } when authorized.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  userId: string;
  email: string;
};

async function getAdminContext(): Promise<AdminContext | null> {
  const adminEmail = process.env.APP_ADMIN_EMAIL;
  if (!adminEmail) return null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  if (user.email.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return { userId: user.id, email: user.email };
}

export async function requireAdmin(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; response: Response }
> {
  const adminEmail = process.env.APP_ADMIN_EMAIL;
  if (!adminEmail) {
    return { ok: false, response: Response.json({ error: "Admin not configured" }, { status: 503 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    return { ok: false, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id, email: user.email! };
}

export async function requireAdminPage(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) notFound();
  return ctx;
}

// TIM-1958: CSRF defense-in-depth for state-changing admin routes.
// SameSite=Lax (set by @supabase/ssr) is the primary CSRF protection; this
// adds a second layer that: (a) enforces application/json Content-Type so
// cross-site plain-text form submissions are rejected before they reach the
// body parser, and (b) validates Origin against the site allowlist, failing
// closed when Origin is absent.
//
// Returns a 400/403/415 Response on rejection, or null when the request is
// acceptable. Call this BEFORE requireAdmin() in every non-GET admin handler.
export function assertAdminRequestSecurity(request: Request): Response | null {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Fail closed: legitimate admin UI always sends Origin on cross-origin
    // state-changing requests. Same-origin browser requests also include it.
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowedOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .filter(Boolean)
    .map((u) => u!.replace(/\/$/, "").toLowerCase());

  if (!allowedOrigins.includes(origin.toLowerCase())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
