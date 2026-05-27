// TIM-1179: Admin/CTO-only gate for API routes.
// Checks the authenticated user's email against APP_ADMIN_EMAIL env var.

import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
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
  return { ok: true, userId: user.id };
}
