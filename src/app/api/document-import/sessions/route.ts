// TIM-2434: Document Import — list sessions for the current user/plan.
// Used by the Settings → Documents table to render the import history.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const QuerySchema = z.object({ planId: z.string().uuid() });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = QuerySchema.safeParse({ planId: url.searchParams.get("planId") });
  if (!q.success) {
    return NextResponse.json({ error: "Missing planId." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS scopes ownership; the join here just adds the file rollup.
  const { data: sessions } = await supabase
    .from("document_imports")
    .select(
      "id, label, status, source, estimated_credits, credits_charged, created_at, updated_at",
    )
    .eq("plan_id", q.data.planId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!sessions) return NextResponse.json({ sessions: [] });

  // Attach a per-session file rollup (count + suites touched).
  const ids = sessions.map((s) => s.id);
  const fileRollup: Record<
    string,
    { fileCount: number; suites: Set<string> }
  > = {};
  if (ids.length > 0) {
    const { data: files } = await supabase
      .from("document_import_files")
      .select("id, import_id, file_name, extracted_json")
      .in("import_id", ids);
    for (const f of files ?? []) {
      const r = (fileRollup[f.import_id] ??= {
        fileCount: 0,
        suites: new Set<string>(),
      });
      r.fileCount += 1;
      const proposals = (
        (f.extracted_json as { proposedChanges?: Array<{ suite: string }> })
          ?.proposedChanges ?? []
      );
      for (const p of proposals) r.suites.add(p.suite);
    }
  }

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      file_count: fileRollup[s.id]?.fileCount ?? 0,
      suites: Array.from(fileRollup[s.id]?.suites ?? []),
    })),
  });
}
