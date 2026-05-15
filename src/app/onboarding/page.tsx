import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "./onboarding-flow";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Let's get to know you | My Coffee Shop Consultant",
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("onboarding_completed, full_name")
    .eq("id", user.id)
    .single();

  if (profile?.onboarding_completed) redirect("/dashboard");

  return <OnboardingFlow userId={user.id} />;
}
