// TIM-3296: Menu Suite — print recipe cards. Browser print via Cmd+P.
// Mirrors the Business Plan print pattern (TIM-1062 / TIM-2333):
// server-rendered HTML, same action bar, same @media print primitives.
// Each recipe card: name, category, price, ingredients, prep steps, notes.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActivePlanId } from "@/lib/plan-context";
import { formatMinorUnits } from "@/lib/currency";
import { getAccountSettings } from "@/lib/account-settings";
import { PrintButton } from "./print-button";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recipe Cards",
  description: "Recipe Cards",
  openGraph: { title: "Recipe Cards", description: "Recipe Cards", siteName: "" },
  twitter: { title: "Recipe Cards", description: "Recipe Cards" },
};

type RecipeItem = {
  id: string;
  name: string;
  category_name: string | null;
  price_cents: number | null;
  notes: string | null;
  preparation_steps: string[] | null;
};

type IngredientRow = {
  id: string;
  name: string;
  package_size: number;
  package_unit: string;
  package_cost_cents: number;
};

type ItemIngredientRow = {
  id: string;
  menu_item_id: string;
  ingredient_id: string;
  amount: number;
  unit: string;
};

export default async function MenuPricingPrintPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");

  const settings = await getAccountSettings(supabase, user.id);
  const currencyCode = settings.currencyCode;

  const [
    { data: itemsData },
    { data: ingredientsData },
    { data: itemIngredientsData },
    { data: plan },
  ] = await Promise.all([
    supabase
      .from("menu_items_with_cogs")
      .select("id, name, category_name, price_cents, notes, preparation_steps")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position", { ascending: true }),
    supabase
      .from("menu_ingredients")
      .select("id, name, package_size, package_unit, package_cost_cents")
      .eq("plan_id", planId)
      .order("name", { ascending: true }),
    supabase
      .from("menu_item_ingredients")
      .select("id, menu_item_id, ingredient_id, amount, unit"),
    supabase
      .from("coffee_shop_plans")
      .select("plan_name")
      .eq("id", planId)
      .maybeSingle(),
  ]);

  const items = (itemsData ?? []) as RecipeItem[];
  const ingredients = (ingredientsData ?? []) as IngredientRow[];
  const itemIngredients = (itemIngredientsData ?? []) as ItemIngredientRow[];
  const shopName = plan?.plan_name ?? "Your Coffee Shop";

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  function getItemIngredients(itemId: string): { ingredient: IngredientRow; amount: number; unit: string }[] {
    return itemIngredients
      .filter((ii) => ii.menu_item_id === itemId)
      .map((ii) => {
        const ingredient = ingredientMap.get(ii.ingredient_id);
        if (!ingredient) return null;
        return { ingredient, amount: ii.amount, unit: ii.unit };
      })
      .filter((x): x is { ingredient: IngredientRow; amount: number; unit: string } => x !== null);
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Print stylesheet — same primitives as Business Plan print (TIM-1062 / TIM-2333).
          Hides workspace chrome (sidebar, nav), strips the action bar, renders
          each recipe card full-width with a page break between cards. */}
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
            @media print {
              .no-print { display: none !important; }
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 19mm; size: A4; }
              .recipe-card { break-inside: avoid; orphans: 3; widows: 3; }
              .page-break { break-after: page; }
              h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
              p { orphans: 3; widows: 3; }
            }
          `,
        }}
      />

      {/* Action bar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between">
        <Link
          href="/workspace/menu-pricing"
          className="text-sm text-[var(--teal)] font-medium hover:underline flex items-center gap-1.5"
        >
          <span aria-hidden="true">←</span> Back to editing
        </Link>
        <PrintButton />
      </div>

      <div className="max-w-[680px] mx-auto px-8 pt-12 pb-20">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--muted-foreground)] text-sm">
              No menu items yet.{" "}
              <Link href="/workspace/menu-pricing" className="text-[var(--teal)] hover:underline">
                Add items in the Menu workspace
              </Link>{" "}
              to print recipe cards.
            </p>
          </div>
        ) : (
          <div>
            {items.map((item, idx) => {
              const lines = getItemIngredients(item.id);
              const steps = item.preparation_steps ?? [];
              const notes = item.notes?.trim() ?? "";
              const isEmpty = lines.length === 0 && steps.length === 0 && !notes;
              const isLast = idx === items.length - 1;

              return (
                <article
                  key={item.id}
                  className={`recipe-card${isLast ? "" : " page-break"} mb-16`}
                  aria-label={`Recipe card: ${item.name}`}
                >
                  {/* Card header */}
                  <div className="mb-6">
                    {item.category_name && (
                      <p className="text-[10px] font-semibold tracking-[0.18em] uppercase mb-1 text-[var(--teal)]">
                        {item.category_name}
                      </p>
                    )}
                    <div className="flex items-baseline justify-between gap-4">
                      <h2
                        className="font-bold text-[var(--foreground)] leading-tight"
                        style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
                      >
                        {item.name}
                      </h2>
                      {item.price_cents != null && item.price_cents > 0 && (
                        <span className="text-lg font-semibold text-[var(--foreground)] flex-shrink-0">
                          {formatMinorUnits(item.price_cents, currencyCode)}
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-4 border-t"
                      style={{ borderColor: "var(--teal)", borderTopWidth: 2 }}
                    />
                  </div>

                  {isEmpty ? (
                    <div className="rounded-2xl border border-dashed border-[var(--gray-700)] px-6 py-8 text-center">
                      <p className="text-sm text-[var(--dark-grey)]">
                        No recipe details yet. Add ingredients and preparation steps in the Menu workspace.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Ingredients */}
                      {lines.length > 0 && (
                        <section>
                          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-3">
                            Ingredients
                          </h3>
                          <ul className="divide-y divide-[var(--border)]">
                            {lines.map(({ ingredient, amount, unit }) => (
                              <li
                                key={ingredient.id}
                                className="py-2 first:pt-0 last:pb-0 flex items-baseline gap-3"
                              >
                                <span className="text-sm font-medium text-[var(--foreground)]">
                                  {ingredient.name}
                                </span>
                                <span className="text-sm text-[var(--muted-foreground)] ml-auto whitespace-nowrap">
                                  {amount} {unit}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {/* Preparation steps */}
                      {steps.length > 0 && (
                        <section className={lines.length > 0 ? "border-t border-[var(--border)] pt-5" : ""}>
                          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-3">
                            Preparation
                          </h3>
                          <ol className="space-y-3">
                            {steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-3">
                                <span
                                  className="shrink-0 w-6 h-6 rounded-full bg-[var(--teal)] text-white text-xs font-bold flex items-center justify-center mt-0.5"
                                  aria-hidden="true"
                                >
                                  {i + 1}
                                </span>
                                <p
                                  className="text-[var(--foreground)] leading-[1.6]"
                                  style={{ fontSize: "14.5px" }}
                                >
                                  {step}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )}

                      {/* Notes */}
                      {notes && (
                        <section className={(lines.length > 0 || steps.length > 0) ? "border-t border-[var(--border)] pt-5" : ""}>
                          <h3 className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--teal)] mb-2">
                            Notes
                          </h3>
                          <p
                            className="text-[var(--foreground)] leading-[1.75] whitespace-pre-wrap"
                            style={{ fontSize: "14.5px" }}
                          >
                            {notes}
                          </p>
                        </section>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            <footer className="mt-8 pt-6 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-[var(--dark-grey)]">
                {shopName} &middot; Recipe Cards
              </span>
              <span className="text-xs text-[var(--dark-grey)]">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
