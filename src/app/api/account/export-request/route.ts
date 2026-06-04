// TIM-2254: POST /api/account/export-request
//
// Spec: TIM-2250 deletion-spec §1.
// Standing rules applied (TIM-2242 §1–5):
//   Rule 2 — JWT user check + RLS deny-by-default on account_export_requests.
//   Rule 3 — Input validation (no body required, but auth context is verified).
//   Rule 4 — Rate-limit 3 requests / user / 24h.
//   Rule 5 — Sanitised error responses; no stack traces.
//
// Runs synchronously: builds the JSON bundle, uploads to private bucket,
// signs a 24h URL, emails it. Returns 202 with the export row id.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  buildExportBundle,
  createSignedExportUrl,
  uploadExportBundle,
} from "@/lib/account-export";
import { sendExportReadyEmail } from "@/lib/email/send-account-email";
import { hashWithSalt } from "@/lib/account-deletion";

export const runtime = "nodejs";

function sanitised(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return sanitised(401, "Unauthorized");

  // Rule 4: rate-limit. 3 requests per 24h per user.
  const rl = await enforceRateLimit({
    bucket: "account-export",
    id: user.id,
    limit: 3,
    windowSec: 24 * 60 * 60,
  });
  if (rl) return rl;

  const svc = createServiceClient();

  // Insert pending row first so we always have a tracking record.
  const { data: row, error: insertErr } = await svc
    .from("account_export_requests")
    .insert({
      user_id: user.id,
      delivery_email: user.email ?? "unknown@invalid",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    console.error("[export-request] insert failed", insertErr);
    return sanitised(500, "Could not queue export. Try again later.");
  }

  // Audit: requested.
  await svc.from("account_deletion_audit_log").insert({
    action: "export_requested",
    user_hash: hashWithSalt(user.id),
    email_hash: hashWithSalt(user.email ?? ""),
    request_ip_hash: hashWithSalt(
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon",
    ),
  });

  // Build + upload + email synchronously. We catch broadly so any failure
  // marks the request row failed and returns a sanitised 500.
  try {
    const bundle = await buildExportBundle({
      userId: user.id,
      email: user.email ?? "",
    });
    const { storagePath, sizeBytes } = await uploadExportBundle({
      userId: user.id,
      bundle,
    });
    const { signedUrl, expiresAt } = await createSignedExportUrl({ storagePath });

    await svc
      .from("account_export_requests")
      .update({
        status: "ready",
        completed_at: new Date().toISOString(),
        storage_path: storagePath,
        expires_at: expiresAt,
        size_bytes: sizeBytes,
      })
      .eq("id", row.id);

    if (user.email) {
      await sendExportReadyEmail({
        to: user.email,
        signedUrl,
        expiresAt,
        sizeBytes,
      });
    }

    await svc.from("account_deletion_audit_log").insert({
      action: "export_completed",
      user_hash: hashWithSalt(user.id),
      email_hash: hashWithSalt(user.email ?? ""),
      data_summary: { size_bytes: sizeBytes },
    });

    return Response.json(
      { ok: true, id: row.id, status: "ready", expires_at: expiresAt },
      { status: 202 },
    );
  } catch (err) {
    console.error("[export-request] build/upload failed", err);
    await svc
      .from("account_export_requests")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      })
      .eq("id", row.id);
    await svc.from("account_deletion_audit_log").insert({
      action: "export_failed",
      user_hash: hashWithSalt(user.id),
      email_hash: hashWithSalt(user.email ?? ""),
      error_message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    });
    return sanitised(500, "Export failed. Try again or contact support.");
  }
}
