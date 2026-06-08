// TIM-1942: Append a row to public.admin_audit_log.
// Writes are best-effort: if the log insert fails we log to console but do NOT
// throw, since the underlying admin action has already succeeded (or failed)
// on its own and we don't want a logging failure to mask the real result. The
// service-role client bypasses RLS so this is the only legitimate writer.

import { createServiceClient } from "@/lib/supabase/service";

export type AdminAuditEntry = {
  actor: { userId: string; email: string };
  target?: { userId?: string | null; email?: string | null };
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function recordAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from("admin_audit_log").insert({
      actor_user_id: entry.actor.userId,
      actor_email: entry.actor.email,
      target_user_id: entry.target?.userId ?? null,
      target_email: entry.target?.email ?? null,
      action: entry.action,
      before_state: entry.before ?? null,
      after_state: entry.after ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[admin-audit] failed to record", entry.action, err);
  }
}
