// TIM-1942: CSV export of the member list.
// TIM-1957: csvEscape moved to src/lib/csv.ts to neutralize formula injection.

import { requireAdmin } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { csvEscape } from "@/lib/csv";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const svc = createServiceClient();
  const { data: profiles, error } = await svc
    .from("users")
    .select("id, email, full_name, subscription_status, subscription_tier, trial_ends_at, ai_credits_remaining, signup_source, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: "Failed to load members" }, { status: 500 });

  const header = [
    "id",
    "email",
    "full_name",
    "subscription_status",
    "subscription_tier",
    "trial_ends_at",
    "ai_credits_remaining",
    "signup_source",
    "created_at",
  ];
  const lines = [header.join(",")];
  for (const p of profiles ?? []) {
    lines.push(
      header
        .map((h) => csvEscape((p as Record<string, unknown>)[h]))
        .join(","),
    );
  }
  const csv = lines.join("\n") + "\n";

  const filename = `groundwork-members-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
