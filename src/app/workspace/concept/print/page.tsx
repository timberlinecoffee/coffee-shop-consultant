// TIM-865: Concept brief — rich document rendering.
// LivePlan-style printable consulting deliverable with card layout,
// typographic hierarchy, and teal/sage brand palette.
// Server-rendered — no nav, no bottom tab bar, no AI panel.
// Renders only included + filled components in narrative order.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CONCEPT_COMPONENTS_V2,
  normalizeConceptV2,
  type ConceptDocumentV2,
  type ConceptComponentId,
  type CustomerPersona,
  PERSONA_VALUE_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
} from "@/lib/concept";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// Sections that get featured card treatment (full-width, larger text)
const FEATURED_IDS: ReadonlySet<ConceptComponentId> = new Set(["vision"]);

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

  const personas = conceptDoc.personas ?? [];

  const sections = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = conceptDoc.components[meta.id];
    if (!comp.included) return false;
    if (meta.id === "target_customer") {
      return personas.length > 0 || comp.content.trim().length > 0;
    }
    return comp.content.trim().length > 0;
  });

  // Shop identity is the document title — exclude from body sections
  const bodySections = sections.filter((s) => s.id !== "shop_identity");

  const shopName =
    conceptDoc.components.shop_identity.content.trim() || "Your shop";
  const sectionCount = bodySections.length;
  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      {/* Print media stylesheet — preserves rich layout on Cmd+P */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 1.8cm 2cm; size: A4; }
              .section-card { break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[#efefef] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/concept"
          className="text-sm text-[#155e63] font-medium hover:underline flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span> Back to editing
        </Link>
        <PrintButton />
      </div>

      {/* Document — constrained width on screen, full-bleed on print */}
      <div className="max-w-[680px] mx-auto px-8 pt-14 pb-20">

        {/* ── Cover header ─────────────────────────────── */}
        <header className="mb-12">
          {/* Teal rule */}
          <div className="h-[3px] bg-[#155e63] mb-8 rounded-full" />

          {/* Document type label */}
          <p
            className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#155e63] mb-3"
          >
            Concept Brief
          </p>

          {/* Shop name */}
          <h1
            className="font-bold text-[#1a1a1a] leading-tight mb-4"
            style={{ fontSize: "38px", letterSpacing: "-0.01em" }}
          >
            {shopName}
          </h1>

          {/* Meta row */}
          <p className="text-xs text-[#afafaf] tracking-wide">
            {printDate}
            {sectionCount > 0 && (
              <>
                {" · "}
                {sectionCount} section{sectionCount !== 1 ? "s" : ""}
              </>
            )}
            {" · "}
            Prepared with Timberline Coffee School
          </p>

          {/* Divider below header */}
          <div className="mt-8 border-t border-[#efefef]" />
        </header>

        {/* ── Body sections ────────────────────────────── */}
        {bodySections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#d4d4d4] px-6 py-10 text-center">
            <p className="text-sm text-[#afafaf] mb-3">
              No sections are filled in yet.
            </p>
            <Link
              href="/workspace/concept"
              className="text-sm font-medium text-[#155e63] hover:underline"
            >
              Go back to add content
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            {bodySections.map((meta) => {
              const comp = conceptDoc.components[meta.id];
              const isFeatured = FEATURED_IDS.has(meta.id);

              if (meta.id === "target_customer" && personas.length > 0) {
                return (
                  <PersonasPrintBlock
                    key={meta.id}
                    label={meta.label}
                    personas={personas}
                  />
                );
              }

              if (isFeatured) {
                return (
                  <div
                    key={meta.id}
                    className="section-card rounded-2xl bg-[#f4f9f8] border border-[#d5eae8] px-7 py-6"
                  >
                    <p
                      className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-3"
                    >
                      {meta.label}
                    </p>
                    <p
                      className="text-[#1a1a1a] font-medium leading-[1.8]"
                      style={{ fontSize: "16px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                );
              }

              return (
                <div
                  key={meta.id}
                  className="section-card bg-white border border-[#efefef] rounded-2xl overflow-hidden flex"
                >
                  {/* Left teal accent bar */}
                  <div className="w-1 bg-[#155e63] flex-shrink-0" />

                  <div className="px-6 py-5 flex-1 min-w-0">
                    <p
                      className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-2.5"
                    >
                      {meta.label}
                    </p>
                    <p
                      className="text-[#1a1a1a] leading-[1.75]"
                      style={{ fontSize: "14.5px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────── */}
        <footer className="mt-16 pt-6 border-t border-[#efefef] flex items-center justify-between">
          <span className="text-xs text-[#afafaf]">
            {shopName} &middot; Concept Brief &middot; {year}
          </span>
          <span className="text-xs text-[#afafaf]">Timberline Coffee School</span>
        </footer>
      </div>
    </div>
  );
}

function PersonasPrintBlock({
  label,
  personas,
}: {
  label: string;
  personas: CustomerPersona[];
}) {
  if (personas.length === 1) {
    const p = personas[0];
    const habitParts = [
      p.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] : null,
      p.spendPerVisit ? PERSONA_SPEND_LABELS[p.spendPerVisit] + " per visit" : null,
    ].filter(Boolean);
    const body = [
      p.whyTheyVisit.trim(),
      p.painPoints?.trim(),
      habitParts.length > 0 ? habitParts.join(", ") : null,
      p.notes?.trim(),
    ]
      .filter(Boolean)
      .join(". ");

    return (
      <div className="section-card bg-white border border-[#efefef] rounded-2xl overflow-hidden flex">
        <div className="w-1 bg-[#155e63] flex-shrink-0" />
        <div className="px-6 py-5 flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-2.5">
            {label}
          </p>
          <p className="text-sm font-semibold text-[#1a1a1a] mb-1">{p.name}</p>
          {body && (
            <p className="text-[#1a1a1a] leading-[1.75]" style={{ fontSize: "14.5px" }}>
              {body}
            </p>
          )}
          {p.values && p.values.length > 0 && (
            <p className="mt-1.5 text-xs text-[#6b6b6b]">
              Values: {p.values.map((v) => PERSONA_VALUE_LABELS[v]).join(", ")}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Multiple personas — block layout
  return (
    <div className="section-card bg-white border border-[#efefef] rounded-2xl overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-[#155e63] flex-shrink-0" />
        <div className="px-6 pt-5 pb-1 flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-4">
            {label}
          </p>
          <div className="space-y-4 pb-5">
            {personas.map((p) => {
              const habitParts = [
                p.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] : null,
                p.spendPerVisit ? PERSONA_SPEND_LABELS[p.spendPerVisit] + " per visit" : null,
              ].filter(Boolean);
              return (
                <div key={p.id} className="border-t border-[#efefef] pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{p.name}</p>
                    {p.isPrimary && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[#155e63] border border-[#cfe0e1] rounded-full px-1.5 py-0.5 leading-none">
                        Primary
                      </span>
                    )}
                  </div>
                  {p.whyTheyVisit.trim() && (
                    <p className="text-sm text-[#1a1a1a] leading-relaxed mb-1">
                      {p.whyTheyVisit.trim()}
                    </p>
                  )}
                  {(habitParts.length > 0 || (p.values && p.values.length > 0)) && (
                    <p className="text-xs text-[#6b6b6b]">
                      {[
                        habitParts.length > 0 ? habitParts.join(", ") : null,
                        p.values && p.values.length > 0
                          ? p.values.map((v) => PERSONA_VALUE_LABELS[v]).join(", ")
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
