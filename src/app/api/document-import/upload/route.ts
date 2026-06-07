// TIM-2434: Document Import — upload endpoint.
//
// Multipart POST. Up to 5 files per batch, 50 MB per file. Streams each file
// into the private 'document-imports' bucket under {user_id}/{import_id}/.
// Creates the parent document_imports row in status='uploading' and one
// document_import_files row per file in status='queued'.
//
// Rules:
//   Rule 2 — server-side ownership + plan_id check on every file.
//   Rule 3 — zod validates form fields; file type validated by detectFileType.
//   Rule 4 — enforceRateLimit() per user (paid path).
//   Rule 5 — errors land as { error, code? } on the route boundary.
//
// No paid API call here yet (just storage), but rate-limited because abuse
// would still pile up storage cost.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { detectFileType } from "@/lib/document-import/parsers";
import { isBetaWaived } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 5;

const MetaSchema = z.object({
  planId: z.string().uuid(),
  source: z.enum(["onboarding", "settings", "companion"]),
  label: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const user = auth.user;

  // Rule 4 — rate limit.
  const rl = await enforceRateLimit({
    bucket: "document-import-upload",
    id: user.id || ip,
    limit: 10,
    windowSec: 60,
  });
  if (rl) return rl;

  // Parse multipart.
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form." }, { status: 400 });
  }

  const meta = MetaSchema.safeParse({
    planId: formData.get("planId"),
    source: formData.get("source"),
    label: formData.get("label") || undefined,
  });
  if (!meta.success) {
    return NextResponse.json(
      { error: "Missing or invalid fields.", fields: meta.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Rule 2 — confirm plan ownership server-side.
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, user_id")
    .eq("id", meta.data.planId)
    .single();
  if (!plan || plan.user_id !== user.id) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  // Paid-tier gate — same shape as the copilot stream route. Beta-waived
  // accounts bypass.
  const { data: profile } = await supabase
    .from("users")
    .select(
      "ai_credits_remaining, subscription_tier, subscription_status, beta_waiver_until, trial_ends_at",
    )
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  const waived = isBetaWaived(profile.beta_waiver_until);
  const trialActive =
    profile.subscription_status === "free_trial" &&
    profile.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date();
  const paidActive =
    profile.subscription_status === "active" || trialActive || waived;
  if (!paidActive) {
    return NextResponse.json(
      { error: "Document import is available on Starter and Pro plans." },
      { status: 402 },
    );
  }

  const files = formData.getAll("file") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No files attached." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files per import.` },
      { status: 400 },
    );
  }

  // Pre-flight: reject any file that is too large or an unsupported type before
  // we create the session row, so the user sees the error inline.
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${f.name} is larger than 50 MB.`, code: "file_too_large" },
        { status: 400 },
      );
    }
    const type = detectFileType(f.type, f.name);
    if (!type) {
      return NextResponse.json(
        {
          error: `${f.name} format is not supported.`,
          code: "unsupported_format",
        },
        { status: 400 },
      );
    }
  }

  // Create the session row.
  const { data: session, error: sessionErr } = await supabase
    .from("document_imports")
    .insert({
      plan_id: meta.data.planId,
      user_id: user.id,
      source: meta.data.source,
      label: meta.data.label ?? null,
      status: "uploading",
    })
    .select("id")
    .single();
  if (sessionErr || !session) {
    return NextResponse.json(
      { error: "Could not start import session." },
      { status: 500 },
    );
  }

  // Service client for storage writes (per-user prefix RLS would also work,
  // but service client is simpler since we've already checked ownership).
  const svc = createServiceClient();
  const fileRows: Array<{
    id: string;
    file_name: string;
    file_type: string;
    file_size_bytes: number;
    status: string;
  }> = [];

  for (const f of files) {
    const type = detectFileType(f.type, f.name)!;
    const ext =
      type === "jpg"
        ? "jpg"
        : type === "png"
          ? "png"
          : type === "csv"
            ? "csv"
            : type === "xlsx"
              ? "xlsx"
              : type === "docx"
                ? "docx"
                : "pdf";
    const buf = Buffer.from(await f.arrayBuffer());
    // Build the row first so we can use the file id in the storage path.
    const { data: row, error: rowErr } = await supabase
      .from("document_import_files")
      .insert({
        import_id: session.id,
        storage_path: "", // backfilled below
        file_name: f.name,
        file_type: type,
        file_size_bytes: f.size,
        status: "queued",
      })
      .select("id")
      .single();
    if (rowErr || !row) {
      return NextResponse.json(
        { error: "Could not save file row." },
        { status: 500 },
      );
    }
    const path = `${user.id}/${session.id}/${row.id}.${ext}`;
    const { error: upErr } = await svc.storage
      .from("document-imports")
      .upload(path, buf, {
        contentType: f.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      return NextResponse.json(
        { error: "Could not upload file.", code: "upload_failed" },
        { status: 500 },
      );
    }
    await supabase
      .from("document_import_files")
      .update({ storage_path: path })
      .eq("id", row.id);
    fileRows.push({
      id: row.id,
      file_name: f.name,
      file_type: type,
      file_size_bytes: f.size,
      status: "queued",
    });
  }

  return NextResponse.json(
    { importId: session.id, files: fileRows },
    { status: 201 },
  );
}
