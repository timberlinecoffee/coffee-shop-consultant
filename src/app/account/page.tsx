import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Account | My Coffee Shop Consultant" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, subscription_tier, subscription_status, ai_credits_remaining, copilot_trial_messages_used, readiness_score")
    .eq("id", user.id)
    .single();

  const tierDisplayName = PLAN_DISPLAY_NAMES[profile?.subscription_tier ?? "free"] ?? "Free";
  const FREE_TRIAL_COPILOT_LIMIT = 5;
  const isTrial = profile?.subscription_status === "free_trial";
  const trialRemaining = FREE_TRIAL_COPILOT_LIMIT - (profile?.copilot_trial_messages_used ?? 0);

  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Account Settings</h1>

        <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Profile</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Name</span>
              <span className="text-[var(--foreground)]">{profile?.full_name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Email</span>
              <span className="text-[var(--foreground)]">{user.email}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Subscription</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Plan</span>
              <span className="text-[var(--foreground)]">{tierDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">AI coaching</span>
              <span className="text-[var(--foreground)]">
                {isTrial
                  ? `${Math.max(0, trialRemaining)} of ${FREE_TRIAL_COPILOT_LIMIT} trial messages left`
                  : `${profile?.ai_credits_remaining ?? 0} messages left this month`}
              </span>
            </div>
          </div>
          <Link
            href="/account/billing"
            className="mt-4 inline-block text-sm text-[var(--teal)] font-medium hover:underline"
          >
            Manage Billing →
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-4">Delete Account</h2>
          <p className="text-sm text-[var(--dark-grey)] mb-4">
            Permanently delete your account and all plan data. This cannot be undone.
          </p>
          <button className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors">
            Delete My Account
          </button>
        </div>

        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}
