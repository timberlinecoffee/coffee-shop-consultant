import { createClient } from "@/lib/supabase/server";
import { CurrencyProvider } from "@/components/CurrencyProvider";
import { getAccountSettings } from "@/lib/account-settings";

export const dynamic = "force-dynamic";

// TIM-1748: CurrencyProvider hydrated server-side so all plan module money
// display uses the account's selected currency instead of a hardcoded "$".
// TIM-2580: Auth gate moved to the page level so unauthenticated visitors can
// reach /plan/1 as a free preview without being dead-ended here.
export default async function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currencyCode = user
    ? (await getAccountSettings(supabase, user.id)).currencyCode
    : "USD";

  return (
    <CurrencyProvider currencyCode={currencyCode}>
      {children}
    </CurrencyProvider>
  );
}
