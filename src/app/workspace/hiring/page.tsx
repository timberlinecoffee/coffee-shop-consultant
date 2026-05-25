// TIM-965: Hiring & Onboarding Suite workspace page.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isSubscriptionActive } from "@/lib/access";
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
  ]);

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
    />
  );
}
