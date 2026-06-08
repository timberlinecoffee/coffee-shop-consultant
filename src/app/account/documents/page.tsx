// TIM-2434: Imported Documents settings page.
//
// Reads the user's most-recent plan, lists every document_imports session,
// and renders the Equipment-canon table with status chips per UX spec on
// TIM-2433. Empty state uses the off-white outline illustration per TIM-1579.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentsTable } from "@/components/account/DocumentsTable";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-[var(--foreground)]">
            Imported Documents
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Manage your imported files and re-run AI extraction if your
            documents change.
          </p>
        </div>
        <Link
          href="/dashboard?openImport=1"
          className="bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Import new document
        </Link>
      </div>

      {plan?.id ? (
        <DocumentsTable planId={plan.id} />
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            Create a plan first to start importing documents.
          </p>
        </div>
      )}
    </div>
  );
}
