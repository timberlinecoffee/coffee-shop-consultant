// TIM-1663: Renewal-reminder dispatch logic.
//
// TIM-1660 lets annual subscribers opt in for a reminder before their plan
// renews. The opt-in writes a row into user_ui_prefs:
//   pref_key  = "renewal-reminder"
//   pref_data = { optedIn: true, email, optedInAt }
//
// This module holds the pure selection logic the cron route uses to decide who
// is due a reminder. It deliberately knows nothing about Supabase, Stripe, or
// the email channel so it can be unit-tested in isolation. The route layer
// resolves the data, runs the annual-interval check (authoritative, via Stripe),
// and fires the send.

export const RENEWAL_REMINDER_PREF_KEY = "renewal-reminder";

// Klaviyo metric the cron fires for each due subscriber. A Klaviyo flow keyed on
// this metric owns the actual email copy/template (channel-neutral, Voice
// Mandate lives in the flow, not in code).
export const RENEWAL_REMINDER_METRIC = "Renewal Reminder Due";

// Default lead time. Override per deploy with RENEWAL_REMINDER_DAYS.
export const DEFAULT_REMINDER_DAYS = 7;

// Shape written by POST /api/account/renewal-reminder (TIM-1660), plus the
// remindedForPeriodEnd / remindedAt fields this job stamps after a send.
export interface RenewalReminderPrefData {
  optedIn: boolean;
  email: string;
  optedInAt: string;
  // ISO current_period_end the last reminder was sent for. Used for idempotency:
  // a row is skipped while this equals the current period end, and re-arms
  // automatically when the subscription rolls into its next annual period.
  remindedForPeriodEnd?: string | null;
  remindedAt?: string | null;
}

export interface PrefRow {
  userId: string;
  prefData: RenewalReminderPrefData;
}

export interface SubscriptionRow {
  userId: string;
  // 'active' | 'cancelled' | 'past_due' | 'trialing' | 'paused'
  status: string;
  currentPeriodEnd: string | null;
}

export interface DueReminder {
  userId: string;
  email: string;
  currentPeriodEnd: string;
}

const ELIGIBLE_STATUSES = new Set(["active", "trialing"]);

function daysUntil(target: string, now: Date): number {
  const ms = new Date(target).getTime() - now.getTime();
  return ms / 86_400_000;
}

/**
 * Selects opted-in subscribers whose renewal falls within `withinDays` and who
 * have not already been reminded for the current period. Does NOT check that the
 * plan is still annual — that requires the authoritative Stripe interval and is
 * applied by the route on this (small) candidate set.
 */
export function selectDateEligible(
  prefs: PrefRow[],
  subscriptions: SubscriptionRow[],
  now: Date,
  withinDays: number = DEFAULT_REMINDER_DAYS,
): DueReminder[] {
  const subByUser = new Map<string, SubscriptionRow>();
  for (const sub of subscriptions) subByUser.set(sub.userId, sub);

  const due: DueReminder[] = [];
  for (const { userId, prefData } of prefs) {
    if (!prefData?.optedIn) continue;
    if (!prefData.email) continue;

    const sub = subByUser.get(userId);
    if (!sub) continue;
    // Excludes cancelled / past_due / paused subscribers.
    if (!ELIGIBLE_STATUSES.has(sub.status)) continue;
    if (!sub.currentPeriodEnd) continue;

    // Idempotency: already reminded for this exact period end.
    if (prefData.remindedForPeriodEnd === sub.currentPeriodEnd) continue;

    const lead = daysUntil(sub.currentPeriodEnd, now);
    // Renewal is in the future and within the lead window.
    if (lead < 0 || lead > withinDays) continue;

    due.push({ userId, email: prefData.email, currentPeriodEnd: sub.currentPeriodEnd });
  }
  return due;
}
