import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { buildNavItems } from "@/lib/workspace-manifest";
import { capitalizeFirst } from "@/lib/format";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import { ConceptUnlockNote } from "./_components/concept-unlock-note";
import { DashboardHero } from "./_components/dashboard-hero";
import { WorkspaceNav } from "./_components/workspace-nav";
import { DashboardCoPilot } from "./_components/dashboard-copilot";
import { TrialBanner } from "./_components/trial-banner";
import { WelcomeToast } from "./_components/welcome-toast";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import { isTrialActive } from "@/lib/access";
import { Logo } from "../_components/Logo";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: plan }] = await Promise.all([
    supabase
      .from("users")
      .select("full_name, onboarding_completed, subscription_status, subscription_tier, trial_ends_at, trial_just_converted_to")
      .eq("id", user.id)
      .single(),
    supabase
      .from("coffee_shop_plans")
      .select("id, latest_readiness_check, latest_readiness_check_at")
      .eq("user_id", user.id)
      .single(),
  ]);

  const rawName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0];
  const firstName = rawName ? capitalizeFirst(rawName) : "there";

  if (profile && !profile.onboarding_completed) {
    redirect("/onboarding");
  }

  // TIM-1147: workspace progress is the manual 3-state status the founder
  // controls.
  const statusByKey = new Map<string, WorkspaceStatus>();

  if (plan?.id) {
    const { data: statusRows } = await supabase
      .from("workspace_status")
      .select("component_key, status")
      .eq("plan_id", plan.id);

    for (const row of statusRows ?? []) {
      if (isWorkspaceStatus(row.status)) {
        statusByKey.set(row.component_key, row.status);
      }
    }
  }

  // Concept completion gates the unlock note.
  const w1Completed = (statusByKey.get("concept") ?? "not_started") === "complete";

  // TIM-1268: workspace nav grouped by category, mirroring the sidebar. Uses
  // the shared manifest source of truth so the grouping cannot drift.
  const navItems = buildNavItems(statusByKey);

  // All downstream modules unlock simultaneously when concept is complete
  const allUnlocked = w1Completed;

  const cookieStore = await cookies();
  const noteDismissed = cookieStore.get("concept_unlock_note_dismissed")?.value === "1";
  const showUnlockNote = allUnlocked && !noteDismissed;

  // TIM-736: readiness check banner data
  type ReadinessOverall = "green" | "yellow" | "red";
  const readinessCheck = plan?.latest_readiness_check as { overall?: ReadinessOverall } | null | undefined;
  const readinessAt = plan?.latest_readiness_check_at ?? null;
  const readinessOverall: ReadinessOverall | null = readinessCheck?.overall ?? null;
  // Show banner only if check is recent (within 7 days)
  const readinessBannerVisible =
    readinessOverall !== null &&
    readinessAt !== null &&
    Date.now() - new Date(readinessAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  const READINESS_COLORS: Record<ReadinessOverall, { bg: string; text: string; dot: string; label: string }> = {
    green: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500", label: "On track" },
    yellow: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", dot: "bg-amber-400", label: "Gaps to address" },
    red: { bg: "bg-red-50 border-red-200", text: "text-red-800", dot: "bg-red-500", label: "Critical blockers" },
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-16 lg:pb-0">
      {/* Top bar */}
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center" aria-label="Groundwork home">
            <Logo variant="color" height={28} priority />
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/account" className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors">Account</Link>
            <form action="/auth/signout" method="POST">
              <button type="submit" className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors">Sign Out</button>
            </form>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* TIM-1903: Persistent trial banner — days left + CTA to /pricing. */}
        {profile?.subscription_status === "free_trial" &&
          isTrialActive(profile.trial_ends_at) && (
            <TrialBanner
              trialEndsAt={profile.trial_ends_at as string}
              chosenTier={
                profile.subscription_tier === "pro" ? "pro" : "starter"
              }
            />
          )}

        {/* TIM-1903: One-time "Welcome to {plan}" toast on the first dashboard
            load after a trial converts to a paid subscription. */}
        {profile?.trial_just_converted_to && (
          <WelcomeToast
            planName={
              PLAN_DISPLAY_NAMES[
                profile.trial_just_converted_to as string
              ] ?? "Pro"
            }
          />
        )}

        {/* TIM-736: Launch readiness banner */}
        {readinessBannerVisible && readinessOverall && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-6 ${READINESS_COLORS[readinessOverall].bg}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${READINESS_COLORS[readinessOverall].dot}`} />
            <p className={`text-xs font-medium flex-1 ${READINESS_COLORS[readinessOverall].text}`}>
              Last readiness check: <span className="font-semibold">{READINESS_COLORS[readinessOverall].label}</span>
              {readinessAt && (
                <span className="font-normal opacity-70">
                  {" · "}
                  {new Date(readinessAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </p>
            <Link
              href="/workspace/launch-plan"
              className={`text-xs font-semibold flex-shrink-0 hover:underline ${READINESS_COLORS[readinessOverall].text}`}
            >
              View results →
            </Link>
          </div>
        )}

        {/* TIM-1268: personable hero — time-of-day greeting + rotating fact. */}
        <DashboardHero firstName={firstName} />

        {/* TIM-1268: workspace display grouped by category, mirroring the
            sidebar. Replaces the old numbered "Start Here" + "Coming Up" lists. */}
        <ConceptUnlockNote show={showUnlockNote} />
        <WorkspaceNav items={navItems} />
      </div>
      {/* TIM-1788: Scout reachable from the dashboard (no suite open). */}
      {plan?.id && <DashboardCoPilot planId={plan.id} />}
      <BottomTabBar />
    </div>
  );
}
