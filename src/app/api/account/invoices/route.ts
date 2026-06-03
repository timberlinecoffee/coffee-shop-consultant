// TIM-1912: GET /api/account/invoices — list invoices for the authenticated user.
// RLS on the invoices table restricts rows to auth.uid() = user_id.

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, amount_total_cents, currency, description, invoice_date, pdf_storage_path"
    )
    .order("invoice_date", { ascending: false });

  if (error) {
    console.error("[GET /api/account/invoices]", error);
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }

  return NextResponse.json({ invoices: data ?? [] });
}
