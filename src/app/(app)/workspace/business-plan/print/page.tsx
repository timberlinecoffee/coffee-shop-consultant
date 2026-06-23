// TIM-1062: Business Plan PDF export — bundles every workspace into a single
// printable document the owner can hand to a banker, landlord, or investor.
// Extends the Concept print pattern (TIM-865) with cover, TOC, and per-workspace
// sections. Server-rendered HTML; the browser produces the PDF via Cmd+P.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMinorUnits, formatCurrencyAmount } from "@/lib/currency";
import { getAccountSettings } from "@/lib/account-settings";
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
import {
  normalizeOperationsPlaybook,
  isPlaybookEmpty,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  type OperationsPlaybookDocument,
} from "@/lib/operations-playbook";
import {
  normalizeMarketing,
  isMarketingEmpty,
  type MarketingDocument,
} from "@/lib/marketing";
import {
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  totalCapexCents,
  type EquipmentSummary,
} from "@/lib/financial-projection";
import {
  VENDOR_CATEGORY_LABELS,
  type VendorCandidate,
  type VendorDecision,
} from "@/lib/suppliers";
import { PrintButton, SectionToggle } from "./print-button";
import type { Metadata } from "next";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

// TIM-2333: override the root layout's "My Coffee Shop Consultant: Timberline
// Coffee School" title so the printable's PDF metadata / browser-print header
// / OG previews never carry the platform brand on a user's exported plan.
// Static neutral title — generateMetadata would re-hit the DB for every
// printable render; the cover page itself carries the shop name.
export const metadata: Metadata = {
  title: "Business Plan",
  description: "Business Plan",
  openGraph: { title: "Business Plan", description: "Business Plan", siteName: "" },
  twitter: { title: "Business Plan", description: "Business Plan" },
};

// ── Section keys: stable URL toggles (e.g. ?exclude=appendix,marketing) ────────
const SECTION_KEYS = [
  "concept",
  "team_hiring",
  "menu",
  "equipment",
  "buildout",
  "launch",
  "marketing",
  "suppliers",
  "operations",
  "financials",
  "appendix",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  concept: "Concept",
  team_hiring: "Team & Hiring",
  menu: "Menu",
  equipment: "Equipment",
  buildout: "Build-out",
  launch: "Launch Plan",
  marketing: "Marketing & Pre-Launch",
  suppliers: "Suppliers & Vendors",
  operations: "Operations Playbook",
  financials: "Financials",
  appendix: "Appendix",
};

const FEATURED_CONCEPT_IDS: ReadonlySet<ConceptComponentId> = new Set(["vision"]);

type SearchParams = { [key: string]: string | string[] | undefined };

function parseExcluded(searchParams: SearchParams): Set<SectionKey> {
  const raw = searchParams.exclude;
  const flat = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  return new Set(
    flat
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SectionKey => (SECTION_KEYS as readonly string[]).includes(s)),
  );
}

function pct(num: number, denom: number): string {
  if (!denom) return "0%";
  return `${Math.round((num / denom) * 100)}%`;
}

function formatDate(input: string | null | undefined, fallback = "TBD"): string {
  if (!input) return fallback;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function BusinessPlanPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const excluded = parseExcluded(params);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const settings = await getAccountSettings(supabase, user.id);
  const currencyCode = settings.currencyCode;

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("plan_name")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) redirect("/onboarding");

  const [
    { data: userProfile },
    { data: conceptDoc },
    { data: opsDoc },
    { data: roles },
    { data: menuItems },
    { data: equipment },
    { data: buildoutSections },
    { data: locations },
    { data: launchItems },
    { data: marketingDoc },
    { data: financialModel },
    { data: coverRow },
    { data: vendorCandidates },
    { data: vendorDecisions },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, target_opening_date")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", planId)
      .eq("workspace_key", "concept")
      .maybeSingle(),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "operations_playbook")
      .maybeSingle(),
    supabase
      .from("hiring_plan_roles")
      .select("id, role_title, headcount, start_date, monthly_cost_cents, status, notes")
      .eq("plan_id", planId)
      .order("created_at"),
    supabase
      .from("menu_items_with_cogs")
      .select("id, name, category_name, price_cents, expected_mix_pct, notes")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("buildout_equipment_items")
      .select("id, name, vendor, model, supplier, cost_local, category, notes")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("buildout_list_sections")
      .select("id, name, list_type, notes, position")
      .eq("plan_id", planId)
      .order("position"),
    supabase
      .from("location_candidates")
      .select("id, name, address, neighborhood, sq_ft, asking_rent_cents, status, notes")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position"),
    supabase
      .from("launch_milestones")
      .select("id, title, target_date, status, track, owner")
      .eq("plan_id", planId)
      .order("target_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("workspace_documents")
      .select("content")
      .eq("plan_id", planId)
      .eq("workspace_key", "marketing")
      .maybeSingle(),
    supabase
      .from("financial_models")
      .select("forecast_inputs, monthly_projections, startup_costs")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("business_plan_cover")
      .select("template_id, accent_color, logo_path, tagline, prepared_for, author_name")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("vendor_candidates")
      .select("id, category, name, contact, price_per_unit, minimum_order, lead_time, notes, status")
      .eq("plan_id", planId)
      .order("category", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("vendor_decisions")
      .select("id, category, candidate_id, vendor_name, reason, is_current")
      .eq("plan_id", planId)
      .eq("is_current", true),
  ]);

  const concept: ConceptDocumentV2 = normalizeConceptV2(conceptDoc?.content);
  const ops: OperationsPlaybookDocument = normalizeOperationsPlaybook(opsDoc?.content);
  const conceptShopName = concept.components.shop_identity.content.trim();
  const shopName = conceptShopName || plan.plan_name || "Your Coffee Shop";
  const ownerName = userProfile?.full_name?.trim() || null;
  const targetOpenDate = formatDate(userProfile?.target_opening_date, "Date TBD");
  const city = concept.components.location.content.trim() || "City TBD";

  const printDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const year = new Date().getFullYear();

  const visibleSections: SectionKey[] = SECTION_KEYS.filter((k) => !excluded.has(k));

  const coverTemplateId = coverRow?.template_id ?? "classic";
  // TIM-2315: explicit hex fallback so cover/section accents render identical to
  // the PDF (which defaults to brand.colors.accent = #E8C24A). Using a CSS var
  // string here means it never resolves inside inline backgroundColor values.
  const coverAccent = coverRow?.accent_color ?? "#E8C24A";
  const coverTagline = coverRow?.tagline ?? null;
  const coverPreparedFor = coverRow?.prepared_for ?? null;
  const coverAuthorName = coverRow?.author_name ?? null;

  let logoSignedUrl: string | null = null;
  if (coverRow?.logo_path) {
    const { data: signed } = await supabase.storage
      .from("business-plan-logos")
      .createSignedUrl(coverRow.logo_path, 3600);
    logoSignedUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Print stylesheet — preserves rich layout on Cmd+P. TIM-2315: 19mm page
          margins per spec; widow/orphan control on body text; section heading
          stays with its first paragraph; cover page gets explicit 0 margin so
          full-bleed editorial header reaches the page edge.
          TIM-2333: hide the workspace AppSidebar in print so the Groundwork
          logo mark never reaches the user's exported PDF (the sidebar is
          injected by the workspace layout, not by this page). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* TIM-2333: workspace chrome (sidebar + topbar) carries the
               Groundwork mark; the printable should look like the user's
               own document at every magnification. The action bar above
               already provides a "Back to editing" link, so the workspace
               nav is redundant on this route. Hide in all media. */
            aside[aria-label="Workspace navigation"],
            nav[aria-label="Workspace navigation"] { display: none !important; }
            /* Workspace layout puts the lg:pl-[224px] padding on the flex-1
               wrapper, not on <main>. With the sidebar hidden, undo that
               offset so the printable centers correctly on screen. */
            @media (min-width: 1024px) {
              div.flex.min-h-screen > div.flex-1 { padding-left: 0 !important; }
            }
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 19mm; size: A4; }
              .section-card { break-inside: avoid; orphans: 3; widows: 3; }
              .page-break { break-after: page; }
              .cover-page { min-height: calc(100vh - 38mm); }
              h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
              p { orphans: 3; widows: 3; }
              img { max-width: 100%; height: auto; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/business-plan"
          className="text-sm text-[var(--teal)] font-medium hover:underline flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span> Back to editing
        </Link>
        <div className="flex items-center gap-2.5">
          <SectionToggle
            sections={SECTION_KEYS.map((k) => ({ key: k, label: SECTION_LABELS[k] }))}
            excluded={Array.from(excluded)}
          />
          <PrintButton />
        </div>
      </div>

      <div className="max-w-[680px] mx-auto px-8 pt-14 pb-20">
        {/* ── Cover page ───────────────────────────────────────────────────── */}
        <PrintCoverPage
          templateId={coverTemplateId}
          shopName={shopName}
          date={printDate}
          accent={coverAccent}
          tagline={coverTagline}
          preparedFor={coverPreparedFor}
          authorName={coverAuthorName}
          logoUrl={logoSignedUrl}
        />

        {/* ── Table of contents ────────────────────────────────────────────── */}
        <section className="page-break mb-16">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-4" style={{ color: coverAccent }}>
            Contents
          </p>
          <div className="space-y-2">
            {visibleSections.map((key, i) => (
              <div
                key={key}
                className="flex items-baseline justify-between border-b border-dotted border-[var(--border)] py-1.5"
              >
                <span className="text-sm text-[var(--foreground)]">
                  <span className="text-[var(--dark-grey)] font-medium mr-2">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {SECTION_LABELS[key]}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Sections ─────────────────────────────────────────────────────── */}
        {visibleSections.map((key, i) => (
          <SectionFrame key={key} index={i + 1} title={SECTION_LABELS[key]} accent={coverAccent}>
            {key === "concept" && <ConceptSection concept={concept} />}
            {key === "team_hiring" && <TeamHiringSection roles={roles ?? []} currencyCode={currencyCode} />}
            {key === "menu" && <MenuSection items={menuItems ?? []} currencyCode={currencyCode} />}
            {key === "equipment" && <EquipmentSection items={equipment ?? []} currencyCode={currencyCode} />}
            {key === "buildout" && (
              <BuildoutSection
                sections={buildoutSections ?? []}
                locations={locations ?? []}
                financialModel={financialModel}
                currencyCode={currencyCode}
              />
            )}
            {key === "launch" && <LaunchSection items={launchItems ?? []} />}
            {key === "marketing" && (
              <MarketingSection marketing={normalizeMarketing(marketingDoc?.content)} />
            )}
            {key === "suppliers" && (
              <SuppliersSection
                candidates={(vendorCandidates ?? []) as VendorCandidate[]}
                decisions={(vendorDecisions ?? []) as VendorDecision[]}
              />
            )}
            {key === "operations" && <OperationsSection playbook={ops} />}
            {key === "financials" && (
              <FinancialsSection
                financialModel={financialModel}
                equipment={equipment ?? []}
                currencyCode={currencyCode}
              />
            )}
            {key === "appendix" && (
              <AppendixSection concept={concept} updatedAt={conceptDoc?.updated_at ?? null} />
            )}
          </SectionFrame>
        ))}

        <footer className="mt-16 pt-6 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-[var(--dark-grey)]">
            {shopName} &middot; Business Plan &middot; {year}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ── Shared layout ──────────────────────────────────────────────────────────────

function SectionFrame({
  index,
  title,
  accent,
  children,
}: {
  index: number;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="page-break mb-14">
      <div className="mb-6">
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-1" style={{ color: accent }}>
          Section {String(index).padStart(2, "0")}
        </p>
        <h2
          className="font-bold text-[var(--foreground)] leading-tight"
          style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <div className="mt-4 border-t" style={{ borderColor: accent, borderTopWidth: 2 }} />
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--gray-700)] px-6 py-8 text-center">
      <p className="text-sm text-[var(--dark-grey)]">{message}</p>
    </div>
  );
}

function SectionCard({
  label,
  children,
  featured,
}: {
  label: string;
  children: React.ReactNode;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <div className="section-card rounded-2xl bg-[var(--teal-tint-500)] border border-[var(--teal-tint-300)] px-7 py-6">
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-3">
          {label}
        </p>
        {children}
      </div>
    );
  }
  return (
    <div className="section-card bg-white border border-[var(--border)] rounded-2xl overflow-hidden flex">
      <div className="w-1 bg-[var(--teal)] flex-shrink-0" />
      <div className="px-6 py-5 flex-1 min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-2.5">
          {label}
        </p>
        {children}
      </div>
    </div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[var(--foreground)] leading-[1.75] whitespace-pre-wrap"
      style={{ fontSize: "14.5px" }}
    >
      {children}
    </p>
  );
}

// ── Concept section ───────────────────────────────────────────────────────────

function ConceptSection({ concept }: { concept: ConceptDocumentV2 }) {
  const personas = concept.personas ?? [];
  // TIM-2859: content presence is the single signal for inclusion (the per-card
  // In doc / Skip toggle was removed from the Concept workspace; the `included`
  // flag is preserved on the wire but ignored at read time).
  const filled = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = concept.components[meta.id];
    if (meta.id === "shop_identity") return false;
    if (meta.id === "target_customer") {
      return personas.length > 0 || comp.content.trim().length > 0;
    }
    return comp.content.trim().length > 0;
  });

  if (filled.length === 0) {
    return (
      <EmptyState message="No concept details yet. Visit the Concept workspace to add them." />
    );
  }

  return (
    <div className="space-y-5">
      {filled.map((meta) => {
        const comp = concept.components[meta.id];
        if (meta.id === "target_customer" && personas.length > 0) {
          return <PersonasBlock key={meta.id} label={meta.label} personas={personas} />;
        }
        return (
          <SectionCard key={meta.id} label={meta.label} featured={FEATURED_CONCEPT_IDS.has(meta.id)}>
            <Paragraph>{comp.content.trim()}</Paragraph>
          </SectionCard>
        );
      })}
    </div>
  );
}

function PersonasBlock({ label, personas }: { label: string; personas: CustomerPersona[] }) {
  return (
    <SectionCard label={label}>
      <div className="space-y-4">
        {personas.map((p) => {
          const habits = [
            p.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] : null,
            p.spendPerVisit ? `${PERSONA_SPEND_LABELS[p.spendPerVisit]} per visit` : null,
          ].filter(Boolean);
          return (
            <div
              key={p.id}
              className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-[var(--foreground)]">{p.name}</p>
                {p.isPrimary && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--teal)] border border-[var(--teal-tint)] rounded-full px-1.5 py-0.5 leading-none">
                    Primary
                  </span>
                )}
              </div>
              {p.whyTheyVisit?.trim() && (
                <p className="text-sm text-[var(--foreground)] leading-relaxed mb-1">
                  {p.whyTheyVisit.trim()}
                </p>
              )}
              {(habits.length > 0 || (p.values && p.values.length > 0)) && (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {[
                    habits.length > 0 ? habits.join(", ") : null,
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
    </SectionCard>
  );
}

// ── Team & Hiring ─────────────────────────────────────────────────────────────

type RoleRow = {
  id: string;
  role_title: string;
  headcount: number | null;
  start_date: string | null;
  monthly_cost_cents: number | null;
  status: string | null;
  notes: string | null;
};

function TeamHiringSection({ roles, currencyCode }: { roles: RoleRow[]; currencyCode: string }) {
  if (roles.length === 0) {
    return (
      <EmptyState message="No roles added yet. Visit the Hiring workspace to add them." />
    );
  }
  const totalHeadcount = roles.reduce((s, r) => s + (r.headcount ?? 0), 0);
  const totalMonthlyCents = roles.reduce((s, r) => s + (r.monthly_cost_cents ?? 0), 0);
  return (
    <div className="space-y-5">
      <SectionCard label="Team Summary" featured>
        <p className="text-sm text-[var(--foreground)] leading-[1.75]">
          {totalHeadcount} total headcount across {roles.length} role
          {roles.length === 1 ? "" : "s"}
          {totalMonthlyCents > 0
            ? `, estimated payroll ${formatMinorUnits(totalMonthlyCents ?? 0, currencyCode)} per month.`
            : "."}
        </p>
      </SectionCard>
      <SectionCard label="Roles">
        <div className="divide-y divide-[var(--border)]">
          {roles.map((r) => (
            <div key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {r.role_title}
                  {r.headcount && r.headcount > 1 ? (
                    <span className="text-[var(--muted-foreground)] font-normal"> &times;{r.headcount}</span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                  {r.monthly_cost_cents ? `${formatMinorUnits(r.monthly_cost_cents ?? 0, currencyCode)}/mo` : ""}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {[r.status, r.start_date ? `starts ${formatDate(r.start_date)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.notes?.trim() && (
                <p className="text-sm text-[var(--foreground)] leading-relaxed mt-1.5">{r.notes.trim()}</p>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────

type MenuRow = {
  id: string;
  name: string;
  // TIM-1140: view exposes joined category name as `category_name`.
  category_name: string | null;
  price_cents: number | null;
  expected_mix_pct: number | null;
  notes: string | null;
};

function MenuSection({ items, currencyCode }: { items: MenuRow[]; currencyCode: string }) {
  if (items.length === 0) {
    return (
      <EmptyState message="No menu items yet. Visit the Menu & Pricing workspace to add them." />
    );
  }
  const byCategory: Record<string, MenuRow[]> = {};
  for (const item of items) {
    const cat = item.category_name ?? "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const cats = Object.keys(byCategory).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-5">
      {cats.map((cat) => (
        <SectionCard key={cat} label={cat}>
          <ul className="divide-y divide-[var(--border)]">
            {byCategory[cat].map((item) => (
              <li key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-baseline gap-3">
                <span className="flex-1 text-sm text-[var(--foreground)]">{item.name}</span>
                <span className="text-sm text-[var(--muted-foreground)] whitespace-nowrap">
                  {formatMinorUnits(item.price_cents ?? 0, currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

// ── Equipment ─────────────────────────────────────────────────────────────────

type EquipmentRow = {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  supplier: string | null;
  // TIM-2488: was `cost_usd`. Local-currency line total.
  cost_local: number | null;
  category: string | null;
  notes: string | null;
};

function EquipmentSection({ items, currencyCode }: { items: EquipmentRow[]; currencyCode: string }) {
  if (items.length === 0) {
    return (
      <EmptyState message="No equipment yet. Visit the Equipment & Supplies workspace to add it." />
    );
  }
  const total = items.reduce((s, e) => s + (e.cost_local ?? 0), 0);
  const major = items.filter((e) => e.category === "major");
  const minor = items.filter((e) => e.category !== "major");
  const hasSupplierData = items.some((e) => e.supplier?.trim());

  const renderGroup = (label: string, rows: EquipmentRow[]) => {
    if (rows.length === 0) return null;
    return (
      <SectionCard key={label} label={label}>
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((item) => (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 text-sm text-[var(--foreground)]">{item.name}</span>
                <span className="text-sm text-[var(--muted-foreground)] whitespace-nowrap">{formatCurrencyAmount(item.cost_local ?? 0, currencyCode)}</span>
              </div>
              {(item.vendor?.trim() || item.model?.trim() || item.supplier?.trim()) && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {[
                    [item.vendor?.trim(), item.model?.trim()].filter(Boolean).join(" "),
                    item.supplier?.trim() ? `Supplier: ${item.supplier.trim()}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard label="Equipment Total" featured>
        <p className="text-sm text-[var(--foreground)] leading-[1.75]">
          {items.length} items, estimated total {formatCurrencyAmount(total ?? 0, currencyCode)}
          {hasSupplierData ? "." : ". Visit the Suppliers workspace to add supplier details."}
        </p>
      </SectionCard>
      {renderGroup("Major Equipment", major)}
      {renderGroup("Smallwares & Minor Equipment", minor)}
    </div>
  );
}

// ── Build-out ─────────────────────────────────────────────────────────────────

type BuildoutSectionRow = {
  id: string;
  name: string;
  list_type: string | null;
  notes: string | null;
  position: number | null;
};

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  sq_ft: number | null;
  asking_rent_cents: number | null;
  status: string | null;
  notes: string | null;
};

function BuildoutSection({
  sections,
  locations,
  financialModel,
  currencyCode,
}: {
  sections: BuildoutSectionRow[];
  locations: LocationRow[];
  financialModel: { startup_costs?: Record<string, unknown> } | null;
  currencyCode: string;
}) {
  const chosen = locations.find((l) => l.status === "chosen") ?? locations[0] ?? null;
  const layoutSections = sections.filter((s) => s.list_type === "equipment");
  const sc = (financialModel?.startup_costs as Record<string, unknown> | undefined) ?? {};
  const buildOutCents = typeof sc.build_out_cents === "number" ? sc.build_out_cents : 0;
  const licensesCents = typeof sc.licenses_cents === "number" ? sc.licenses_cents : 0;
  const depositsCents = typeof sc.deposits_cents === "number" ? sc.deposits_cents : 0;
  const hasAny =
    layoutSections.length > 0 || chosen || buildOutCents || licensesCents || depositsCents;

  if (!hasAny) {
    return (
      <EmptyState message="No build-out details yet. Visit the Equipment & Supplies and Location workspaces to add them." />
    );
  }

  return (
    <div className="space-y-5">
      {chosen && (
        <SectionCard label="Site" featured>
          <p className="text-sm font-semibold text-[var(--foreground)]">{chosen.name}</p>
          <p className="text-sm text-[var(--foreground)] mt-1">
            {[chosen.address, chosen.neighborhood].filter(Boolean).join(" · ")}
          </p>
          {(chosen.sq_ft || chosen.asking_rent_cents) && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              {[
                chosen.sq_ft ? `${chosen.sq_ft.toLocaleString()} sq ft` : null,
                chosen.asking_rent_cents ? `${formatMinorUnits(chosen.asking_rent_cents ?? 0, currencyCode)}/mo rent` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </SectionCard>
      )}
      {layoutSections.length > 0 && (
        <SectionCard label="Layout Sections">
          <ul className="space-y-2">
            {layoutSections.map((s) => (
              <li key={s.id} className="text-sm text-[var(--foreground)]">
                <span className="font-medium">{s.name}</span>
                {s.notes?.trim() && (
                  <span className="text-[var(--muted-foreground)]">: {s.notes.trim()}</span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {(buildOutCents || licensesCents || depositsCents) > 0 && (
        <SectionCard label="Build-out Budget">
          <ul className="divide-y divide-[var(--border)]">
            {buildOutCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Construction & finishes</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(buildOutCents ?? 0, currencyCode)}</span>
              </li>
            )}
            {licensesCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Licenses & permits</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(licensesCents ?? 0, currencyCode)}</span>
              </li>
            )}
            {depositsCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Deposits</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(depositsCents ?? 0, currencyCode)}</span>
              </li>
            )}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

// ── Launch ────────────────────────────────────────────────────────────────────

type LaunchRow = {
  id: string;
  title: string;
  target_date: string | null;
  status: string | null;
  track: string | null;
  owner: string | null;
};

function LaunchSection({ items }: { items: LaunchRow[] }) {
  if (items.length === 0) {
    return (
      <EmptyState message="No milestones yet. Visit the Launch Plan workspace to add them." />
    );
  }
  return (
    <SectionCard label="Milestones">
      <ul className="divide-y divide-[var(--border)]">
        {items.map((m) => (
          <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--foreground)]">{m.title}</span>
              <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                {formatDate(m.target_date)}
              </span>
            </div>
            {(m.track || m.owner || (m.status && m.status !== "not_started")) && (
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {[m.track, m.owner, m.status && m.status !== "not_started" ? `[${m.status}]` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ── Marketing ─────────────────────────────────────────────────────────────────

function MarketingSection({ marketing }: { marketing: MarketingDocument }) {
  if (isMarketingEmpty(marketing)) {
    return (
      <EmptyState message="No marketing plan yet. Visit the Marketing workspace to add one." />
    );
  }
  const channels = marketing.channels.selected;
  const milestones = marketing.pre_launch.milestones;

  return (
    <div className="space-y-5">
      {marketing.overview.narrative.trim() && (
        <SectionCard label="Overview" featured>
          <Paragraph>{marketing.overview.narrative.trim()}</Paragraph>
        </SectionCard>
      )}
      {(marketing.story.founder_story.trim() ||
        marketing.story.origin.trim() ||
        marketing.story.differentiator.trim() ||
        marketing.story.target_customer.trim()) && (
        <SectionCard label="Story And Brand">
          {marketing.story.founder_story.trim() && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Founder Story</p>
              <Paragraph>{marketing.story.founder_story.trim()}</Paragraph>
            </div>
          )}
          {marketing.story.origin.trim() && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Origin</p>
              <Paragraph>{marketing.story.origin.trim()}</Paragraph>
            </div>
          )}
          {marketing.story.differentiator.trim() && (
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">What Makes Us Different</p>
              <Paragraph>{marketing.story.differentiator.trim()}</Paragraph>
            </div>
          )}
          {marketing.story.target_customer.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Who It Is For</p>
              <Paragraph>{marketing.story.target_customer.trim()}</Paragraph>
            </div>
          )}
        </SectionCard>
      )}
      {channels.length > 0 && (
        <SectionCard label="Channels">
          <ul className="divide-y divide-[var(--border)]">
            {channels.map((c, i) => (
              <li key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[var(--foreground)]">{c.name}</span>
                </div>
                {c.notes.trim() && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{c.notes.trim()}</p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {milestones.length > 0 && (
        <SectionCard label="Pre-launch Plan">
          <ul className="divide-y divide-[var(--border)]">
            {milestones.map((m, i) => (
              <li key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[var(--foreground)]">{m.label}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {m.target_date ? formatDate(m.target_date) : "Date TBD"}
                  </span>
                </div>
                {m.notes.trim() && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{m.notes.trim()}</p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

// ── Suppliers & Vendors ───────────────────────────────────────────────────────

function SuppliersSection({
  candidates,
  decisions,
}: {
  candidates: VendorCandidate[];
  decisions: VendorDecision[];
}) {
  const chosenIds = new Set(decisions.map((d) => d.candidate_id).filter(Boolean));
  const chosen = candidates.filter((c) => c.status === "chosen" || chosenIds.has(c.id));

  if (chosen.length === 0 && candidates.length === 0) {
    return (
      <EmptyState message="No suppliers added yet. Visit the Suppliers workspace to add them." />
    );
  }

  // Group by category
  const grouped = new Map<string, VendorCandidate[]>();
  const displayList = chosen.length > 0 ? chosen : candidates;
  for (const v of displayList) {
    const cat = v.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(v);
  }

  return (
    <div className="space-y-5">
      {Array.from(grouped.entries()).map(([cat, vendors]) => {
        const label = cat.startsWith("custom:")
          ? cat.replace("custom:", "").replace(/-/g, " ")
          : (VENDOR_CATEGORY_LABELS[cat as keyof typeof VENDOR_CATEGORY_LABELS] ?? cat);
        return (
          <SectionCard key={cat} label={label}>
            <div className="space-y-3">
              {vendors.map((v) => (
                <div key={v.id} className="border-b border-[var(--gray-slate-4)] pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{v.name}</p>
                  {v.contact && (
                    <p className="text-xs text-[var(--muted-foreground)]">{v.contact}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--foreground)]">
                    {v.price_per_unit && <span>Price: {v.price_per_unit}</span>}
                    {v.minimum_order && <span>Min. order: {v.minimum_order}</span>}
                    {v.lead_time && <span>Lead time: {v.lead_time}</span>}
                  </div>
                  {v.notes && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">{v.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}

// ── Operations Playbook ───────────────────────────────────────────────────────

function OperationsSection({ playbook }: { playbook: OperationsPlaybookDocument }) {
  if (isPlaybookEmpty(playbook)) {
    return (
      <EmptyState message="No SOPs yet. Visit the Operations Playbook workspace to add them." />
    );
  }
  return (
    <div className="space-y-5">
      {SOP_CATEGORY_KEYS.map((key) => {
        const cat = playbook[key];
        if (!cat.intro.trim() && cat.items.length === 0) return null;
        return (
          <SectionCard key={key} label={SOP_CATEGORY_LABELS[key]}>
            {cat.intro.trim() && (
              <p className="text-sm text-[var(--foreground)] leading-relaxed mb-2">{cat.intro.trim()}</p>
            )}
            {cat.items.length > 0 && (
              <ol className="space-y-1 pl-5 list-decimal text-sm text-[var(--foreground)]">
                {cat.items.slice(0, 12).map((item) => (
                  <li key={item.id} className="leading-snug">
                    {item.text}
                    {item.duration_min != null && (
                      <span className="text-xs text-[var(--muted-foreground)] ml-2">
                        ({item.duration_min} min)
                      </span>
                    )}
                  </li>
                ))}
                {cat.items.length > 12 && (
                  <li className="text-xs text-[var(--muted-foreground)] list-none">
                    … and {cat.items.length - 12} more steps (see Operations Playbook print).
                  </li>
                )}
              </ol>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}

// ── Financials ────────────────────────────────────────────────────────────────

type FinancialModelRow = {
  forecast_inputs: unknown;
  monthly_projections: unknown;
  startup_costs: Record<string, unknown> | null;
} | null;

function FinancialsSection({
  financialModel,
  equipment,
  currencyCode,
}: {
  financialModel: FinancialModelRow;
  equipment: EquipmentRow[];
  currencyCode: string;
}) {
  if (!financialModel) {
    return (
      <EmptyState message="No financial model yet. Visit the Financials workspace to add one." />
    );
  }

  const projections = normalizeMonthlyProjections(
    financialModel.forecast_inputs ?? financialModel.monthly_projections,
  );

  // TIM-2488: was `totalEquipUsd` reading `e.cost_usd`. Same local-currency total.
  const totalEquipLocal = equipment.reduce((s, e) => s + (e.cost_local ?? 0), 0);
  const equipSummary: EquipmentSummary = {
    total_cost_cents: Math.round(totalEquipLocal * 100),
    financed_cost_cents: Math.round(totalEquipLocal * 100),
  };
  const monthRows = computeMonthlyProjections(projections, equipSummary);

  const y1 = monthRows.slice(0, 12);
  const totalRev = y1.reduce((s, r) => s + r.revenue_cents, 0);
  const totalCogs = y1.reduce((s, r) => s + r.cogs_cents, 0);
  const totalLabor = y1.reduce((s, r) => s + r.labor_cents, 0);
  const totalOpex = y1.reduce((s, r) => s + r.total_opex_cents, 0);
  const totalNet = y1.reduce((s, r) => s + r.net_income_cents, 0);

  const breakEvenIdx = monthRows.findIndex((r) => r.net_income_cents > 0);
  const breakEvenMonth = breakEvenIdx === -1 ? null : breakEvenIdx + 1;

  // TIM-1255: use unified capex lines instead of dead total_equipment_cents field.
  const capexTotalCents = totalCapexCents(projections);
  const sc = projections.startup_costs;
  const licensesCents = sc?.licenses_cents ?? 0;
  const depositsCents = sc?.deposits_cents ?? 0;
  const cashReserveCents = (sc?.working_capital_reserve_cents ?? 0) + (sc?.opening_cash_buffer_cents ?? 0);
  const totalStartupCents = capexTotalCents + licensesCents + depositsCents + cashReserveCents;

  return (
    <div className="space-y-5">
      <SectionCard label="Year 1 Projections" featured>
        <table className="w-full text-sm text-[var(--foreground)]">
          <tbody>
            <tr>
              <td className="py-1">Revenue</td>
              <td className="py-1 text-right">{formatMinorUnits(totalRev ?? 0, currencyCode)}</td>
            </tr>
            <tr>
              <td className="py-1">COGS</td>
              <td className="py-1 text-right text-[var(--muted-foreground)]">
                {formatMinorUnits(totalCogs ?? 0, currencyCode)} ({pct(totalCogs, totalRev)})
              </td>
            </tr>
            <tr>
              <td className="py-1">Labor</td>
              <td className="py-1 text-right text-[var(--muted-foreground)]">
                {formatMinorUnits(totalLabor ?? 0, currencyCode)} ({pct(totalLabor, totalRev)})
              </td>
            </tr>
            <tr>
              <td className="py-1">Operating Expenses</td>
              <td className="py-1 text-right text-[var(--muted-foreground)]">{formatMinorUnits(totalOpex ?? 0, currencyCode)}</td>
            </tr>
            <tr className="border-t border-[var(--teal-tint-300)]">
              <td className="pt-2 font-semibold">Net Income</td>
              <td className="pt-2 text-right font-semibold">{formatMinorUnits(totalNet ?? 0, currencyCode)}</td>
            </tr>
          </tbody>
        </table>
      </SectionCard>

      {totalStartupCents > 0 && (
        <SectionCard label="Startup Costs">
          <ul className="divide-y divide-[var(--border)]">
            {/* TIM-1255: show per-asset capex lines instead of dead lump-sum field */}
            {projections.forecast_lines
              .filter((l) => l.category === "capex" && l.mode === "flat" && l.value > 0)
              .map((l) => (
                <li key={l.id} className="py-2 flex items-baseline justify-between">
                  <span className="text-sm text-[var(--foreground)]">{l.label}</span>
                  <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(l.value ?? 0, currencyCode)}</span>
                </li>
              ))}
            {licensesCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Licenses & permits</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(licensesCents ?? 0, currencyCode)}</span>
              </li>
            )}
            {depositsCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Deposits</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(depositsCents ?? 0, currencyCode)}</span>
              </li>
            )}
            {cashReserveCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[var(--foreground)]">Cash reserve</span>
                <span className="text-sm text-[var(--muted-foreground)]">{formatMinorUnits(cashReserveCents ?? 0, currencyCode)}</span>
              </li>
            )}
            <li className="py-2 flex items-baseline justify-between border-t border-[var(--teal-tint-300)]">
              <span className="text-sm font-semibold text-[var(--foreground)]">Total</span>
              <span className="text-sm font-semibold text-[var(--foreground)]">{formatMinorUnits(totalStartupCents ?? 0, currencyCode)}</span>
            </li>
          </ul>
        </SectionCard>
      )}

      <SectionCard label="Runway & Break-Even">
        <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
          <li>
            <span className="text-[var(--muted-foreground)]">Cash reserve at open:</span>{" "}
            {cashReserveCents > 0 ? formatMinorUnits(cashReserveCents ?? 0, currencyCode) : "Not yet set"}
          </li>
          <li>
            <span className="text-[var(--muted-foreground)]">Estimated months to first profitable month:</span>{" "}
            {breakEvenMonth ? `${breakEvenMonth}` : "Year 1 model does not reach break-even"}
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}

// ── Appendix ──────────────────────────────────────────────────────────────────

function AppendixSection({
  concept,
  updatedAt,
}: {
  concept: ConceptDocumentV2;
  updatedAt: string | null;
}) {
  // V1 of the appendix: assumption log + last-updated timestamp. AI revision
  // tracking lands in a follow-up.
  // TIM-2859: "deferred" now equals "empty" (per-card Skip toggle removed).
  const deferredOrEmpty = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = concept.components[meta.id];
    return !comp.content.trim();
  });

  return (
    <div className="space-y-5">
      <SectionCard label="Assumptions & Open Questions" featured>
        {deferredOrEmpty.length === 0 ? (
          <p className="text-sm text-[var(--foreground)] leading-relaxed">
            Every Concept component is filled in. No open questions on file.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
            {deferredOrEmpty.map((meta) => (
              <li key={meta.id}>&bull; {meta.label}: still to be decided.</li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard label="Source Provenance">
        <p className="text-sm text-[var(--foreground)] leading-relaxed">
          Plan content is sourced from workspace data entered by the owner. AI-assisted drafts
          are reviewed and edited by the owner before they appear here. Numerical projections are
          derived from the Financials workspace inputs.
        </p>
        {updatedAt && (
          <p className="text-xs text-[var(--muted-foreground)] mt-2">Concept last updated {formatDate(updatedAt)}.</p>
        )}
      </SectionCard>
    </div>
  );
}

// ── PrintCoverPage ────────────────────────────────────────────────────────────
// HTML mirror of the react-pdf cover templates. Three variants matching the PDF.

interface PrintCoverProps {
  templateId: string;
  shopName: string;
  date: string;
  accent: string;
  tagline: string | null;
  preparedFor: string | null;
  authorName: string | null;
  logoUrl: string | null;
}

function PrintCoverPage(props: PrintCoverProps) {
  switch (props.templateId) {
    case "modern":
      return <PrintCoverModern {...props} />;
    case "editorial":
      return <PrintCoverEditorial {...props} />;
    default:
      return <PrintCoverClassic {...props} />;
  }
}

function PrintCoverClassic({ shopName, date, accent, tagline, preparedFor, authorName, logoUrl }: PrintCoverProps) {
  // TIM-2315: title + eyebrow + rules use the user-selected `accent` rather
  // than the hardcoded brand green, so theme color flows through.
  return (
    <header className="page-break cover-page mb-16 flex flex-col items-center text-center">
      {logoUrl && (
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Logo" className="max-h-[72px] object-contain" />
        </div>
      )}

      <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: accent }}>
        Business Plan
      </p>
      <h1 className="font-bold leading-tight mb-3" style={{ fontSize: "40px", color: accent, letterSpacing: "-0.01em" }}>
        {shopName}
      </h1>

      <div className="my-4 rounded-full" style={{ width: 120, height: 2, backgroundColor: accent }} />

      {tagline && <p className="text-sm italic text-[var(--gray-1100)] mb-4">{tagline}</p>}

      <div className="mt-auto pt-12 space-y-1 text-sm">
        {preparedFor && (
          <p><span className="text-[var(--neutral-cool-600)]">Prepared for</span> <span className="font-semibold text-[var(--gray-1350)]">{preparedFor}</span></p>
        )}
        {authorName && (
          <p><span className="text-[var(--neutral-cool-600)]">Prepared by</span> <span className="font-semibold text-[var(--gray-1350)]">{authorName}</span></p>
        )}
        <p className="text-[var(--neutral-cool-600)] text-xs mt-2">{date}</p>
      </div>

      <div className="mt-8 w-full" style={{ height: 4, backgroundColor: accent }} />
    </header>
  );
}

function PrintCoverModern({ shopName, date, accent, tagline, preparedFor, authorName, logoUrl }: PrintCoverProps) {
  return (
    <header className="page-break cover-page mb-16 relative">
      <div className="absolute top-0 left-0 bottom-0 w-[6px] rounded-sm" style={{ backgroundColor: accent }} />
      <div className="pl-16 pr-8 pt-16 pb-12 flex flex-col min-h-[500px]">
        <h1 className="font-bold leading-tight mb-4" style={{ fontSize: "44px", color: accent, letterSpacing: "-0.01em" }}>
          {shopName}
        </h1>
        <p className="text-lg text-[var(--gray-1150)] mb-3">Business Plan</p>
        {tagline && <p className="text-sm italic text-[var(--neutral-cool-600)] mb-4">{tagline}</p>}
        <div className="w-full mb-4" style={{ height: 2, backgroundColor: accent }} />

        <div className="mt-auto space-y-3 text-sm">
          {preparedFor && (
            <div>
              <p className="text-[10px] text-[var(--neutral-cool-600)] uppercase tracking-wide">Prepared for</p>
              <p className="font-semibold text-[var(--gray-1350)]">{preparedFor}</p>
            </div>
          )}
          {authorName && (
            <div>
              <p className="text-[10px] text-[var(--neutral-cool-600)] uppercase tracking-wide">Prepared by</p>
              <p className="font-semibold text-[var(--gray-1350)]">{authorName}</p>
            </div>
          )}
          <p className="text-xs text-[var(--neutral-cool-600)] mt-2">{date}</p>
        </div>
      </div>

      {logoUrl && (
        <div className="absolute bottom-12 left-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Logo" className="max-h-[52px] max-w-[120px] object-contain" />
        </div>
      )}
      <p className="absolute bottom-6 right-8 text-[10px] text-[var(--gray-800)]">Confidential</p>
    </header>
  );
}

function PrintCoverEditorial({ shopName, date, accent, tagline, preparedFor, authorName, logoUrl }: PrintCoverProps) {
  // TIM-2315: header block uses `accent` (was hardcoded green). The "Business
  // Plan" subtitle now uses a transparent-white overlay so it stays legible on
  // any accent color the user picks.
  return (
    <header className="page-break cover-page mb-16">
      {/* Accent header block */}
      <div
        className="w-full flex flex-col items-center justify-center text-center p-10"
        style={{ backgroundColor: accent, minHeight: "320px" }}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="max-h-[72px] max-w-[160px] object-contain mb-5" />
        )}
        <h1 className="font-bold text-white leading-tight mb-4" style={{ fontSize: "38px" }}>
          {shopName}
        </h1>
        <p className="text-lg font-semibold text-white opacity-90 mb-3">Business Plan</p>
        {tagline && <p className="text-sm text-white opacity-80">{tagline}</p>}
      </div>

      {/* White metadata block */}
      <div className="px-14 pt-10 pb-12 space-y-4 text-sm relative">
        {preparedFor && (
          <div>
            <p className="text-[10px] text-[var(--neutral-cool-600)] uppercase tracking-wide">Prepared for</p>
            <p className="font-semibold text-[var(--gray-1350)] text-base">{preparedFor}</p>
          </div>
        )}
        {authorName && (
          <div>
            <p className="text-[10px] text-[var(--neutral-cool-600)] uppercase tracking-wide">Prepared by</p>
            <p className="font-semibold text-[var(--gray-1350)] text-base">{authorName}</p>
          </div>
        )}
        <p className="text-xs text-[var(--neutral-cool-600)]">{date}</p>
        <div className="absolute bottom-10 right-12" style={{ width: 48, height: 8, backgroundColor: accent, borderRadius: 2 }} />
      </div>
    </header>
  );
}
