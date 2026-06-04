import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { getAccountSettings } from "@/lib/account-settings";

export const dynamic = "force-dynamic";

// TIM-1748: CurrencyProvider hydrated server-side so all plan module money
// display uses the account's selected currency instead of a hardcoded "$".
export default async function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const settings = await getAccountSettings(supabase, user.id);

  return (
    <CurrencyProvider currencyCode={settings.currencyCode}>
      {children}
    </CurrencyProvider>
  );
}
