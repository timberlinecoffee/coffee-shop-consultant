// TIM-1417: Marketing planning — print view.
// Plain, high-contrast layout meant to be printed or saved as PDF.
// Server-rendered. No nav, no AI, no editing.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  normalizeMarketing,
  isMarketingEmpty,
  MARKETING_SECTION_LABELS,
} from "@/lib/marketing";
import { PrintButton } from "./print-button";
import { getActivePlanId } from "@/lib/plan-context";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function MarketingPrintPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const planId = await getActivePlanId(supabase, user.id);
  if (!planId) redirect("/onboarding");
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("plan_name")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) redirect("/onboarding");

  const { data: doc } = await supabase
    .from("workspace_documents")
    .select("content, updated_at")
    .eq("plan_id", planId)
    .eq("workspace_key", "marketing")
    .maybeSingle();

  const marketing = normalizeMarketing(doc?.content);
  const empty = isMarketingEmpty(marketing);
  const updatedAt = doc?.updated_at ?? null;
  const shopName = plan.plan_name?.trim() || "Your Coffee Shop";

  return (
    <div className="bg-white min-h-screen text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-8 py-10 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-8 print:hidden">
          <h1 className="text-2xl font-bold">Marketing Plan</h1>
          <PrintButton />
        </div>
        <header className="mb-10 border-b border-[var(--border)] pb-6">
          <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
            Marketing Plan
          </p>
          <h2 className="text-3xl font-bold mb-1">{shopName}</h2>
          {updatedAt && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Last updated {new Date(updatedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
        </header>

        {empty ? (
          <p className="text-sm italic text-[var(--muted-foreground)]">
            No marketing plan written yet. Visit the Marketing workspace and add
            an overview, channels, story, or pre-launch milestones to populate
            this view.
          </p>
        ) : (
          <div className="space-y-10">
            {marketing.overview.narrative.trim() && (
              <section>
                <h3 className="text-sm uppercase tracking-wider text-[var(--muted-foreground)] mb-3 font-semibold">
                  {MARKETING_SECTION_LABELS.overview}
                </h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {marketing.overview.narrative.trim()}
                </p>
              </section>
            )}

            {(marketing.story.founder_story.trim() ||
              marketing.story.origin.trim() ||
              marketing.story.differentiator.trim() ||
              marketing.story.target_customer.trim()) && (
              <section>
                <h3 className="text-sm uppercase tracking-wider text-[var(--muted-foreground)] mb-3 font-semibold">
                  {MARKETING_SECTION_LABELS.story}
                </h3>
                {marketing.story.founder_story.trim() && (
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                      Founder Story
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {marketing.story.founder_story.trim()}
                    </p>
                  </div>
                )}
                {marketing.story.origin.trim() && (
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                      Origin
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {marketing.story.origin.trim()}
                    </p>
                  </div>
                )}
                {marketing.story.differentiator.trim() && (
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                      What Makes Us Different
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {marketing.story.differentiator.trim()}
                    </p>
                  </div>
                )}
                {marketing.story.target_customer.trim() && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)] mb-1">
                      Who It Is For
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {marketing.story.target_customer.trim()}
                    </p>
                  </div>
                )}
              </section>
            )}

            {marketing.channels.selected.length > 0 && (
              <section>
                <h3 className="text-sm uppercase tracking-wider text-[var(--muted-foreground)] mb-3 font-semibold">
                  {MARKETING_SECTION_LABELS.channels}
                </h3>
                <ul className="divide-y divide-[var(--border)]">
                  {marketing.channels.selected.map((c, i) => (
                    <li key={i} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.notes.trim() && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed whitespace-pre-wrap">
                          {c.notes.trim()}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {marketing.pre_launch.milestones.length > 0 && (
              <section>
                <h3 className="text-sm uppercase tracking-wider text-[var(--muted-foreground)] mb-3 font-semibold">
                  {MARKETING_SECTION_LABELS.pre_launch}
                </h3>
                <ul className="divide-y divide-[var(--border)]">
                  {marketing.pre_launch.milestones.map((m) => (
                    <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium">
                          {m.completed ? "[x] " : "[ ] "}
                          {m.label || "(Untitled milestone)"}
                        </p>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {formatDate(m.target_date)}
                        </span>
                      </div>
                      {m.notes.trim() && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed whitespace-pre-wrap">
                          {m.notes.trim()}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              @page { margin: 1.8cm 2cm; size: A4; }
              section { break-inside: avoid; }
            }
          `,
        }}
      />
    </div>
  );
}
