// TIM-1741: per-account settings API (Localization group).
// GET   /api/account/settings — current account settings (defaults if unset).
// PATCH /api/account/settings — partial update of currencyCode / localization.

import { createClient } from "@/lib/supabase/server";
import {
  coerceLocalization,
  getAccountSettings,
  type LocalizationSettings,
} from "@/lib/account-settings";
import { normalizeCurrencyCode } from "@/lib/currency";
import type { NextRequest } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getAccountSettings(supabase, user.id);
  return Response.json({ data: settings });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Start from current settings so partial PATCHes never wipe the other group.
  const current = await getAccountSettings(supabase, user.id);

  const update: { currency_code?: string; localization?: LocalizationSettings } = {};

  if ("currencyCode" in body) {
    update.currency_code = normalizeCurrencyCode(body.currencyCode);
  }
  if ("localization" in body) {
    update.localization = coerceLocalization({
      ...current.localization,
      ...(body.localization as object),
    });
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "No updatable fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const settings = await getAccountSettings(supabase, user.id);
  return Response.json({ data: settings });
}
