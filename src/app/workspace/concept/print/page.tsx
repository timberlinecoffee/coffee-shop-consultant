// TIM-834: Concept document print route.
// Server-rendered — no nav, no bottom tab bar, no AI panel.
// Renders only included + filled components in narrative order.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CONCEPT_COMPONENTS_V2,
  normalizeConceptV2,
  type ConceptDocumentV2,
} from "@/lib/concept";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function ConceptPrintPage() {
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

  if (!plan) redirect("/onboarding");

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "concept")
    .maybeSingle();

  const conceptDoc: ConceptDocumentV2 = normalizeConceptV2(doc?.content);

  const sections = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = conceptDoc.components[meta.id];
    return comp.included && comp.content.trim().length > 0;
  });

  const shopName = conceptDoc.components.shop_identity.content.trim() || "Your shop";
  const sectionCount = sections.length;
  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      {/* Print-only media stylesheet */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; }
              @page { margin: 1.5cm; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print bg-[#faf9f7] border-b border-[#efefef] px-6 py-4 flex items-center justify-between">
        <Link
          href="/workspace/concept"
          className="text-sm text-[#155e63] font-medium hover:underline"
        >
          &larr; Back to editing
        </Link>
        <PrintButton />
      </div>

      {/* Document content */}
      <div className="max-w-2xl mx-auto px-8 py-12">
        {/* Teal rule */}
        <div className="h-1 bg-[#155e63] rounded mb-8" />

        {/* Shop name */}
        <h1
          className="font-bold text-[#1a1a1a] mb-2"
          style={{ fontSize: "32px", lineHeight: "1.2" }}
        >
          {shopName}
        </h1>

        {/* Meta row */}
        <p className="text-xs text-[#afafaf] mb-10 tracking-wide">
          {printDate} &middot; {sectionCount} section{sectionCount !== 1 ? "s" : ""} &middot; Prepared with Timberline Coffee School
        </p>

        {/* Sections */}
        {sections.length === 0 ? (
          <p className="text-sm text-[#afafaf] italic">
            No sections are filled in yet.{" "}
            <Link href="/workspace/concept" className="text-[#155e63] underline">
              Go back to add content
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-8">
            {sections.map((meta) => {
              const comp = conceptDoc.components[meta.id];
              return (
                <div key={meta.id}>
                  <p
                    className="text-xs font-semibold uppercase text-[#155e63] mb-2"
                    style={{ letterSpacing: "0.12em" }}
                  >
                    {meta.label}
                  </p>
                  <p
                    className="text-[#1a1a1a]"
                    style={{ fontSize: "14px", lineHeight: "1.7" }}
                  >
                    {comp.content.trim()}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-[#efefef] flex items-center justify-between text-xs text-[#afafaf]">
          <span>
            {shopName} &middot; Concept &middot; {year}
          </span>
          <span>Prepared with Timberline</span>
        </div>
      </div>
    </div>
  );
}
