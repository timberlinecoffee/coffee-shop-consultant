// TIM-1062: Business Plan PDF export — bundles every workspace into a single
// printable document the owner can hand to a banker, landlord, or investor.
// Extends the Concept print pattern (TIM-865) with cover, TOC, and per-workspace
// sections. Server-rendered HTML; the browser produces the PDF via Cmd+P.
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
import {
  normalizeOperationsPlaybook,
  isPlaybookEmpty,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  type OperationsPlaybookDocument,
} from "@/lib/operations-playbook";
import {
  normalizeMonthlyProjections,
  computeMonthlyProjections,
  type EquipmentSummary,
} from "@/lib/financial-projection";
import { PrintButton, SectionToggle } from "./print-button";

export const dynamic = "force-dynamic";

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

function centsToUsd(cents: number | null | undefined): string {
  if (!cents) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function usd(amountUsd: number | null | undefined): string {
  if (!amountUsd) return "—";
  return `$${Math.round(amountUsd).toLocaleString("en-US")}`;
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

  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, plan_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) redirect("/onboarding");

  const planId = plan.id;

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
    { data: marketingBrand },
    { data: digitalPresence },
    { data: campaigns },
    { data: financialModel },
    { data: coverRow },
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
      .select("id, name, brand, model, supplier, cost_usd, category, notes")
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
      .from("launch_timeline_items")
      .select("id, milestone, target_date, status, track, owner")
      .eq("plan_id", planId)
      .order("target_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("marketing_brand")
      .select("positioning_statement, brand_pillar_1, brand_pillar_2, brand_pillar_3, do_say, dont_say")
      .eq("plan_id", planId)
      .maybeSingle(),
    supabase
      .from("marketing_digital_presence")
      .select("channel_name, status, url_or_handle, owner")
      .eq("plan_id", planId)
      .order("position"),
    supabase
      .from("marketing_campaigns")
      .select("name, objective, channels, start_date, end_date, budget_cents")
      .eq("plan_id", planId)
      .order("start_date", { ascending: true, nullsFirst: false }),
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
      {/* Print stylesheet — preserves rich layout on Cmd+P */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 1.8cm 2cm; size: A4; }
              .section-card { break-inside: avoid; }
              .page-break { break-after: page; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[#efefef] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/business-plan"
          className="text-sm text-[#155e63] font-medium hover:underline flex items-center gap-1.5"
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
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#155e63] mb-4">
            Contents
          </p>
          <div className="space-y-2">
            {visibleSections.map((key, i) => (
              <div
                key={key}
                className="flex items-baseline justify-between border-b border-dotted border-[#efefef] py-1.5"
              >
                <span className="text-sm text-[#1a1a1a]">
                  <span className="text-[#afafaf] font-medium mr-2">
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
          <SectionFrame key={key} index={i + 1} title={SECTION_LABELS[key]}>
            {key === "concept" && <ConceptSection concept={concept} />}
            {key === "team_hiring" && <TeamHiringSection roles={roles ?? []} />}
            {key === "menu" && <MenuSection items={menuItems ?? []} />}
            {key === "equipment" && <EquipmentSection items={equipment ?? []} />}
            {key === "buildout" && (
              <BuildoutSection
                sections={buildoutSections ?? []}
                locations={locations ?? []}
                financialModel={financialModel}
              />
            )}
            {key === "launch" && <LaunchSection items={launchItems ?? []} />}
            {key === "marketing" && (
              <MarketingSection
                brand={marketingBrand}
                presence={digitalPresence ?? []}
                campaigns={campaigns ?? []}
              />
            )}
            {key === "suppliers" && <SuppliersSection />}
            {key === "operations" && <OperationsSection playbook={ops} />}
            {key === "financials" && (
              <FinancialsSection
                financialModel={financialModel}
                equipment={equipment ?? []}
              />
            )}
            {key === "appendix" && (
              <AppendixSection concept={concept} updatedAt={conceptDoc?.updated_at ?? null} />
            )}
          </SectionFrame>
        ))}

        <footer className="mt-16 pt-6 border-t border-[#efefef] flex items-center justify-between">
          <span className="text-xs text-[#afafaf]">
            {shopName} &middot; Business Plan &middot; {year}
          </span>
          <span className="text-xs text-[#afafaf]">Timberline Coffee School</span>
        </footer>
      </div>
    </div>
  );
}

// ── Shared layout ──────────────────────────────────────────────────────────────

function SectionFrame({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="page-break mb-14">
      <div className="mb-6">
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#155e63] mb-1">
          Section {String(index).padStart(2, "0")}
        </p>
        <h2
          className="font-bold text-[#1a1a1a] leading-tight"
          style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        <div className="mt-4 border-t border-[#efefef]" />
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d4d4d4] px-6 py-8 text-center">
      <p className="text-sm text-[#afafaf]">{message}</p>
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
      <div className="section-card rounded-2xl bg-[#f4f9f8] border border-[#d5eae8] px-7 py-6">
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-3">
          {label}
        </p>
        {children}
      </div>
    );
  }
  return (
    <div className="section-card bg-white border border-[#efefef] rounded-2xl overflow-hidden flex">
      <div className="w-1 bg-[#155e63] flex-shrink-0" />
      <div className="px-6 py-5 flex-1 min-w-0">
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#155e63] mb-2.5">
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
      className="text-[#1a1a1a] leading-[1.75] whitespace-pre-wrap"
      style={{ fontSize: "14.5px" }}
    >
      {children}
    </p>
  );
}

// ── Concept section ───────────────────────────────────────────────────────────

function ConceptSection({ concept }: { concept: ConceptDocumentV2 }) {
  const personas = concept.personas ?? [];
  const filled = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = concept.components[meta.id];
    if (!comp.included) return false;
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
              className="border-t border-[#efefef] pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-[#1a1a1a]">{p.name}</p>
                {p.isPrimary && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-[#155e63] border border-[#cfe0e1] rounded-full px-1.5 py-0.5 leading-none">
                    Primary
                  </span>
                )}
              </div>
              {p.whyTheyVisit?.trim() && (
                <p className="text-sm text-[#1a1a1a] leading-relaxed mb-1">
                  {p.whyTheyVisit.trim()}
                </p>
              )}
              {(habits.length > 0 || (p.values && p.values.length > 0)) && (
                <p className="text-xs text-[#6b6b6b]">
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

function TeamHiringSection({ roles }: { roles: RoleRow[] }) {
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
        <p className="text-sm text-[#1a1a1a] leading-[1.75]">
          {totalHeadcount} total headcount across {roles.length} role
          {roles.length === 1 ? "" : "s"}
          {totalMonthlyCents > 0
            ? `, estimated payroll ${centsToUsd(totalMonthlyCents)} per month.`
            : "."}
        </p>
      </SectionCard>
      <SectionCard label="Roles">
        <div className="divide-y divide-[#efefef]">
          {roles.map((r) => (
            <div key={r.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-[#1a1a1a]">
                  {r.role_title}
                  {r.headcount && r.headcount > 1 ? (
                    <span className="text-[#6b6b6b] font-normal"> &times;{r.headcount}</span>
                  ) : null}
                </p>
                <p className="text-xs text-[#6b6b6b] whitespace-nowrap">
                  {r.monthly_cost_cents ? `${centsToUsd(r.monthly_cost_cents)}/mo` : ""}
                </p>
              </div>
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                {[r.status, r.start_date ? `starts ${formatDate(r.start_date)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {r.notes?.trim() && (
                <p className="text-sm text-[#1a1a1a] leading-relaxed mt-1.5">{r.notes.trim()}</p>
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

function MenuSection({ items }: { items: MenuRow[] }) {
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
          <ul className="divide-y divide-[#efefef]">
            {byCategory[cat].map((item) => (
              <li key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-baseline gap-3">
                <span className="flex-1 text-sm text-[#1a1a1a]">{item.name}</span>
                <span className="text-sm text-[#6b6b6b] whitespace-nowrap">
                  {centsToUsd(item.price_cents)}
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
  brand: string | null;
  model: string | null;
  supplier: string | null;
  cost_usd: number | null;
  category: string | null;
  notes: string | null;
};

function EquipmentSection({ items }: { items: EquipmentRow[] }) {
  if (items.length === 0) {
    return (
      <EmptyState message="No equipment yet. Visit the Build-out & Equipment workspace to add it." />
    );
  }
  const total = items.reduce((s, e) => s + (e.cost_usd ?? 0), 0);
  const major = items.filter((e) => e.category === "major");
  const minor = items.filter((e) => e.category !== "major");
  const hasSupplierData = items.some((e) => e.supplier?.trim());

  const renderGroup = (label: string, rows: EquipmentRow[]) => {
    if (rows.length === 0) return null;
    return (
      <SectionCard key={label} label={label}>
        <ul className="divide-y divide-[#efefef]">
          {rows.map((item) => (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 text-sm text-[#1a1a1a]">{item.name}</span>
                <span className="text-sm text-[#6b6b6b] whitespace-nowrap">{usd(item.cost_usd)}</span>
              </div>
              {(item.brand?.trim() || item.model?.trim() || item.supplier?.trim()) && (
                <p className="text-xs text-[#6b6b6b] mt-0.5">
                  {[
                    [item.brand?.trim(), item.model?.trim()].filter(Boolean).join(" "),
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
        <p className="text-sm text-[#1a1a1a] leading-[1.75]">
          {items.length} items, estimated total {usd(total)}
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
}: {
  sections: BuildoutSectionRow[];
  locations: LocationRow[];
  financialModel: { startup_costs?: Record<string, unknown> } | null;
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
      <EmptyState message="No build-out details yet. Visit the Build-out and Location workspaces to add them." />
    );
  }

  return (
    <div className="space-y-5">
      {chosen && (
        <SectionCard label="Site" featured>
          <p className="text-sm font-semibold text-[#1a1a1a]">{chosen.name}</p>
          <p className="text-sm text-[#1a1a1a] mt-1">
            {[chosen.address, chosen.neighborhood].filter(Boolean).join(" · ")}
          </p>
          {(chosen.sq_ft || chosen.asking_rent_cents) && (
            <p className="text-xs text-[#6b6b6b] mt-2">
              {[
                chosen.sq_ft ? `${chosen.sq_ft.toLocaleString()} sq ft` : null,
                chosen.asking_rent_cents ? `${centsToUsd(chosen.asking_rent_cents)}/mo rent` : null,
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
              <li key={s.id} className="text-sm text-[#1a1a1a]">
                <span className="font-medium">{s.name}</span>
                {s.notes?.trim() && (
                  <span className="text-[#6b6b6b]">: {s.notes.trim()}</span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {(buildOutCents || licensesCents || depositsCents) > 0 && (
        <SectionCard label="Build-out Budget">
          <ul className="divide-y divide-[#efefef]">
            {buildOutCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Construction & finishes</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(buildOutCents)}</span>
              </li>
            )}
            {licensesCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Licenses & permits</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(licensesCents)}</span>
              </li>
            )}
            {depositsCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Deposits</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(depositsCents)}</span>
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
  milestone: string;
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
      <ul className="divide-y divide-[#efefef]">
        {items.map((m) => (
          <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[#1a1a1a]">{m.milestone}</span>
              <span className="text-xs text-[#6b6b6b] whitespace-nowrap">
                {formatDate(m.target_date)}
              </span>
            </div>
            {(m.track || m.owner || (m.status && m.status !== "pending")) && (
              <p className="text-xs text-[#6b6b6b] mt-0.5">
                {[m.track, m.owner, m.status && m.status !== "pending" ? `[${m.status}]` : null]
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

// ── Marketing & Pre-Launch ────────────────────────────────────────────────────

type MarketingBrandRow = {
  positioning_statement: string | null;
  brand_pillar_1: string | null;
  brand_pillar_2: string | null;
  brand_pillar_3: string | null;
  do_say: string | null;
  dont_say: string | null;
} | null;

type DigitalPresenceRow = {
  channel_name: string;
  status: string | null;
  url_or_handle: string | null;
  owner: string | null;
};

type CampaignRow = {
  name: string;
  objective: string | null;
  channels: string[] | null;
  start_date: string | null;
  end_date: string | null;
  budget_cents: number | null;
};

function MarketingSection({
  brand,
  presence,
  campaigns,
}: {
  brand: MarketingBrandRow;
  presence: DigitalPresenceRow[];
  campaigns: CampaignRow[];
}) {
  const hasBrand =
    !!brand && Boolean(brand.positioning_statement?.trim() || brand.brand_pillar_1?.trim());
  if (!hasBrand && presence.length === 0 && campaigns.length === 0) {
    return (
      <EmptyState message="No marketing plan yet. Visit the Marketing workspace to add one." />
    );
  }
  const pillars = [brand?.brand_pillar_1, brand?.brand_pillar_2, brand?.brand_pillar_3]
    .map((p) => p?.trim())
    .filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      {brand?.positioning_statement?.trim() && (
        <SectionCard label="Positioning" featured>
          <Paragraph>{brand.positioning_statement.trim()}</Paragraph>
        </SectionCard>
      )}
      {pillars.length > 0 && (
        <SectionCard label="Brand Pillars">
          <ul className="space-y-1.5">
            {pillars.map((p, i) => (
              <li key={i} className="text-sm text-[#1a1a1a] leading-snug">
                &bull; {p}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {presence.length > 0 && (
        <SectionCard label="Digital Presence (Waitlist, GBP, Social)">
          <ul className="divide-y divide-[#efefef]">
            {presence.map((p, i) => (
              <li key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[#1a1a1a]">{p.channel_name}</span>
                  <span className="text-xs text-[#6b6b6b]">{p.status ?? ""}</span>
                </div>
                {(p.url_or_handle?.trim() || p.owner?.trim()) && (
                  <p className="text-xs text-[#6b6b6b] mt-0.5">
                    {[p.url_or_handle?.trim(), p.owner?.trim() ? `Owner: ${p.owner.trim()}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
      {campaigns.length > 0 && (
        <SectionCard label="Campaigns & Promotions">
          <ul className="divide-y divide-[#efefef]">
            {campaigns.map((c, i) => (
              <li key={i} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-[#1a1a1a]">{c.name}</span>
                  <span className="text-xs text-[#6b6b6b]">{centsToUsd(c.budget_cents)}</span>
                </div>
                <p className="text-xs text-[#6b6b6b] mt-0.5">
                  {[
                    c.objective,
                    c.channels && c.channels.length > 0 ? c.channels.join(", ") : null,
                    c.start_date ? `${formatDate(c.start_date)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

// ── Suppliers & Vendors ───────────────────────────────────────────────────────

function SuppliersSection() {
  // TIM-1059: Suppliers workspace is not yet built. Render the spec'd empty state.
  return (
    <EmptyState message="No suppliers added yet. Visit the Suppliers workspace to add them." />
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
              <p className="text-sm text-[#1a1a1a] leading-relaxed mb-2">{cat.intro.trim()}</p>
            )}
            {cat.items.length > 0 && (
              <ol className="space-y-1 pl-5 list-decimal text-sm text-[#1a1a1a]">
                {cat.items.slice(0, 12).map((item) => (
                  <li key={item.id} className="leading-snug">
                    {item.text}
                    {item.duration_min != null && (
                      <span className="text-xs text-[#6b6b6b] ml-2">
                        ({item.duration_min} min)
                      </span>
                    )}
                  </li>
                ))}
                {cat.items.length > 12 && (
                  <li className="text-xs text-[#6b6b6b] list-none">
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
}: {
  financialModel: FinancialModelRow;
  equipment: EquipmentRow[];
}) {
  if (!financialModel) {
    return (
      <EmptyState message="No financial model yet. Visit the Financials workspace to add one." />
    );
  }

  const projections = normalizeMonthlyProjections(
    financialModel.forecast_inputs ?? financialModel.monthly_projections,
  );

  const totalEquipUsd = equipment.reduce((s, e) => s + (e.cost_usd ?? 0), 0);
  const equipSummary: EquipmentSummary = {
    total_cost_cents: Math.round(totalEquipUsd * 100),
    financed_cost_cents: Math.round(totalEquipUsd * 100),
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

  const sc = (financialModel.startup_costs as Record<string, unknown>) ?? {};
  const buildOutCents = typeof sc.build_out_cents === "number" ? sc.build_out_cents : 0;
  const totalEquipCents = typeof sc.total_equipment_cents === "number" ? sc.total_equipment_cents : 0;
  const licensesCents = typeof sc.licenses_cents === "number" ? sc.licenses_cents : 0;
  const depositsCents = typeof sc.deposits_cents === "number" ? sc.deposits_cents : 0;
  const cashReserveCents = typeof sc.cash_reserve_cents === "number" ? sc.cash_reserve_cents : 0;
  const totalStartupCents = buildOutCents + totalEquipCents + licensesCents + depositsCents + cashReserveCents;

  return (
    <div className="space-y-5">
      <SectionCard label="Year 1 Projections" featured>
        <table className="w-full text-sm text-[#1a1a1a]">
          <tbody>
            <tr>
              <td className="py-1">Revenue</td>
              <td className="py-1 text-right">{centsToUsd(totalRev)}</td>
            </tr>
            <tr>
              <td className="py-1">COGS</td>
              <td className="py-1 text-right text-[#6b6b6b]">
                {centsToUsd(totalCogs)} ({pct(totalCogs, totalRev)})
              </td>
            </tr>
            <tr>
              <td className="py-1">Labor</td>
              <td className="py-1 text-right text-[#6b6b6b]">
                {centsToUsd(totalLabor)} ({pct(totalLabor, totalRev)})
              </td>
            </tr>
            <tr>
              <td className="py-1">Operating Expenses</td>
              <td className="py-1 text-right text-[#6b6b6b]">{centsToUsd(totalOpex)}</td>
            </tr>
            <tr className="border-t border-[#d5eae8]">
              <td className="pt-2 font-semibold">Net Income</td>
              <td className="pt-2 text-right font-semibold">{centsToUsd(totalNet)}</td>
            </tr>
          </tbody>
        </table>
      </SectionCard>

      {totalStartupCents > 0 && (
        <SectionCard label="Startup Costs">
          <ul className="divide-y divide-[#efefef]">
            {totalEquipCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Equipment</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(totalEquipCents)}</span>
              </li>
            )}
            {buildOutCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Build-out</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(buildOutCents)}</span>
              </li>
            )}
            {licensesCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Licenses & permits</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(licensesCents)}</span>
              </li>
            )}
            {depositsCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Deposits</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(depositsCents)}</span>
              </li>
            )}
            {cashReserveCents > 0 && (
              <li className="py-2 flex items-baseline justify-between">
                <span className="text-sm text-[#1a1a1a]">Cash reserve</span>
                <span className="text-sm text-[#6b6b6b]">{centsToUsd(cashReserveCents)}</span>
              </li>
            )}
            <li className="py-2 flex items-baseline justify-between border-t border-[#d5eae8]">
              <span className="text-sm font-semibold text-[#1a1a1a]">Total</span>
              <span className="text-sm font-semibold text-[#1a1a1a]">{centsToUsd(totalStartupCents)}</span>
            </li>
          </ul>
        </SectionCard>
      )}

      <SectionCard label="Runway & Break-Even">
        <ul className="space-y-1.5 text-sm text-[#1a1a1a]">
          <li>
            <span className="text-[#6b6b6b]">Cash reserve at open:</span>{" "}
            {cashReserveCents > 0 ? centsToUsd(cashReserveCents) : "Not yet set"}
          </li>
          <li>
            <span className="text-[#6b6b6b]">Estimated months to first profitable month:</span>{" "}
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
  // V1 of the appendix: assumption log (deferred concept components) +
  // last-updated timestamp. AI revision tracking lands in a follow-up.
  const deferredOrEmpty = CONCEPT_COMPONENTS_V2.filter((meta) => {
    const comp = concept.components[meta.id];
    return !comp.included || !comp.content.trim();
  });

  return (
    <div className="space-y-5">
      <SectionCard label="Assumptions & Open Questions" featured>
        {deferredOrEmpty.length === 0 ? (
          <p className="text-sm text-[#1a1a1a] leading-relaxed">
            Every Concept component is filled in. No open questions on file.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-[#1a1a1a]">
            {deferredOrEmpty.map((meta) => (
              <li key={meta.id}>&bull; {meta.label}: still to be decided.</li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard label="Source Provenance">
        <p className="text-sm text-[#1a1a1a] leading-relaxed">
          Plan content is sourced from the owner&apos;s Groundwork workspaces. AI-assisted drafts
          are reviewed and edited by the owner before they appear here. Numerical projections are
          derived from the Financials workspace inputs.
        </p>
        {updatedAt && (
          <p className="text-xs text-[#6b6b6b] mt-2">Concept last updated {formatDate(updatedAt)}.</p>
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
  return (
    <header className="page-break mb-16 flex flex-col items-center text-center" style={{ paddingBottom: 0 }}>
      {logoUrl && (
        <div className="flex justify-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Logo" className="max-h-[72px] object-contain" />
        </div>
      )}

      <p className="text-sm font-semibold tracking-widest uppercase mb-3" style={{ color: "#1A6E3B" }}>
        Business Plan
      </p>
      <h1 className="font-bold leading-tight mb-3" style={{ fontSize: "40px", color: "#1A6E3B", letterSpacing: "-0.01em" }}>
        {shopName}
      </h1>

      <div className="my-4 rounded-full" style={{ width: 120, height: 2, backgroundColor: accent }} />

      {tagline && <p className="text-sm italic text-[#666666] mb-4">{tagline}</p>}

      <div className="mt-auto pt-12 space-y-1 text-sm">
        {preparedFor && (
          <p><span className="text-[#888888]">Prepared for</span> <span className="font-semibold text-[#333333]">{preparedFor}</span></p>
        )}
        {authorName && (
          <p><span className="text-[#888888]">Prepared by</span> <span className="font-semibold text-[#333333]">{authorName}</span></p>
        )}
        <p className="text-[#888888] text-xs mt-2">{date}</p>
      </div>

      <div className="mt-8 w-full" style={{ height: 4, backgroundColor: accent }} />
    </header>
  );
}

function PrintCoverModern({ shopName, date, accent, tagline, preparedFor, authorName, logoUrl }: PrintCoverProps) {
  return (
    <header className="page-break mb-16 relative" style={{ paddingLeft: 0 }}>
      <div className="absolute top-0 left-0 bottom-0 w-[6px] rounded-sm" style={{ backgroundColor: "#1A6E3B" }} />
      <div className="pl-16 pr-8 pt-16 pb-12 flex flex-col min-h-[500px]">
        <h1 className="font-bold leading-tight mb-4" style={{ fontSize: "44px", color: "#1A6E3B", letterSpacing: "-0.01em" }}>
          {shopName}
        </h1>
        <p className="text-lg text-[#555555] mb-3">Business Plan</p>
        {tagline && <p className="text-sm italic text-[#888888] mb-4">{tagline}</p>}
        <div className="w-full mb-4" style={{ height: 2, backgroundColor: accent }} />

        <div className="mt-auto space-y-3 text-sm">
          {preparedFor && (
            <div>
              <p className="text-[10px] text-[#888888] uppercase tracking-wide">Prepared for</p>
              <p className="font-semibold text-[#333333]">{preparedFor}</p>
            </div>
          )}
          {authorName && (
            <div>
              <p className="text-[10px] text-[#888888] uppercase tracking-wide">Prepared by</p>
              <p className="font-semibold text-[#333333]">{authorName}</p>
            </div>
          )}
          <p className="text-xs text-[#888888] mt-2">{date}</p>
        </div>
      </div>

      {logoUrl && (
        <div className="absolute bottom-12 left-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="Logo" className="max-h-[52px] max-w-[120px] object-contain" />
        </div>
      )}
      <p className="absolute bottom-6 right-8 text-[10px] text-[#CCCCCC]">Confidential</p>
    </header>
  );
}

function PrintCoverEditorial({ shopName, date, accent, tagline, preparedFor, authorName, logoUrl }: PrintCoverProps) {
  return (
    <header className="page-break mb-16">
      {/* Green header block */}
      <div
        className="w-full flex flex-col items-center justify-center text-center p-10"
        style={{ backgroundColor: "#1A6E3B", minHeight: "320px" }}
      >
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="max-h-[72px] max-w-[160px] object-contain mb-5" />
        )}
        <h1 className="font-bold text-white leading-tight mb-4" style={{ fontSize: "38px" }}>
          {shopName}
        </h1>
        <p className="text-lg font-semibold mb-3" style={{ color: accent }}>Business Plan</p>
        {tagline && <p className="text-sm" style={{ color: "#D4E8DF" }}>{tagline}</p>}
      </div>

      {/* White metadata block */}
      <div className="px-14 pt-10 pb-12 space-y-4 text-sm relative">
        {preparedFor && (
          <div>
            <p className="text-[10px] text-[#888888] uppercase tracking-wide">Prepared for</p>
            <p className="font-semibold text-[#333333] text-base">{preparedFor}</p>
          </div>
        )}
        {authorName && (
          <div>
            <p className="text-[10px] text-[#888888] uppercase tracking-wide">Prepared by</p>
            <p className="font-semibold text-[#333333] text-base">{authorName}</p>
          </div>
        )}
        <p className="text-xs text-[#888888]">{date}</p>
        <div className="absolute bottom-10 right-12" style={{ width: 48, height: 8, backgroundColor: accent, borderRadius: 2 }} />
      </div>
    </header>
  );
}
