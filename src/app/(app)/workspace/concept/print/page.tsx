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
  type ConceptCompetitor,
  type CustomerPersona,
  PERSONA_VALUE_LABELS,
  PERSONA_VISIT_FREQUENCY_LABELS,
  PERSONA_SPEND_LABELS,
} from "@/lib/concept";
import {
  VENDOR_CATEGORY_KEYS,
  VENDOR_CATEGORY_LABELS,
  isSeededCategoryKey,
  type VendorCategoryId,
  type VendorCategoryKey,
  type VendorCustomCategory,
  type VendorDecision,
} from "@/lib/suppliers";
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

  const [{ data: doc }, { data: decisionsData }, { data: customCatsData }] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("vendor_decisions")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("is_current", true)
      .order("category", { ascending: true }),
    supabase
      .from("vendor_custom_categories")
      .select("*")
      .eq("plan_id", plan.id)
      .order("position", { ascending: true }),
  ]);

  const supplierDecisions = (decisionsData ?? []) as VendorDecision[];
  const decisionsByCategory = new Map<VendorCategoryId, VendorDecision>();
  for (const d of supplierDecisions) {
    decisionsByCategory.set(d.category, d);
  }
  // TIM-1414: custom categories appear in the concept brief alongside seeded ones.
  const customCats = (customCatsData ?? []) as VendorCustomCategory[];
  const customCatLabelByKey = new Map<string, string>(
    customCats.map((c) => [c.key, c.label])
  );

  const conceptDoc: ConceptDocumentV2 = normalizeConceptV2(doc?.content);

  const personas = conceptDoc.personas ?? [];
  // TIM-3562: competitors are a filled concept section — render them in the
  // brief when the user either named specific shops or explicitly declared
  // "no direct competitors identified".
  const competitors = conceptDoc.competitors ?? [];
  const noDirectCompetitors = conceptDoc.no_direct_competitors_identified === true;
  const hasCompetitorsSection = competitors.length > 0 || noDirectCompetitors;

  // TIM-2859: content presence is the single signal for inclusion in the print
  // brief. The `included` flag is preserved on the wire (no schema change) but
  // ignored at read time — empty fields are implicitly skipped.
  const sections = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = conceptDoc.components[meta.id];
    if (meta.id === "target_customer") {
      return personas.length > 0 || comp.content.trim().length > 0;
    }
    return comp.content.trim().length > 0;
  });

  // Shop identity is the document title — exclude from body sections
  const bodySections = sections.filter((s) => s.id !== "shop_identity");

  const shopName =
    conceptDoc.components.shop_identity.content.trim() || "Your shop";
  // TIM-3562: header section count now reflects competitors when present.
  const sectionCount = bodySections.length + (hasCompetitorsSection ? 1 : 0);
  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      {/* TIM-2784: hide workspace chrome (sidebar + topbar) so this route
          renders as a content-only document on screen and in print.
          Targets both v1 AppSidebar and v2 SidebarV2 by aria-label.
          Pattern mirrors business-plan/print (TIM-2333). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            aside[aria-label="Workspace navigation"],
            nav[aria-label="Workspace navigation"],
            aside[aria-label="Main navigation"],
            nav[aria-label="Main navigation"] { display: none !important; }
            @media (min-width: 1024px) {
              div.flex.min-h-screen > div.flex-1 { padding-left: 0 !important; }
            }
            /* TIM-3641: @page owns paper margins; screen container padding
               (pt-14 pb-20 px-8) is reset for print so the document uses the
               page efficiently. Break rules keep uppercase section labels
               with their body text and prevent orphan/widow lines. */
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 14mm 16mm; size: A4; }
              .print-doc { padding: 0 !important; max-width: 100% !important; }
              .print-header { margin-bottom: 6mm !important; }
              .print-header-divider { margin-top: 4mm !important; }
              .print-stack > * + * { margin-top: 4mm !important; }
              .section-card { break-inside: avoid; page-break-inside: avoid; orphans: 3; widows: 3; }
              .featured-card { padding: 5mm 7mm !important; }
              .section-label { break-after: avoid; page-break-after: avoid; }
              h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
              p { orphans: 3; widows: 3; }
              .print-footer { margin-top: 8mm !important; padding-top: 3mm !important; break-inside: avoid; page-break-inside: avoid; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/concept"
          className="text-sm text-[var(--teal)] font-medium hover:underline flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span> Back to editing
        </Link>
        <PrintButton />
      </div>

      {/* Document — constrained width on screen, full-bleed on print */}
      <div className="print-doc max-w-[680px] mx-auto px-8 pt-14 pb-20">

        {/* ── Cover header ─────────────────────────────── */}
        <header className="print-header mb-12">
          {/* Teal rule */}
          <div className="h-[3px] bg-[var(--teal)] mb-8 rounded-full" />

          {/* Document type label */}
          <p
            className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--teal)] mb-3"
          >
            Concept Brief
          </p>

          {/* Shop name */}
          <h1
            className="font-bold text-[var(--foreground)] leading-tight mb-4"
            style={{ fontSize: "38px", letterSpacing: "-0.01em" }}
          >
            {shopName}
          </h1>

          {/* Meta row */}
          <p className="text-xs text-[var(--dark-grey)] tracking-wide">
            {printDate}
            {sectionCount > 0 && (
              <>
                {" · "}
                {sectionCount} section{sectionCount !== 1 ? "s" : ""}
              </>
            )}
          </p>

          {/* Divider below header */}
          <div className="print-header-divider mt-8 border-t border-[var(--border)]" />
        </header>

        {/* ── Body sections ────────────────────────────── */}
        {bodySections.length === 0 && !hasCompetitorsSection ? (
          <div className="rounded-2xl border border-dashed border-[var(--gray-700)] px-6 py-10 text-center">
            <p className="text-sm text-[var(--dark-grey)] mb-3">
              No sections are filled in yet.
            </p>
            <Link
              href="/workspace/concept"
              className="text-sm font-medium text-[var(--teal)] hover:underline"
            >
              Go back to add content
            </Link>
          </div>
        ) : (
          <div className="print-stack space-y-5">
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
                    className="section-card featured-card rounded-2xl bg-[var(--teal-tint-500)] border border-[var(--teal-tint-300)] px-7 py-6"
                  >
                    <p
                      className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-3"
                    >
                      {meta.label}
                    </p>
                    <p
                      className="text-[var(--foreground)] font-medium leading-[1.8]"
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
                  className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden flex"
                >
                  {/* Left teal accent bar */}
                  <div className="w-1 bg-[var(--teal)] flex-shrink-0" />

                  <div className="px-6 py-5 flex-1 min-w-0">
                    <p
                      className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-2.5"
                    >
                      {meta.label}
                    </p>
                    <p
                      className="text-[var(--foreground)] leading-[1.75]"
                      style={{ fontSize: "14.5px" }}
                    >
                      {comp.content.trim()}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* TIM-3562: Nearby competitors — mirrors the CompetitorSection
                on the concept editor page. Renders when the user has either
                named specific shops OR explicitly declared no direct
                competitors in their catchment. */}
            {hasCompetitorsSection && (
              <CompetitorsPrintBlock
                competitors={competitors}
                noDirectCompetitors={noDirectCompetitors}
              />
            )}
          </div>
        )}

        {/* ── Suppliers locked in ──────────────────────── */}
        {supplierDecisions.length > 0 && (
          <div className="section-card mt-5 bg-white border border-[var(--border)] rounded-2xl overflow-hidden flex">
            <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
            <div className="px-6 py-5 flex-1 min-w-0">
              <p className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-3">
                Suppliers Locked In
              </p>
              <ul className="space-y-2.5">
                {[
                  ...VENDOR_CATEGORY_KEYS.map((k) => k as VendorCategoryId),
                  ...customCats.map((c) => c.key as VendorCategoryId),
                ].map((key) => {
                  const decision = decisionsByCategory.get(key);
                  if (!decision) return null;
                  const label = isSeededCategoryKey(key)
                    ? VENDOR_CATEGORY_LABELS[key as VendorCategoryKey]
                    : customCatLabelByKey.get(key) ?? "Custom category";
                  return (
                    <li key={key} className="text-[var(--foreground)]" style={{ fontSize: "14.5px", lineHeight: 1.6 }}>
                      <span className="font-semibold">{label}:</span>{" "}
                      {decision.vendor_name}
                      <span className="text-[var(--dark-grey)] text-xs">
                        {" "}
                        · {new Date(decision.decided_on).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {decision.reason && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                          {decision.reason}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────── */}
        <footer className="print-footer mt-16 pt-6 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--dark-grey)]">
            {shopName} &middot; Concept Brief &middot; {year}
          </span>
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
      <div className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden flex">
        <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
        <div className="px-6 py-5 flex-1 min-w-0">
          <p className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-2.5">
            {label}
          </p>
          <p className="text-sm font-semibold text-[var(--foreground)] mb-1">{p.name}</p>
          {body && (
            <p className="text-[var(--foreground)] leading-[1.75]" style={{ fontSize: "14.5px" }}>
              {body}
            </p>
          )}
          {p.values && p.values.length > 0 && (
            <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
              Values: {p.values.map((v) => PERSONA_VALUE_LABELS[v]).join(", ")}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Multiple personas — block layout
  return (
    <div className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
        <div className="px-6 pt-5 pb-1 flex-1 min-w-0">
          <p className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-4">
            {label}
          </p>
          <div className="space-y-4 pb-5">
            {personas.map((p) => {
              const habitParts = [
                p.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] : null,
                p.spendPerVisit ? PERSONA_SPEND_LABELS[p.spendPerVisit] + " per visit" : null,
              ].filter(Boolean);
              return (
                <div key={p.id} className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{p.name}</p>
                    {p.isPrimary && (
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-1.5 py-0.5 leading-none">
                        Primary
                      </span>
                    )}
                  </div>
                  {p.whyTheyVisit.trim() && (
                    <p className="text-sm text-[var(--foreground)] leading-relaxed mb-1">
                      {p.whyTheyVisit.trim()}
                    </p>
                  )}
                  {(habitParts.length > 0 || (p.values && p.values.length > 0)) && (
                    <p className="text-xs text-[var(--muted-foreground)]">
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

// TIM-3562: Nearby competitors block — mirrors the CompetitorSection editor
// on the concept workspace. Layout follows PersonasPrintBlock's multi-item
// pattern (teal accent bar + uppercase label + divider-separated rows).
function CompetitorsPrintBlock({
  competitors,
  noDirectCompetitors,
}: {
  competitors: ConceptCompetitor[];
  noDirectCompetitors: boolean;
}) {
  // Sentence-case label mirrors the concept editor's SectionHeader
  // ("Nearby competitors", concept-editor.tsx line 597) and other mixed-case
  // CONCEPT_COMPONENTS_V2 labels ("Shop identity", "Brand voice"). The
  // codebase-consistent case wins over strict TIM-1002 here.
  const label = "Nearby competitors";

  // No shops named but the user checked "no direct competitors identified" —
  // render a single sentence so the brief reflects the explicit declaration.
  if (competitors.length === 0 && noDirectCompetitors) {
    return (
      <div className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden flex">
        <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
        <div className="px-6 py-5 flex-1 min-w-0">
          <p className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-2.5">
            {label}
          </p>
          <p
            className="text-[var(--foreground)] leading-[1.75]"
            style={{ fontSize: "14.5px" }}
          >
            No direct competitors identified in our catchment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
        <div className="px-6 pt-5 pb-1 flex-1 min-w-0">
          <p className="section-label text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-4">
            {label}
          </p>
          {noDirectCompetitors && (
            <p className="text-xs text-[var(--muted-foreground)] italic mb-4 leading-relaxed">
              No direct competitors identified in our catchment.
            </p>
          )}
          <div className="space-y-4 pb-5">
            {competitors.map((c) => (
              <div
                key={c.id}
                className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {c.name}
                </p>
                {c.address && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {c.address}
                  </p>
                )}
                {c.what_they_do_well && (
                  <p
                    className="text-[var(--foreground)] leading-relaxed mt-1.5"
                    style={{ fontSize: "14.5px" }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--dark-grey)] mr-1.5">
                      What They Do Well:
                    </span>
                    {c.what_they_do_well}
                  </p>
                )}
                {c.gaps && (
                  <p
                    className="text-[var(--foreground)] leading-relaxed mt-1.5"
                    style={{ fontSize: "14.5px" }}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--dark-grey)] mr-1.5">
                      Gaps This Shop Fills:
                    </span>
                    {c.gaps}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
