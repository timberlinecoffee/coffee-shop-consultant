"use client";

// TIM-1911: tabbed Settings shell for /account.
// Rendered when NEXT_PUBLIC_BILLING_TAB=1; existing stacked-card page otherwise.
//
// Style-guide refs: Settings shell · left-rail nav; Cards · Plan/Payment/Invoices.
// Visual reference: src/components/ui/card.tsx; Financials page header chrome.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalizationSettingsCard } from "@/components/account/LocalizationSettingsCard";
import { BillingTab } from "@/components/account/settings/BillingTab";
import { AccountDataControls } from "@/components/account/AccountDataControls";
import { GuidedNoticesCard } from "@/components/account/GuidedNoticesCard";
import { ProfileNameEditor } from "@/components/account/ProfileNameEditor";
import { SETTINGS_TABS } from "@/components/account/settings/tabs";
import type { AccountSettings } from "@/lib/account-settings";

type Profile = {
  full_name?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  ai_credits_remaining?: number | null;
  copilot_trial_messages_used?: number | null;
};

type Props = {
  profile: Profile | null;
  userEmail: string | null;
  accountSettings: AccountSettings;
  tierDisplayName: string;
  isTrial: boolean;
  trialRemaining: number;
};

export function SettingsShell({
  profile,
  userEmail,
  accountSettings,
  tierDisplayName,
  isTrial,
  trialRemaining,
}: Props) {
  const [activeTab, setActiveTab] = useState("account");

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-8">
          Settings
        </h1>

        <div className="flex gap-8">
          {/* Left-rail nav */}
          <nav aria-label="Settings categories" className="w-44 flex-shrink-0">
            <ul className="space-y-0.5">
              {SETTINGS_TABS.map((tab) => (
                <li key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={activeTab === tab.id ? "page" : undefined}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeTab === tab.id
                        ? "bg-[var(--teal-bg-100)] text-[var(--teal)] font-medium"
                        : "text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0 space-y-6">
            {activeTab === "account" && (
              <AccountTabContent
                profile={profile}
                userEmail={userEmail}
                tierDisplayName={tierDisplayName}
                isTrial={isTrial}
                trialRemaining={trialRemaining}
              />
            )}
            {activeTab === "localization" && (
              <LocalizationSettingsCard initial={accountSettings} />
            )}
            {activeTab === "billing" && <BillingTab />}
            {activeTab === "notifications" && (
              <StubTab label="Notifications" />
            )}
            {activeTab === "business-profile" && (
              <StubTab label="Business profile" />
            )}
            {activeTab === "preferences" && (
              <GuidedNoticesCard variant="tab" />
            )}
            {activeTab === "data" && (
              userEmail ? (
                <AccountDataControls userEmail={userEmail} variant="tab" />
              ) : (
                <StubTab label="Data" />
              )
            )}
            {activeTab === "appearance" && <StubTab label="Appearance" />}
          </div>
        </div>
      </div>
    </div>
  );
}

type AccountTabProps = {
  profile: Profile | null;
  userEmail: string | null;
  tierDisplayName: string;
  isTrial: boolean;
  trialRemaining: number;
};

function AccountTabContent({
  profile,
  userEmail,
  tierDisplayName,
  isTrial,
  trialRemaining,
}: AccountTabProps) {
  return (
    <>
      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-[var(--dark-grey)]">Name</span>
              <ProfileNameEditor initialName={profile?.full_name ?? null} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Email</span>
              <span className="text-[var(--foreground)]">{userEmail}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Subscription card */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">Plan</span>
              <span className="text-[var(--foreground)]">{tierDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--dark-grey)]">AI coaching</span>
              <span className="text-[var(--foreground)]">
                {isTrial
                  ? `${Math.max(0, trialRemaining)} of 5 trial messages left`
                  : `${profile?.ai_credits_remaining ?? 0} messages left this month`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete account moved to the Data tab (TIM-2254). */}

      {/* Sign out */}
      <form action="/auth/signout" method="POST">
        <button
          type="submit"
          className="text-sm text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
        >
          Sign Out
        </button>
      </form>
    </>
  );
}

function StubTab({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm font-medium text-[var(--foreground)] mb-1">
          {label}
        </p>
        <p className="text-sm text-[var(--muted-foreground)]">Coming soon</p>
      </CardContent>
    </Card>
  );
}
