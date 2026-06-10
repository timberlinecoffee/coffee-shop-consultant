import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildManifestForRevamp } from "@/lib/workspace-manifest";
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

  if (!user) redirect("/login");

  const [settings, dbUiRevamp] = await Promise.all([
    getAccountSettings(supabase, user.id),
    getUiRevampSetting(supabase, user.id),
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

  return (
    <CurrencyProvider currencyCode={settings.currencyCode}>
      <UiRevampProvider value={uiRevamp}>
        <WorkspaceProgressProvider
          manifest={buildManifestForRevamp(uiRevamp)}
          initialStatuses={{}}
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
