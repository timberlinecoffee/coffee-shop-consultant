// TIM-1942: Trigger a password-reset email for a member via Supabase admin.
// Uses generateLink type=recovery + lets the auth server send the email. The
// reset link follows the normal token-expiration policy configured on the
// auth project (default 1h), not a custom long-lived link.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const svc = createServiceClient();

  const { data: profile } = await svc
    .from("users")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();
  if (!profile?.email) return Response.json({ error: "Member not found" }, { status: 404 });

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://coffee-shop-consultant.vercel.app";

  try {
    const { error } = await svc.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: { redirectTo: `${siteUrl}/reset-password` },
    });
    if (error) {
      return Response.json({ error: `Supabase: ${error.message}` }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth error";
    return Response.json({ error: `Reset link failed: ${message}` }, { status: 502 });
  }

  await recordAdminAction({
    actor: { userId: auth.userId, email: auth.email },
    target: { userId: id, email: profile.email },
    action: "password_reset",
    metadata: { delivery: "supabase_auth_email", redirect_to: `${siteUrl}/reset-password` },
  });

  return Response.json({ ok: true, sentTo: profile.email });
}
