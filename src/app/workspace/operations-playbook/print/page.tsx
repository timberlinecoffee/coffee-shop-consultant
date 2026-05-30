// TIM-1061: Operations Playbook — print view.
// TIM-1416: V1 binder prints SOPs, recipes pulled read-only from Menu, plus
// roles, vendor contacts, and training. No daily-execution log surfaces.
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
} from "@/lib/operations-playbook";
import {
  loadOperationsRecipeCards,
  groupRecipeCardsByCategory,
  type OperationsRecipeCard,
} from "@/lib/operations-recipes";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function OperationsPlaybookPrintPage() {
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

  return (
    <div className="bg-white min-h-screen text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-8 py-10 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <h1 className="text-2xl font-bold">Operations Playbook</h1>
          <PrintButton />
        </div>

        <header className="mb-8 print:mb-6">
          <h1 className="hidden print:block text-3xl font-bold mb-1">
            Operations Playbook
          </h1>
          {updatedAt && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Last updated{" "}
              {new Date(updatedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </header>

        <div className="space-y-10">
          {SOP_CATEGORY_KEYS.map((key) => {
            const cat = playbook[key];
            return (
              <section
                key={key}
                className="break-inside-avoid-page print:break-after-page"
              >
                <h2 className="text-xl font-bold mb-1 border-b-2 border-[var(--teal)] pb-1">
                  {SOP_CATEGORY_LABELS[key]}
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] mb-2 italic">
                  {SOP_CATEGORY_TAGLINES[key]}
                </p>
                {cat.intro && (
                  <p className="text-sm text-[var(--foreground)] leading-relaxed mb-4">
                    {cat.intro}
                  </p>
                )}
                <CategoryItems items={cat.items} groupByStation={key === "cleaning"} />
              </section>
            );
          })}

          <section className="break-inside-avoid-page print:break-after-page">
            <h2 className="text-xl font-bold mb-1 border-b-2 border-[var(--teal)] pb-1">
              {RECIPES_SECTION_LABEL}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-2 italic">
              {RECIPES_SECTION_TAGLINE}
            </p>
            <RecipeCards cards={recipeCards} />
          </section>

          <section className="break-inside-avoid-page print:break-after-page">
            <h2 className="text-xl font-bold mb-1 border-b-2 border-[var(--teal)] pb-1">
              {PLANNING_SECTION_LABELS.roles}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-2 italic">
              {PLANNING_SECTION_TAGLINES.roles}
            </p>
            <RolesSectionPrint section={playbook.roles} />
          </section>

          <section className="break-inside-avoid-page print:break-after-page">
            <h2 className="text-xl font-bold mb-1 border-b-2 border-[var(--teal)] pb-1">
              {PLANNING_SECTION_LABELS.vendor_contacts}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-2 italic">
              {PLANNING_SECTION_TAGLINES.vendor_contacts}
            </p>
            <VendorContactsPrint section={playbook.vendor_contacts} />
          </section>

          <section className="break-inside-avoid-page print:break-after-page">
            <h2 className="text-xl font-bold mb-1 border-b-2 border-[var(--teal)] pb-1">
              {PLANNING_SECTION_LABELS.training}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-2 italic">
              {PLANNING_SECTION_TAGLINES.training}
            </p>
            <TrainingPrint section={playbook.training} />
          </section>
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
    return (
      <ol className="space-y-1.5 pl-5 list-decimal text-sm">
        {items.map((item) => (
          <li key={item.id} className="leading-snug">
            <span className="inline-block align-top w-3 h-3 border border-[var(--foreground)] rounded-sm mr-2 print:mr-2" />
            {item.text}
            {item.duration_min != null && (
              <span className="text-xs text-[var(--muted-foreground)] ml-2">
                ({item.duration_min} min)
              </span>
            )}
          </li>
        ))}
      </ol>
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
