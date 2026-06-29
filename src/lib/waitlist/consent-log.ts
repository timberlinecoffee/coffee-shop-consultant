// TIM-3448: CASL s.10(1) consent audit trail writer.
//
// Inserts one row into email_consent_log per signup or backfill event.
// Uses service-role client (BYPASSRLS) — table has no public access.
// Never throws — failures are logged server-side, never surfaced to callers.

import { createServiceClient } from "@/lib/supabase/service";

export type ConsentSource = "waitlist_signup" | "waitlist_backfill_pre_casl" | "signup_form";
export type ConsentType = "express" | "implied";

export interface WriteConsentRecordInput {
  email: string;
  consentType: ConsentType;
  consentSource: ConsentSource;
  marketingOptedIn: boolean;
  klaviyoSubscribed?: boolean | null;
  klaviyoProfileId?: string | null;
  ipAddress?: string | null;
  consentedAt?: Date;
}

export async function writeConsentRecord(
  input: WriteConsentRecordInput,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("email_consent_log").insert({
    email: input.email,
    consent_type: input.consentType,
    consent_source: input.consentSource,
    marketing_opted_in: input.marketingOptedIn,
    klaviyo_subscribed: input.klaviyoSubscribed ?? null,
    klaviyo_profile_id: input.klaviyoProfileId ?? null,
    ip_address: input.ipAddress ?? null,
    consented_at: (input.consentedAt ?? new Date()).toISOString(),
  });
  if (error) {
    console.error("[consent-log] insert failed:", error.message, error.code);
  }
}
