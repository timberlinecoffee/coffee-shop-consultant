// TIM-1942: Update a support message's status (new → open → closed → spam).

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { recordAdminAction } from "@/lib/admin-audit";

const ALLOWED_STATUS = new Set(["new", "open", "closed", "spam"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  let body: { status?: string; internal_notes?: string };
  try {
    body = (await request.json()) as { status?: string; internal_notes?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status) {
    if (!ALLOWED_STATUS.has(body.status)) {
      return Response.json({ error: "status must be new|open|closed|spam" }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status !== "new") {
      updates.handled_at = new Date().toISOString();
      updates.handled_by = auth.userId;
    }
  }
  if (typeof body.internal_notes === "string") {
    updates.internal_notes = body.internal_notes.slice(0, 4000);
  }
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: before } = await svc
    .from("support_messages")
    .select("id, email, status, internal_notes")
    .eq("id", id)
    .maybeSingle();
  if (!before) return Response.json({ error: "Message not found" }, { status: 404 });

  const { data: after, error } = await svc
    .from("support_messages")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: "Failed to update message" }, { status: 500 });

  await recordAdminAction({
    actor: { userId: auth.userId, email: auth.email },
    target: { email: before.email ?? null },
    action: "support_message_update",
    before: { status: before.status, internal_notes: before.internal_notes },
    after: updates,
    metadata: { message_id: id },
  });

  return Response.json(after);
}
