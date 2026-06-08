// TIM-2434: Document Import — single session read + delete.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  routeExtractedChanges,
  type ExtractedChange,
} from "@/lib/document-import/suite-routing";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const params = await ctx.params;
  const p = ParamsSchema.safeParse(params);
  if (!p.success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("document_imports")
    .select(
      "id, plan_id, label, status, source, estimated_credits, credits_charged, error_code, created_at",
    )
    .eq("id", p.data.id)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: files } = await supabase
    .from("document_import_files")
    .select(
      "id, file_name, file_type, file_size_bytes, status, error_code, page_count, extracted_json, credits_charged",
    )
    .eq("import_id", session.id)
    .order("created_at");

  const allChanges: ExtractedChange[] = [];
  for (const f of files ?? []) {
    const proposals =
      ((f.extracted_json as {
        proposedChanges?: ExtractedChange[];
      })?.proposedChanges ?? []);
    for (const c of proposals) {
      allChanges.push({ ...c, sourceFileName: f.file_name });
    }
  }
  const suggestions = routeExtractedChanges({
    changes: allChanges,
    idPrefix: `imp_${session.id.slice(0, 8)}`,
  });

  return NextResponse.json({
    session,
    files: files ?? [],
    proposedChanges: allChanges,
    suggestions,
  });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const params = await ctx.params;
  const p = ParamsSchema.safeParse(params);
  if (!p.success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("document_imports")
    .select("id, user_id")
    .eq("id", p.data.id)
    .single();
  if (!session || session.user_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Tear down storage objects too.
  const svc = createServiceClient();
  const { data: files } = await supabase
    .from("document_import_files")
    .select("storage_path")
    .eq("import_id", session.id);
  const paths = (files ?? []).map((f) => f.storage_path).filter(Boolean);
  if (paths.length > 0) {
    await svc.storage.from("document-imports").remove(paths);
  }

  await supabase.from("document_imports").delete().eq("id", session.id);
  return NextResponse.json({ ok: true });
}
