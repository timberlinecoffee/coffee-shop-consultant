// TIM-1061: Operations Playbook — print view.
// TIM-1416: V1 binder prints SOPs, recipes pulled read-only from Menu, plus
// roles, vendor contacts, and training. No daily-execution log surfaces.
// TIM-1501: per-document printing — `?doc=<key>` renders only that document;
// each document is a standalone artifact with shop name header + date footer;
// "Print all" places a page break between documents so the printed output is
// a clean stack rather than one flowing doc.
//
// Plain, high-contrast layout meant to be printed and posted in the shop.
// Server-rendered — no nav, no AI panel, no editing.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  normalizeOperationsPlaybook,
  seededPlaybook,
  isPlaybookEmpty,
  SOP_CATEGORY_KEYS,
  SOP_CATEGORY_LABELS,
  SOP_CATEGORY_TAGLINES,
  PLANNING_SECTION_LABELS,
  PLANNING_SECTION_TAGLINES,
  TRAINING_PHASE_KEYS,
  TRAINING_PHASE_LABELS,
  RECIPES_SECTION_LABEL,
  RECIPES_SECTION_TAGLINE,
  type SopChecklistItem,
  type RolesSection,
  type VendorContactsSection,
  type TrainingSection,
  type SopCategoryKey,
} from "@/lib/operations-playbook";
import {
  loadOperationsRecipeCards,
  groupRecipeCardsByCategory,
  type OperationsRecipeCard,
} from "@/lib/operations-recipes";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

// TIM-1501: union of every printable document key. Matches the per-card
// "Print" buttons in the workspace.
const PRINT_DOC_KEYS = [
  ...SOP_CATEGORY_KEYS,
  "recipes",
  "roles",
  "vendor_contacts",
  "training",
] as const;
type PrintDocKey = (typeof PRINT_DOC_KEYS)[number];

type SearchParams = { [key: string]: string | string[] | undefined };

function parseDocKey(params: SearchParams): PrintDocKey | null {
  const raw = params.doc;
  const flat = Array.isArray(raw) ? raw[0] : raw;
  if (!flat) return null;
  return (PRINT_DOC_KEYS as readonly string[]).includes(flat)
    ? (flat as PrintDocKey)
    : null;
}

export default async function OperationsPlaybookPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const docKey = parseDocKey(params);
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

  const [{ data: doc }, recipeCards] = await Promise.all([
    supabase
      .from("workspace_documents")
      .select("content, updated_at")
      .eq("plan_id", plan.id)
      .eq("workspace_key", "operations_playbook")
      .maybeSingle(),
    loadOperationsRecipeCards(supabase, plan.id),
  ]);

  const stored = normalizeOperationsPlaybook(doc?.content);
  const playbook = isPlaybookEmpty(stored) ? seededPlaybook() : stored;
  const updatedAt = doc?.updated_at ?? null;
  const shopName = plan.plan_name?.trim() || "Your Coffee Shop";

  // Render every document by default; when `?doc=` is set, render only that one.
  const docsToRender: PrintDocKey[] = docKey ? [docKey] : [...PRINT_DOC_KEYS];

  return (
    <div className="bg-white min-h-screen text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-8 py-10 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <div>
            <h1 className="text-2xl font-bold">
              {docKey ? labelForDoc(docKey) : "Operations Playbook"}
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {shopName}
              {docKey
                ? " · Single document"
                : ` · ${docsToRender.length} documents`}
            </p>
          </div>
          <PrintButton />
        </div>

        <div>
          {docsToRender.map((key, i) => (
            <PrintDocument
              key={key}
              docKey={key}
              isFirst={i === 0}
              shopName={shopName}
              updatedAt={updatedAt}
              playbook={playbook}
              recipeCards={recipeCards}
            />
          ))}
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

// ── One printable document ────────────────────────────────────────────────────

function PrintDocument({
  docKey,
  isFirst,
  shopName,
  updatedAt,
  playbook,
  recipeCards,
}: {
  docKey: PrintDocKey;
  isFirst: boolean;
  shopName: string;
  updatedAt: string | null;
  playbook: ReturnType<typeof seededPlaybook>;
  recipeCards: OperationsRecipeCard[];
}) {
  const label = labelForDoc(docKey);
  const tagline = taglineForDoc(docKey);

  return (
    <article
      // TIM-1501: each printed document starts on a fresh page in "Print all"
      // mode so the output reads as a stack of standalone artifacts.
      className={
        isFirst
          ? "break-inside-avoid-page"
          : "break-inside-avoid-page print:break-before-page mt-12 pt-8 border-t border-[var(--border)] print:mt-0 print:pt-0 print:border-t-0"
      }
    >
      <DocumentHeader
        title={label}
        shopName={shopName}
        tagline={tagline}
      />

      <div className="mt-4">
        {(SOP_CATEGORY_KEYS as readonly string[]).includes(docKey) ? (
          (() => {
            const key = docKey as SopCategoryKey;
            const cat = playbook[key];
            return (
              <>
                {cat.intro && (
                  <p className="text-sm leading-relaxed mb-4">{cat.intro}</p>
                )}
                <CategoryItems
                  items={cat.items}
                  groupByStation={key === "cleaning"}
                />
              </>
            );
          })()
        ) : docKey === "recipes" ? (
          <RecipeCards cards={recipeCards} />
        ) : docKey === "roles" ? (
          <RolesSectionPrint section={playbook.roles} />
        ) : docKey === "vendor_contacts" ? (
          <VendorContactsPrint section={playbook.vendor_contacts} />
        ) : docKey === "training" ? (
          <TrainingPrint section={playbook.training} />
        ) : null}
      </div>

      <DocumentFooter shopName={shopName} updatedAt={updatedAt} />
    </article>
  );
}

function DocumentHeader({
  title,
  shopName,
  tagline,
}: {
  title: string;
  shopName: string;
  tagline: string;
}) {
  return (
    <header className="mb-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)] mb-1">
        {shopName}
      </p>
      <h2 className="text-xl font-bold border-b-2 border-[var(--teal)] pb-1">
        {title}
      </h2>
      <p className="text-xs text-[var(--muted-foreground)] mt-1 italic">
        {tagline}
      </p>
    </header>
  );
}

function DocumentFooter({
  shopName,
  updatedAt,
}: {
  shopName: string;
  updatedAt: string | null;
}) {
  const dateLine = updatedAt
    ? `Last updated ${new Date(updatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}`
    : null;
  const printedLine = `Printed ${new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
  return (
    <footer className="mt-6 pt-3 border-t border-[var(--border-medium)] flex flex-wrap justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
      <span>{shopName}</span>
      <span>{dateLine ?? printedLine}</span>
    </footer>
  );
}

// ── Doc-key → display label / tagline ────────────────────────────────────────

function labelForDoc(key: PrintDocKey): string {
  if ((SOP_CATEGORY_KEYS as readonly string[]).includes(key)) {
    return SOP_CATEGORY_LABELS[key as SopCategoryKey];
  }
  if (key === "recipes") return RECIPES_SECTION_LABEL;
  if (key === "roles") return PLANNING_SECTION_LABELS.roles;
  if (key === "vendor_contacts") return PLANNING_SECTION_LABELS.vendor_contacts;
  return PLANNING_SECTION_LABELS.training;
}

function taglineForDoc(key: PrintDocKey): string {
  if ((SOP_CATEGORY_KEYS as readonly string[]).includes(key)) {
    return SOP_CATEGORY_TAGLINES[key as SopCategoryKey];
  }
  if (key === "recipes") return RECIPES_SECTION_TAGLINE;
  if (key === "roles") return PLANNING_SECTION_TAGLINES.roles;
  if (key === "vendor_contacts") return PLANNING_SECTION_TAGLINES.vendor_contacts;
  return PLANNING_SECTION_TAGLINES.training;
}

function CategoryItems({
  items,
  groupByStation,
}: {
  items: SopChecklistItem[];
  groupByStation: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--dark-grey)] italic">No steps yet.</p>
    );
  }

  if (!groupByStation) {
    // TIM-1501: opening/closing print as a real checkbox list so a staff
    // member can tick rows on paper.
    return (
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.id} className="leading-snug flex items-start gap-2">
            <span className="inline-block w-3.5 h-3.5 border border-[var(--foreground)] rounded-sm flex-shrink-0 mt-0.5" />
            <span className="flex-1 min-w-0">
              {item.text}
              {item.duration_min != null && (
                <span className="text-xs text-[var(--muted-foreground)] ml-2">
                  ({item.duration_min} min)
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  // Cleaning items: group by station, then list daily/weekly/monthly cadences within.
  const byStation = new Map<string, SopChecklistItem[]>();
  for (const item of items) {
    const station = item.station ?? "Other";
    const list = byStation.get(station) ?? [];
    list.push(item);
    byStation.set(station, list);
  }

  return (
    <div className="space-y-4">
      {Array.from(byStation.entries()).map(([station, stationItems]) => {
        const grouped: Record<string, SopChecklistItem[]> = { daily: [], weekly: [], monthly: [] };
        for (const item of stationItems) {
          const cad = item.cadence ?? "daily";
          grouped[cad].push(item);
        }
        return (
          <div key={station}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--teal)] mb-1.5">
              {station}
            </h3>
            {(["daily", "weekly", "monthly"] as const).map((cad) =>
              grouped[cad].length === 0 ? null : (
                <div key={cad} className="mb-2 ml-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                    {cad}
                  </p>
                  <ul className="space-y-1 pl-1 text-sm">
                    {grouped[cad].map((item) => (
                      <li key={item.id} className="leading-snug flex gap-2">
                        <span className="inline-block w-3 h-3 border border-[var(--foreground)] rounded-sm flex-shrink-0 mt-1" />
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

function RecipeCards({ cards }: { cards: OperationsRecipeCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-[var(--dark-grey)] italic">
        No menu items yet. Add recipes in the Menu workspace.
      </p>
    );
  }
  const grouped = groupRecipeCardsByCategory(cards);
  return (
    <div className="space-y-4">
      {grouped.map(({ category, cards: catCards }) => (
        <div key={category}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--teal)] mb-1.5">
            {category}
          </h3>
          <div className="space-y-3">
            {catCards.map((card) => (
              <div
                key={card.menu_item_id}
                className="border border-[var(--border-medium)] rounded-md p-3"
              >
                <h4 className="text-sm font-semibold mb-1">{card.name}</h4>
                {card.ingredients.length > 0 && (
                  <ul className="text-xs space-y-0.5 mb-1.5">
                    {card.ingredients.map((ing, idx) => (
                      <li key={`${card.menu_item_id}-${idx}`} className="leading-snug">
                        {ing.amount} {ing.unit} · {ing.ingredient_name}
                      </li>
                    ))}
                  </ul>
                )}
                {card.notes && (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">
                    {card.notes}
                  </p>
                )}
                {card.ingredients.length === 0 && !card.notes && (
                  <p className="text-xs text-[var(--dark-grey)] italic">
                    No recipe details on the menu item yet.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RolesSectionPrint({ section }: { section: RolesSection }) {
  if (section.items.length === 0) {
    return (
      <p className="text-sm text-[var(--dark-grey)] italic">No roles defined yet.</p>
    );
  }
  return (
    <>
      {section.intro && (
        <p className="text-sm leading-relaxed mb-3">{section.intro}</p>
      )}
      <ul className="space-y-2 text-sm">
        {section.items.map((role) => (
          <li key={role.id} className="leading-snug">
            <p className="font-semibold">{role.role}</p>
            <p>{role.responsibilities}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

function VendorContactsPrint({ section }: { section: VendorContactsSection }) {
  if (section.items.length === 0) {
    return (
      <p className="text-sm text-[var(--dark-grey)] italic">No contacts yet.</p>
    );
  }
  return (
    <>
      {section.intro && (
        <p className="text-sm leading-relaxed mb-3">{section.intro}</p>
      )}
      <table className="w-full text-sm border border-[var(--border-medium)]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
            <th className="px-2 py-1 border-b border-[var(--border-medium)]">Role</th>
            <th className="px-2 py-1 border-b border-[var(--border-medium)]">Contact</th>
            <th className="px-2 py-1 border-b border-[var(--border-medium)]">Phone</th>
            <th className="px-2 py-1 border-b border-[var(--border-medium)]">Email</th>
            <th className="px-2 py-1 border-b border-[var(--border-medium)]">Notes</th>
          </tr>
        </thead>
        <tbody>
          {section.items.map((c) => (
            <tr key={c.id} className="align-top">
              <td className="px-2 py-1.5 font-semibold">{c.label}</td>
              <td className="px-2 py-1.5">{c.contact_name || "—"}</td>
              <td className="px-2 py-1.5">{c.phone || "—"}</td>
              <td className="px-2 py-1.5 break-all">{c.email || "—"}</td>
              <td className="px-2 py-1.5 text-xs">{c.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function TrainingPrint({ section }: { section: TrainingSection }) {
  if (section.items.length === 0) {
    return (
      <p className="text-sm text-[var(--dark-grey)] italic">No milestones yet.</p>
    );
  }
  return (
    <>
      {section.intro && (
        <p className="text-sm leading-relaxed mb-3">{section.intro}</p>
      )}
      <div className="space-y-4">
        {TRAINING_PHASE_KEYS.map((phase) => {
          const items = section.items.filter((t) => t.phase === phase);
          if (items.length === 0) return null;
          return (
            <div key={phase}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--teal)] mb-1.5">
                {TRAINING_PHASE_LABELS[phase]}
              </h3>
              <ul className="space-y-1 text-sm">
                {items.map((t) => (
                  <li key={t.id} className="leading-snug flex gap-2">
                    <span className="inline-block w-3 h-3 border border-[var(--foreground)] rounded-sm flex-shrink-0 mt-1" />
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
