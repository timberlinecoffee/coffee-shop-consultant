// TIM-1061: Operations Playbook — print view.
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
  type SopChecklistItem,
} from "@/lib/operations-playbook";
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

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", plan.id)
    .eq("workspace_key", "operations_playbook")
    .maybeSingle();

  const stored = normalizeOperationsPlaybook(doc?.content);
  const playbook = isPlaybookEmpty(stored) ? seededPlaybook() : stored;
  const updatedAt = doc?.updated_at ?? null;

  return (
    <div className="bg-white min-h-screen text-[#1a1a1a]">
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
            <p className="text-xs text-[#6b6b6b]">
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
                <h2 className="text-xl font-bold mb-1 border-b-2 border-[#155e63] pb-1">
                  {SOP_CATEGORY_LABELS[key]}
                </h2>
                <p className="text-xs text-[#6b6b6b] mb-2 italic">
                  {SOP_CATEGORY_TAGLINES[key]}
                </p>
                {cat.intro && (
                  <p className="text-sm text-[#1a1a1a] leading-relaxed mb-4">
                    {cat.intro}
                  </p>
                )}
                <CategoryItems items={cat.items} groupByStation={key === "cleaning"} />
              </section>
            );
          })}
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
      <p className="text-sm text-[#afafaf] italic">No steps yet.</p>
    );
  }

  if (!groupByStation) {
    return (
      <ol className="space-y-1.5 pl-5 list-decimal text-sm">
        {items.map((item) => (
          <li key={item.id} className="leading-snug">
            <span className="inline-block align-top w-3 h-3 border border-[#1a1a1a] rounded-sm mr-2 print:mr-2" />
            {item.text}
            {item.duration_min != null && (
              <span className="text-xs text-[#6b6b6b] ml-2">
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
            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#155e63] mb-1.5">
              {station}
            </h3>
            {(["daily", "weekly", "monthly"] as const).map((cad) =>
              grouped[cad].length === 0 ? null : (
                <div key={cad} className="mb-2 ml-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#6b6b6b] mb-1">
                    {cad}
                  </p>
                  <ul className="space-y-1 pl-1 text-sm">
                    {grouped[cad].map((item) => (
                      <li key={item.id} className="leading-snug flex gap-2">
                        <span className="inline-block w-3 h-3 border border-[#1a1a1a] rounded-sm flex-shrink-0 mt-1" />
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
