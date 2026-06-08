import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";
import { getAccountSettings } from "@/lib/account-settings";
import { LocalizationSettingsCard } from "@/components/account/LocalizationSettingsCard";
import { ProFeatureEntries } from "@/components/account/ProFeatureEntries";
import { AccountDataControls } from "@/components/account/AccountDataControls";
import { GuidedNoticesCard } from "@/components/account/GuidedNoticesCard";
import { effectivePlanForGating } from "@/lib/access";
import { SettingsShell } from "@/components/account/settings/SettingsShell";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Account | My Coffee Shop Consultant" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, subscription_tier, subscription_status, trial_ends_at, ai_credits_remaining, copilot_trial_messages_used, readiness_score")
    .eq("id", user.id)
    .single();

  // TIM-1956: surface Pro-feature entry points (Office Hours, multi-project)
  // for Starter users with locked-state CTAs that open the upgrade prompt.
  // Trialists and Pro see them as included.
  const isPro = profile
    ? effectivePlanForGating({
        subscription_status: profile.subscription_status,
        subscription_tier: profile.subscription_tier,
        trial_ends_at: profile.trial_ends_at,
      }) === "pro"
    : false;

  const accountSettings = await getAccountSettings(supabase, user.id);

  const tierDisplayName = PLAN_DISPLAY_NAMES[profile?.subscription_tier ?? "free"] ?? "Free";
  const FREE_TRIAL_COPILOT_LIMIT = 5;
  const isTrial = profile?.subscription_status === "free_trial";
  const trialRemaining = FREE_TRIAL_COPILOT_LIMIT - (profile?.copilot_trial_messages_used ?? 0);

  // TIM-1911: tabbed shell behind feature flag; default off until prod verify (TIM-1910c).
  if (process.env.NEXT_PUBLIC_BILLING_TAB === "1") {
    return (
      <SettingsShell
        profile={profile}
        userEmail={user.email ?? null}
        accountSettings={accountSettings}
        tierDisplayName={tierDisplayName}
        isTrial={isTrial}
        trialRemaining={trialRemaining}
      />
    );
  }

  const userEmail = user.email ?? "";

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

        <LocalizationSettingsCard initial={accountSettings} />

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

        <ProFeatureEntries isPro={isPro} />

        {/* TIM-2434: Imported Documents entry. Persistent access to
            re-import, re-run extraction, or remove past imports. */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-6">
          <h2 className="font-semibold text-[var(--foreground)] mb-2">
            Imported Documents
          </h2>
          <p className="text-sm text-[var(--dark-grey)] mb-4">
            Upload existing business plans, financials, or branding files.
            We&apos;ll map them into your planning suites.
          </p>
          <Link
            href="/account/documents"
            className="inline-block text-sm text-[var(--teal)] font-medium hover:underline"
          >
            Manage imports →
          </Link>
        </div>

        <GuidedNoticesCard variant="stacked-card" />

        <AccountDataControls userEmail={userEmail} variant="stacked-card" />

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
