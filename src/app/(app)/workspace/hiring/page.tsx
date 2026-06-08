// TIM-965: Hiring & Onboarding Suite workspace page.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
import { resolvePlanMinimumWage } from "@/lib/wages/resolve-plan-geo";
import { HiringWorkspace } from "./hiring-workspace";
import type {
  OrgRole,
  InterviewCandidate,
  InterviewQuestion,
  InterviewScore,
  OnboardingPlanInstance,
  OnboardingTask,
  StaffCompetency,
  StaffFile,
  CompetencyEvaluation,
  PlanHiringSettings,
  HiringRequirementSet,
  HiringCountry,
} from "@/lib/hiring";

export const dynamic = "force-dynamic";

export default async function HiringWorkspacePage() {
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

  const planId = plan.id;

  const [
    { data: rolesData },
    { data: candidatesData },
    { data: questionsData },
    { data: scoresData },
    { data: instancesData },
    { data: tasksData },
    { data: competenciesData },
    { data: staffData },
    { data: evalsData },
    { data: profile },
    { data: hiringSettingsData },
    { data: locationCandidatesData },
  ] = await Promise.all([
    supabase
      .from("hiring_plan_roles")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true }),
    supabase
      .from("interview_candidates")
      .select("*")
      .eq("plan_id", planId)
      .order("position", { ascending: true }),
    supabase
      .from("interview_questions")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true }),
    // RLS on interview_scores filters to this plan's candidates automatically
    supabase.from("interview_scores").select("*"),
    supabase
      .from("onboarding_plan_instances")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true }),
    // RLS on onboarding_tasks filters to this plan's instances automatically
    supabase.from("onboarding_tasks").select("*").order("order_index", { ascending: true }),
    supabase
      .from("staff_competencies")
      .select("*")
      .eq("plan_id", planId)
      .order("order_index", { ascending: true }),
    supabase
      .from("staff_files")
      .select("*")
      .eq("plan_id", planId)
      .order("created_at", { ascending: true }),
    // RLS on competency_evaluations filters to this plan's staff_files automatically
    supabase.from("competency_evaluations").select("*"),
    supabase
      .from("users")
      .select("subscription_status, subscription_tier, copilot_trial_messages_used")
      .eq("id", user.id)
      .maybeSingle(),
    // TIM-1300: Plan hiring settings (country override)
    supabase
      .from("plan_hiring_settings")
      .select("hiring_country")
      .eq("plan_id", planId)
      .maybeSingle(),
    // TIM-1300: Location candidates for country auto-detect
    supabase
      .from("location_candidates")
      .select("country, status, archived, position")
      .eq("plan_id", planId)
      .not("country", "is", null)
      .order("position", { ascending: true }),
  ]);

  // Derive effective country: override → signed candidate → first non-archived
  function normalizeCountry(raw: string | null): HiringCountry | null {
    if (!raw) return null;
    const upper = raw.toUpperCase().trim() as HiringCountry;
    const supported: HiringCountry[] = ["US", "GB", "CA", "AU"];
    if (supported.includes(upper)) return upper;
    const MAP: Record<string, HiringCountry> = {
      "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US", "USA": "US",
      "UNITED KINGDOM": "GB", "UK": "GB", "GREAT BRITAIN": "GB",
      "ENGLAND": "GB", "SCOTLAND": "GB", "WALES": "GB",
      "CANADA": "CA", "AUSTRALIA": "AU",
    };
    return MAP[upper] ?? null;
  }

  const hiringCountryOverride = (hiringSettingsData?.hiring_country ?? null) as HiringCountry | null;
  const candidates_for_country = locationCandidatesData ?? [];
  let effectiveCountry: HiringCountry | null = hiringCountryOverride;
  if (!effectiveCountry) {
    const signed = candidates_for_country.find((c) => c.status === "signed");
    effectiveCountry = normalizeCountry(signed?.country ?? null);
    if (!effectiveCountry) {
      const first = candidates_for_country.find((c) => !c.archived);
      effectiveCountry = normalizeCountry(first?.country ?? null);
    }
  }

  // Load requirement sets for the effective country (if any)
  let initialRequirementSets: HiringRequirementSet[] = [];
  if (effectiveCountry) {
    const { data: reqSets } = await supabase
      .from("hiring_requirement_sets")
      .select("*")
      .eq("country_code", effectiveCountry)
      .eq("is_system", true)
      .order("order_index", { ascending: true });
    initialRequirementSets = (reqSets ?? []) as HiringRequirementSet[];
  }

  const initialHiringSettings: PlanHiringSettings = {
    hiring_country: hiringCountryOverride,
    effective_country: effectiveCountry,
  };

  // TIM-2518: resolve the local minimum wage from plan_hiring_settings +
  // location_candidates so the comp wage input can warn on sub-minimum entries.
  const planMinimumWage = await resolvePlanMinimumWage(supabase, planId);

  const canEdit = isSubscriptionActive(profile?.subscription_status);
  const initialTrialMessagesUsed =
    profile?.subscription_tier === "free"
      ? (profile.copilot_trial_messages_used ?? 0)
      : undefined;

  return (
    <HiringWorkspace
      planId={planId}
      canEdit={canEdit}
      initialTrialMessagesUsed={initialTrialMessagesUsed}
      initialRoles={(rolesData ?? []) as OrgRole[]}
      initialCandidates={(candidatesData ?? []) as InterviewCandidate[]}
      initialQuestions={(questionsData ?? []) as InterviewQuestion[]}
      initialScores={(scoresData ?? []) as InterviewScore[]}
      initialOnboardingInstances={(instancesData ?? []) as OnboardingPlanInstance[]}
      initialOnboardingTasks={(tasksData ?? []) as OnboardingTask[]}
      initialCompetencies={(competenciesData ?? []) as StaffCompetency[]}
      initialStaffFiles={(staffData ?? []) as StaffFile[]}
      initialCompetencyEvals={(evalsData ?? []) as CompetencyEvaluation[]}
      initialHiringSettings={initialHiringSettings}
      initialRequirementSets={initialRequirementSets}
      minimumWage={planMinimumWage}
    />
  );
}
