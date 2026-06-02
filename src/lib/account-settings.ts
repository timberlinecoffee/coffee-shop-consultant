// TIM-1741: Account-level settings helper.
// Reads the user's platform currency preference from financial_models so the
// CurrencyProvider can be hydrated server-side without a separate settings table.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCurrencyCode } from "@/lib/currency";

export interface AccountSettings {
  currencyCode: string;
}

export async function getAccountSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<AccountSettings> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan?.id) return { currencyCode: "USD" };

  const { data: model } = await supabase
    .from("financial_models")
    .select("forecast_inputs")
    .eq("plan_id", plan.id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawCode = (model?.forecast_inputs as any)?.currency_code;
  return { currencyCode: normalizeCurrencyCode(rawCode) };
}
