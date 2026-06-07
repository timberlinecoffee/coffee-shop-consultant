// TIM-2434: Document Import — credit estimate endpoint.
//
// POST { importId } — parses each uploaded file, persists page_count + the
// per-file file_type (may flip pdf→pdf_scan based on text-layer density), and
// returns the credit estimate the user confirms BEFORE the paid extraction
// turn runs.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import {
  estimateCredits,
  type EstimateFileInput,
} from "@/lib/document-import/credit-estimate";
import { parseDocument } from "@/lib/document-import/parsers";

export const runtime = "nodejs";
export const maxDuration = 90;

const BodySchema = z.object({
  importId: z.string().uuid(),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const user = auth.user;

  const rl = await enforceRateLimit({
    bucket: "document-import-estimate",
    id: user.id || ip,
    limit: 30,
    windowSec: 60,
  });
  if (rl) return rl;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // RLS already scopes to owner, but assert ownership at the boundary so a
  // failed RLS read is reported as 404 (not 500).
  const { data: session } = await supabase
    .from("document_imports")
    .select("id, user_id, plan_id")
    .eq("id", parsed.data.importId)
    .single();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: "Import not found." }, { status: 404 });
  }

  const { data: files } = await supabase
    .from("document_import_files")
    .select("id, storage_path, file_name, file_type, file_size_bytes")
    .eq("import_id", session.id);

  if (!files || files.length === 0) {
    return NextResponse.json(
      { error: "No files to estimate." },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const perFile: EstimateFileInput[] = [];

  for (const f of files) {
    const dl = await svc.storage
      .from("document-imports")
      .download(f.storage_path);
    if (dl.error || !dl.data) {
      await supabase
        .from("document_import_files")
        .update({ status: "error", error_code: "extraction_failed" })
        .eq("id", f.id);
      perFile.push({ fileType: "pdf", unitCount: 1 });
      continue;
    }
    const bytes = Buffer.from(await dl.data.arrayBuffer());
    const result = await parseDocument({
      bytes,
      fileName: f.file_name,
      mimeType: mimeFor(f.file_type),
    });
    perFile.push({ fileType: result.fileType, unitCount: result.unitCount });
    await supabase
      .from("document_import_files")
      .update({
        page_count: result.unitCount,
        file_type:
          result.fileType === "pdf_scan" ? "pdf" : result.fileType,
        status: result.errorCode ? "error" : "queued",
        error_code: result.errorCode ?? null,
      })
      .eq("id", f.id);
  }

  const estimate = estimateCredits(perFile);
  await supabase
    .from("document_imports")
    .update({
      status: "estimated",
      estimated_credits: estimate.total,
    })
    .eq("id", session.id);

  return NextResponse.json({
    importId: session.id,
    estimate: estimate.total,
    perFile: estimate.perFile,
  });
}

function mimeFor(t: string): string {
  switch (t) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
