// TIM-1942: Admin support inbox (reads TIM-1941 support_messages table).

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminSupportMessage } from "@/types/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("support_messages")
    .select("id, created_at, name, email, subject, message, page_url, user_id, status, handled_at, internal_notes")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ error: "Failed to load messages" }, { status: 500 });
  return Response.json((data ?? []) as AdminSupportMessage[]);
}
