// TIM-1912: GET /api/account/invoices/[id]/download — 302 → 1-hour signed URL.
// Double-checks auth.uid() === invoice.user_id even though RLS already enforces it.

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the invoice row — RLS restricts to the authenticated user's rows.
  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices")
    .select("id, user_id, pdf_storage_path")
    .eq("id", id)
    .single();

  if (fetchErr || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  // Belt-and-suspenders: explicit owner check in addition to RLS.
  if (invoice.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!invoice.pdf_storage_path) {
    return NextResponse.json({ error: "PDF not yet generated" }, { status: 404 });
  }

  // Use service-role client to generate the signed URL (private bucket).
  const serviceSupabase = createServiceClient();
  const { data: signedData, error: signErr } = await serviceSupabase.storage
    .from("invoices")
    .createSignedUrl(invoice.pdf_storage_path, 3600); // 1-hour TTL

  if (signErr || !signedData?.signedUrl) {
    console.error("[download] Signed URL failed:", signErr);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }

  return NextResponse.redirect(signedData.signedUrl, 302);
}
