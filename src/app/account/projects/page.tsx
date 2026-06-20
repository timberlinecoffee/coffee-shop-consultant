// TIM-2378 2G-C: Account → Projects management page.
// Lists all user projects, allows rename and typed-name delete.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { effectivePlanForGating } from "@/lib/access";
import { ProjectsTable } from "./_components/projects-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Projects | My Coffee Shop Consultant" };

export default async function AccountProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: plans }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "subscription_status, subscription_tier, trial_ends_at, paused_from_tier, current_plan_id",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("coffee_shop_plans")
      .select("id, plan_name, location_label, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const activePlanId = profile?.current_plan_id ?? plans?.[0]?.id ?? null;

  const projects = (plans ?? []).map((p) => ({
    id: p.id,
    name: p.plan_name ?? "Untitled Project",
    locationLabel: p.location_label ?? null,
    createdAt: p.created_at,
    isActive: p.id === activePlanId,
  }));

  const isPro = profile
    ? effectivePlanForGating(
        profile as {
          subscription_status: string | null;
          subscription_tier: string | null;
          paused_from_tier?: string | null;
          trial_ends_at?: string | null;
        },
      ) === "pro"
    : false;

  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="flex items-center gap-2 text-sm text-[var(--dark-grey)]">
          <Link
            href="/account"
            className="hover:text-[var(--foreground)] transition-colors"
          >
            Account
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[var(--foreground)]">Projects</span>
        </div>

        <h1 className="text-3xl font-bold text-[var(--foreground)]">
          Projects
        </h1>

        <ProjectsTable initialProjects={projects} isPro={isPro} />
      </div>
    </div>
  );
}
