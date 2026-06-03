// TIM-1942: Read-only audit log for the admin portal.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminAuditRow } from "@/types/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("admin_audit_log")
    .select("id, created_at, actor_email, target_email, action, before_state, after_state, metadata")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ error: "Failed to load audit log" }, { status: 500 });
  return Response.json((data ?? []) as AdminAuditRow[]);
}
