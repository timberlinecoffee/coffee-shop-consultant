import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveNext } from "@/lib/safe-next";
import { buildSessionExpiredLoginUrl } from "@/lib/session-expired";
import { WORKSPACE_MANIFEST } from "@/lib/workspace-manifest";
import { WorkspaceProgressProvider } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceStatusBootstrap } from "@/components/workspace/WorkspaceStatusBootstrap";
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

// TIM-2461: shared shell for every authenticated surface. The sidebar mounts
// here so it persists across /dashboard ↔ /workspace/* transitions instead of
// remounting in each leaf layout.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // TIM-2730: a stale-refresh-token wipe (see TIM-2352) bounces an in-flight
    // workspace visit through this layout. Preserve the original pathname +
    // query as ?next= so the visitor lands back where they were headed after
    // re-login (e.g. `/workspace/financials?ui=v2`), not on /dashboard. The
    // proxy injects x-gw-pathname/x-gw-search on every passed-through request;
    // resolveNext applies the same path-only allowlist used by /auth/callback
    // and rejects absolute / protocol-relative URLs (open-redirect guard).
    // TIM-2732: also append `expired=1` so /login can surface a
    // session-expiry banner — without this signal the visitor reads the bounce
    // as "the page never loaded" (the symptom that prompted TIM-2721).
    const h = await headers();
    const pathname = h.get("x-gw-pathname") ?? "";
    const search = h.get("x-gw-search") ?? "";
    const safeNext = resolveNext(`${pathname}${search}`);
    redirect(buildSessionExpiredLoginUrl(safeNext));
  }

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

  // TIM-2589: resolve the effective flag for this request. proxy.ts has
  // already written the ?ui= URL param into the override cookie, so we just
  // read both cookies here — no URL param access needed in the layout.
  const cookieStore = await cookies();
  const uiRevamp = resolveUiRevamp({
    dbValue: dbUiRevamp,
    overrideCookie: cookieStore.get(UI_REVAMP_OVERRIDE_COOKIE)?.value,
    mirrorCookie: cookieStore.get(UI_REVAMP_COOKIE)?.value,
  });

  // TIM-2590: derive user info for SidebarV2 ProfileMenu.
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
  };

  return (
    <CurrencyProvider currencyCode={settings.currencyCode}>
      <UiRevampProvider value={uiRevamp}>
        <WorkspaceProgressProvider
          manifest={WORKSPACE_MANIFEST}
          initialStatuses={{}}
          userInfo={userInfo}
        >
          <Suspense fallback={null}>
            <WorkspaceStatusBootstrap userId={user.id} />
          </Suspense>
          {children}
        </WorkspaceProgressProvider>
      </UiRevampProvider>
    </CurrencyProvider>
  );
}
