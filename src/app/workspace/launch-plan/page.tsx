// TIM-1521: Launch Plan umbrella landing page. Renders two cards — Launch
// Milestones (long-horizon, AI-generated) and Opening Month Plan (tactical
// week-by-week playbook). Each owns its own Generate/Seed CTA on its sub-page
// so a failure on one doesn't block the other (per founder request).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ClipboardList, Rocket } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LaunchPlanUmbrellaPage() {
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

  const [{ count: milestonesCount }, { count: playbookCount }] = await Promise.all([
    supabase
      .from("launch_milestones")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id),
    supabase
      .from("soft_open_plan_items")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", plan.id),
  ]);

  const cards = [
    {
      href: "/workspace/launch-plan/milestones",
      title: "Launch Milestones",
      blurb: "The dated, gating steps to opening day: lease, permits, build-out, equipment, hiring, training, soft-open dates. Can be a year or more out.",
      icon: Rocket,
      count: milestonesCount ?? 0,
      countLabel: (n: number) => (n === 1 ? "1 milestone" : `${n} milestones`),
    },
    {
      href: "/workspace/launch-plan/opening-month",
      title: "Opening Month Plan",
      blurb: "The tactical week-by-week playbook for the weeks before, opening week, and your first 30 days in the shop.",
      icon: ClipboardList,
      count: playbookCount ?? 0,
      countLabel: (n: number) => (n === 1 ? "1 task" : `${n} tasks`),
    },
  ];

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto pt-6 pb-32 sm:pt-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">Launch Plan</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Your roadmap to opening day and the first month in the shop. Pick a section to start.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group bg-white rounded-xl border border-[var(--border)] hover:border-[var(--teal)] transition-colors px-5 py-5 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
                  <h2 className="text-lg font-bold text-[var(--foreground)] leading-tight">{card.title}</h2>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed flex-1">
                  {card.blurb}
                </p>
                <p className="text-xs font-semibold text-[var(--dark-grey)]">
                  {card.count > 0 ? card.countLabel(card.count) : "Not started yet"}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
