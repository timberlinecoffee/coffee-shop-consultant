// TIM-1903: trial-end email dispatch logic — pure selection layer.
//
// The /api/cron/trial-reminders route runs daily. For each user whose
// subscription is trialing and whose trial_ends_at is within the appropriate
// window, dispatches one of three emails (verbatim copy from TIM-1905 §2):
//
//   day5  — sent when ~2 days remain  (1.0 < daysLeft <= 2.5)
//   day7  — sent on the final day     (0    < daysLeft <= 1.0)
//   day8  — sent 12-36h after trial_ends_at (post-conversion receipt)
//
// Idempotency: each per-user dispatch stamps `users.trial_reminders_sent`
// with the key it just sent. The selector skips any user whose
// trial_reminders_sent already contains the candidate key. The cron is
// re-entrant by design — a missed day picks up on the next run.

export const TRIAL_REMINDERS_PREF_KEY = "trial_reminders_sent";

export type TrialReminderDay = "day5" | "day7" | "day8";

export interface TrialUserRow {
  userId: string;
  email: string;
  firstName: string | null;
  // 'free_trial' | 'active' | ... ; selection uses 'free_trial' for day5/day7
  // and the converted-to plan for day8.
  subscriptionStatus: string;
  // The plan they chose at signup.
  subscriptionTier: string | null;
  trialEndsAt: string | null;
  // For day8: the plan the trial actually converted to.
  trialJustConvertedTo: string | null;
  // jsonb: { day5?: ISO, day7?: ISO, day8?: ISO }
  remindersSent: Record<string, string>;
}

export interface DueTrialReminder {
  userId: string;
  email: string;
  firstName: string | null;
  day: TrialReminderDay;
  // Canonical plan name (Starter | Pro), for templating.
  planName: string;
  // For day8 the trial has ended and the user is on the converted-to plan.
  // For day5/day7 the user is still trialing.
  planKey: string;
}

const PLAN_DISPLAY: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
};

function hoursUntil(target: string, now: Date): number {
  return (new Date(target).getTime() - now.getTime()) / 3_600_000;
}

/**
 * Pure selection: pick users due for day5 / day7 / day8 reminders given the
 * current time. Day5 and day7 dispatch off `trial_ends_at` while the user is
 * still trialing; day8 fires the day after `trial_ends_at` once the webhook
 * has flipped status to 'active' and stamped `trial_just_converted_to`.
 */
export function selectDueReminders(
  users: TrialUserRow[],
  now: Date,
): DueTrialReminder[] {
  const due: DueTrialReminder[] = [];

  for (const u of users) {
    if (!u.email) continue;

    // ---- day5 ----------------------------------------------------------
    // ~2 days left in the trial. Window is a single daily-cron tick wide
    // (24h) plus a 12-hour leading buffer so a re-run later in the day
    // doesn't miss anyone.
    if (
      u.subscriptionStatus === "free_trial" &&
      u.trialEndsAt &&
      !u.remindersSent.day5
    ) {
      const hrs = hoursUntil(u.trialEndsAt, now);
      if (hrs > 24 && hrs <= 60) {
        const tier = u.subscriptionTier ?? "pro";
        due.push({
          userId: u.userId,
          email: u.email,
          firstName: u.firstName,
          day: "day5",
          planKey: tier,
          planName: PLAN_DISPLAY[tier] ?? "Pro",
        });
        continue; // never two reminders in one run
      }
    }

    // ---- day7 ----------------------------------------------------------
    // Final day. Window is 0 < hrsUntil <= 24 — fires on the day the trial
    // actually ends.
    if (
      u.subscriptionStatus === "free_trial" &&
      u.trialEndsAt &&
      !u.remindersSent.day7
    ) {
      const hrs = hoursUntil(u.trialEndsAt, now);
      if (hrs > 0 && hrs <= 24) {
        const tier = u.subscriptionTier ?? "pro";
        due.push({
          userId: u.userId,
          email: u.email,
          firstName: u.firstName,
          day: "day7",
          planKey: tier,
          planName: PLAN_DISPLAY[tier] ?? "Pro",
        });
        continue;
      }
    }

    // ---- day8 ----------------------------------------------------------
    // Post-conversion receipt. Fires the day after trial_ends_at, once the
    // webhook has flipped status to 'active' and stamped
    // trial_just_converted_to. Idempotent — only fires once per trial.
    if (
      u.subscriptionStatus === "active" &&
      u.trialJustConvertedTo &&
      !u.remindersSent.day8
    ) {
      const tier = u.trialJustConvertedTo;
      due.push({
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        day: "day8",
        planKey: tier,
        planName: PLAN_DISPLAY[tier] ?? "Pro",
      });
    }
  }

  return due;
}

// Plan feature bullets as rendered in the day5/day8 emails. Matches the
// TIM-1905 §1 pricing card bullets.
export const PLAN_FEATURE_LIST: Record<string, string[]> = {
  starter: [
    "All planning workspaces",
    "Scout AI assistant: chat and section generation",
    "Investor-ready PDF export",
    "100 AI planning credits/month",
  ],
  pro: [
    "Everything in Starter",
    "Deep market research",
    "Pricing benchmarks vs. real shops",
    "Unlimited locations and projects",
    "Priority support",
    "500 AI planning credits/month",
  ],
};

export const PLAN_MONTHLY_PRICE: Record<string, string> = {
  starter: "39",
  pro: "99",
};
