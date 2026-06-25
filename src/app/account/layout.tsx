import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_MANIFEST } from "@/lib/workspace-manifest";
import { WorkspaceProgressProvider } from "@/components/workspace/WorkspaceProgressProvider";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import { getActivePlanId } from "@/lib/plan-context";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { UiRevampProvider } from "@/components/UiRevampProvider";
import { getAccountSettings } from "@/lib/account-settings";
import {
  UI_REVAMP_COOKIE,
  UI_REVAMP_OVERRIDE_COOKIE,
  getUiRevampSetting,
  resolveUiRevamp,
} from "@/lib/ui-revamp";
import { effectivePlanForGating } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [settings, dbUiRevamp, profileRow] = await Promise.all([
    getAccountSettings(supabase, user.id),
    getUiRevampSetting(supabase, user.id),
    supabase
      .from("users")
      .select("full_name, subscription_tier, subscription_status, trial_ends_at, paused_from_tier")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const initialStatuses: Record<string, WorkspaceStatus> = {};

  // TIM-3070: use canonical getActivePlanId so the sidebar badges on /account
  // match the active plan (users.current_plan_id), not latest-by-created_at —
  // same fix as WorkspaceStatusBootstrap (TIM-2962) and the API writer.
  const activePlanId = await getActivePlanId(supabase, user.id);

  if (activePlanId) {
    const { data: rows } = await supabase
      .from("workspace_status")
      .select("component_key, status")
      .eq("plan_id", activePlanId);

    for (const row of rows ?? []) {
      if (isWorkspaceStatus(row.status)) {
        initialStatuses[row.component_key] = row.status;
      }
    }
  }

  const cookieStore = await cookies();
  const uiRevamp = resolveUiRevamp({
    dbValue: dbUiRevamp,
    overrideCookie: cookieStore.get(UI_REVAMP_OVERRIDE_COOKIE)?.value,
    mirrorCookie: cookieStore.get(UI_REVAMP_COOKIE)?.value,
  });

  const planTier = profileRow
    ? effectivePlanForGating(profileRow as {
        subscription_status: string | null;
        subscription_tier: string | null;
        paused_from_tier?: string | null;
        trial_ends_at?: string | null;
      })
    : "starter";
  const planLabel = planTier === "pro" ? "Pro" : "Starter";
  const userInfo = {
    email: user.email ?? "",
    displayName: (profileRow as { full_name?: string | null } | null)?.full_name ?? null,
    planLabel,
    uiRevampEnabled: uiRevamp,
    isPro: planTier === "pro",
  };

  return (
    <CurrencyProvider currencyCode={settings.currencyCode}>
      <UiRevampProvider value={uiRevamp}>
        <WorkspaceProgressProvider
          manifest={WORKSPACE_MANIFEST}
          initialStatuses={initialStatuses}
          userInfo={userInfo}
        >
          {children}
        </WorkspaceProgressProvider>
      </UiRevampProvider>
    </CurrencyProvider>
  );
}
