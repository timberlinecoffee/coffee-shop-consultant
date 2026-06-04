// TIM-2254: shared helpers for account deletion + export.
//
// Spec: TIM-2250 deletion-spec document.
//
// The deletion sequence runs server-side via the service-role client. RLS is
// the second line of defence; the first is the JWT == target-user check on the
// API route. Hash helpers below are deterministic so admin can reconcile a
// deletion log entry to a specific user via the ACCOUNT_DELETION_AUDIT_SALT
// without ever storing the raw user id.

import crypto from "node:crypto";
// createServiceClient is loaded dynamically inside executeDeletionSequence so
// the pure helpers (hashWithSalt, timingSafeEqualStr, table constants) stay
// importable from .mjs test files that cannot resolve "@/..." path aliases.

// All public.* tables that hold user-scoped content via plan_id. Drives the
// deletion fan-out so adding a new table is a one-line append.
//
// Each entry deletes WHERE plan_id IN (<plans of user>). Tables that link to
// user_id directly are deleted in `deleteUserScoped` below.
//
// NOT in this list (retained or deliberately excluded):
//   - invoices                 (payment record, 7-year retention)
//   - subscriptions            (payment record, 7-year retention)
//   - support_messages         (3-year retention, PII redacted in-place)
//   - admin_audit_log          (admin actions log, not user data)
//   - account_deletion_audit_log (this audit log, no PII)
//   - account_export_requests  (redacted in-place during deletion — see F1 block)
//   - stripe_processed_events  (webhook dedup, not user data)
//   - auth_users_audit         (auth admin audit, not user-scoped)
//   - public reference tables  (standard_*, pricing_benchmarks, etc.)
export const PLAN_SCOPED_TABLES = [
  "ai_conversations",
  "brand_config",
  "buildout_equipment_items",
  "buildout_list_sections",
  "buildout_supplies_items",
  "business_plan_cover",
  "business_plan_financial_documents",
  "business_plan_sections",
  "business_plan_sections_archive",
  "competency_form_templates",
  "competency_evaluations",
  "cost_tracker",
  "equipment_lists",
  "financial_models",
  "hiring_plan_roles",
  "hiring_requirement_sets",
  "interview_candidates",
  "interview_questions",
  "interview_scorecards",
  "interview_scores",
  "job_description_templates",
  "launch_milestones",
  "launch_timeline_items",
  "location_candidates",
  "location_lease_terms",
  "location_rubric_scores",
  "marketing_kickoff_items",
  "menu_categories",
  "menu_ingredients",
  "menu_item_ingredients",
  "menu_items",
  "milestones",
  "onboarding_plan_instances",
  "onboarding_tasks",
  "plan_hiring_settings",
  "soft_open_plan_items",
  "staff_competencies",
  "staff_files",
  "vendor_candidates",
  "vendor_custom_categories",
  "vendor_decisions",
  "vendors",
  "workspace_documents",
  "workspace_responses",
  "workspace_status",
] as const;

// Tables that key directly off user_id. These are wiped before plan deletion.
export const USER_SCOPED_TABLES = [
  "ai_errors",
  "ai_usage_log",
  "analytics_events",
  "credit_transactions",
  "user_ui_prefs",
] as const;

// Storage buckets that contain user content scoped under <plan_id>/.
export const PLAN_SCOPED_BUCKETS = [
  "business-plan-logos",
  "shop-brand-logos",
] as const;

// SHA-256 hex of `${input}:${salt}`. Deterministic across runs so duplicate
// requests collide in the audit log. Lazy-throws if salt is missing in prod.
export function hashWithSalt(input: string): string {
  const salt = process.env.ACCOUNT_DELETION_AUDIT_SALT;
  if (!salt || salt.length < 16) {
    // F2 fix: fail closed in production. Dev/test/preview keep the deterministic
    // fallback so unit tests + local dev don't need a key configured.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ACCOUNT_DELETION_AUDIT_SALT must be set to >=16 chars in production",
      );
    }
    return crypto
      .createHash("sha256")
      .update(`${input}:dev-salt-not-for-prod`)
      .digest("hex");
  }
  return crypto.createHash("sha256").update(`${input}:${salt}`).digest("hex");
}

// Constant-time comparison so the email-confirmation check can't be probed via
// response-time differences.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export type DeletionSummary = {
  plansDeleted: number;
  planScopedRowsDeleted: Record<string, number>;
  userScopedRowsDeleted: Record<string, number>;
  storageObjectsDeleted: number;
  storageBuckets: string[];
  stripeSubscriptionCancelled: boolean;
  klaviyoSuppressed: boolean;
  supportMessagesRedacted: number;
  authSessionsRevoked: boolean;
  authUserAnonymised: boolean; // F3: did step 9 succeed?
};

// Runs the full deletion sequence for a verified user. The caller is
// responsible for checking auth + email confirmation BEFORE invoking this.
export async function executeDeletionSequence(args: {
  userId: string;
  email: string;
}): Promise<DeletionSummary> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const svc = createServiceClient();
  const summary: DeletionSummary = {
    plansDeleted: 0,
    planScopedRowsDeleted: {},
    userScopedRowsDeleted: {},
    storageObjectsDeleted: 0,
    storageBuckets: [],
    stripeSubscriptionCancelled: false,
    klaviyoSuppressed: false,
    supportMessagesRedacted: 0,
    authSessionsRevoked: false,
    authUserAnonymised: false,
  };

  // 1. Invalidate active sessions. We sign-out via the admin client which
  //    revokes all refresh tokens for this user across every device. Sessions
  //    bound to the cookie continue to work until the access-token TTL (~1h),
  //    but the user can no longer refresh.
  try {
    // signOut variants differ across @supabase/supabase-js — fall back to a
    // direct sessions delete if the SDK helper is unavailable in this version.
    type AdminLike = {
      auth: {
        admin: {
          signOut?: (userId: string, scope?: string) => Promise<unknown>;
        };
      };
    };
    const adminLike = svc as unknown as AdminLike;
    if (typeof adminLike.auth?.admin?.signOut === "function") {
      await adminLike.auth.admin.signOut(args.userId, "global");
    } else {
      // Direct fallback: revoke via raw SQL on auth.sessions.
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      await fetch(`${url}/auth/v1/admin/users/${args.userId}/logout`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      });
    }
    summary.authSessionsRevoked = true;
  } catch (err) {
    console.error("[account-deletion] session revoke failed", err);
  }

  // 2. Cancel Stripe subscription. Best-effort; if Stripe fails we still
  //    proceed (Stripe webhook will reconcile when we anonymise the row).
  try {
    const { data: sub } = await svc
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", args.userId)
      .maybeSingle();
    if (sub?.stripe_subscription_id) {
      const { stripe } = await import("@/lib/stripe");
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      summary.stripeSubscriptionCancelled = true;
    }
  } catch (err) {
    console.error("[account-deletion] stripe cancel failed", err);
  }

  // 3. Klaviyo CASL withdrawal — suppress the profile via marketing-suppression
  //    bulk endpoint. If KLAVIYO_PRIVATE_API_KEY is not configured we log and
  //    continue.
  try {
    const klaviyoKey = process.env.KLAVIYO_PRIVATE_API_KEY;
    if (klaviyoKey) {
      const res = await fetch(
        "https://a.klaviyo.com/api/profile-suppression-bulk-create-jobs/",
        {
          method: "POST",
          headers: {
            Authorization: `Klaviyo-API-Key ${klaviyoKey}`,
            revision: "2024-10-15",
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            data: {
              type: "profile-suppression-bulk-create-job",
              attributes: {
                profiles: {
                  data: [
                    {
                      type: "profile",
                      attributes: { email: args.email },
                    },
                  ],
                },
              },
            },
          }),
        },
      );
      if (res.ok) summary.klaviyoSuppressed = true;
      else
        console.error(
          "[account-deletion] klaviyo suppression failed",
          res.status,
        );
    }
  } catch (err) {
    console.error("[account-deletion] klaviyo suppression error", err);
  }

  // 4. Collect plan ids before deletion so we can target per-table rows + storage.
  const { data: plans } = await svc
    .from("coffee_shop_plans")
    .select("id")
    .eq("user_id", args.userId);
  const planIds = (plans ?? []).map((p) => p.id as string);

  // 5. Delete user-scoped tables (use_user_id linkage).
  for (const table of USER_SCOPED_TABLES) {
    try {
      const { count, error } = await svc
        .from(table)
        .delete({ count: "exact" })
        .eq("user_id", args.userId);
      if (error) throw error;
      summary.userScopedRowsDeleted[table] = count ?? 0;
    } catch (err) {
      console.error(`[account-deletion] delete ${table} failed`, err);
      summary.userScopedRowsDeleted[table] = -1;
    }
  }

  // 6. Delete plan-scoped content (then the plans themselves last).
  if (planIds.length > 0) {
    for (const table of PLAN_SCOPED_TABLES) {
      try {
        const { count, error } = await svc
          .from(table)
          .delete({ count: "exact" })
          .in("plan_id", planIds);
        if (error) throw error;
        summary.planScopedRowsDeleted[table] = count ?? 0;
      } catch (err) {
        // Some tables may not exist in older databases — log and continue.
        console.error(`[account-deletion] delete ${table} failed`, err);
        summary.planScopedRowsDeleted[table] = -1;
      }
    }

    // Delete storage objects under <plan_id>/ in each known bucket.
    for (const bucket of PLAN_SCOPED_BUCKETS) {
      for (const planId of planIds) {
        try {
          const { data: list, error: listErr } = await svc.storage
            .from(bucket)
            .list(planId, { limit: 1000 });
          if (listErr || !list) continue;
          const paths = list.map((f) => `${planId}/${f.name}`);
          if (paths.length > 0) {
            const { error: rmErr } = await svc.storage
              .from(bucket)
              .remove(paths);
            if (!rmErr) {
              summary.storageObjectsDeleted += paths.length;
              if (!summary.storageBuckets.includes(bucket))
                summary.storageBuckets.push(bucket);
            }
          }
        } catch (err) {
          console.error(
            `[account-deletion] storage delete ${bucket}/${planId} failed`,
            err,
          );
        }
      }
    }

    // Delete the plans last so cascading FKs (if any) don't double-fire.
    try {
      const { count, error } = await svc
        .from("coffee_shop_plans")
        .delete({ count: "exact" })
        .eq("user_id", args.userId);
      if (error) throw error;
      summary.plansDeleted = count ?? 0;
    } catch (err) {
      console.error("[account-deletion] delete coffee_shop_plans failed", err);
    }
  }

  // F1: wipe the account-exports bucket + redact account_export_requests rows so
  // a prior export bundle does not survive deletion. Per-user prefix is <userId>/.
  try {
    const { data: exportList } = await svc.storage
      .from("account-exports")
      .list(args.userId, { limit: 1000 });
    if (exportList && exportList.length > 0) {
      const paths = exportList.map((f) => `${args.userId}/${f.name}`);
      const { error: rmErr } = await svc.storage.from("account-exports").remove(paths);
      if (!rmErr) {
        summary.storageObjectsDeleted += paths.length;
        if (!summary.storageBuckets.includes("account-exports"))
          summary.storageBuckets.push("account-exports");
      }
    }
  } catch (err) {
    console.error("[account-deletion] account-exports cleanup failed", err);
  }

  try {
    await svc
      .from("account_export_requests")
      .update({
        status: "expired",
        delivery_email: "[redacted]",
        storage_path: null,
        size_bytes: null,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", args.userId);
  } catch (err) {
    console.error("[account-deletion] account_export_requests redact failed", err);
  }

  // 7. Redact PII on retained support_messages (3-year retention per spec §9).
  try {
    const { count } = await svc
      .from("support_messages")
      .update({
        name: "[redacted]",
        email: "[redacted]",
        message: "[redacted on account deletion]",
        page_url: null,
        user_agent: null,
        // Keep internal_notes (ops authored) and status (handling state).
      }, { count: "exact" })
      .eq("user_id", args.userId);
    summary.supportMessagesRedacted = count ?? 0;
  } catch (err) {
    console.error("[account-deletion] support_messages redact failed", err);
  }

  // 8. Anonymise the public.users row. Preserve id + subscription fields so
  //    the invoices/subscriptions FKs continue to resolve for retention.
  try {
    await svc
      .from("users")
      .update({
        email: null,
        full_name: null,
        avatar_url: null,
        target_opening_date: null,
        onboarding_data: null,
        signup_source: null,
        deleted_at: new Date().toISOString(),
        is_deleted: true,
      })
      .eq("id", args.userId);
  } catch (err) {
    console.error("[account-deletion] anonymise public.users failed", err);
  }

  // 9. Anonymise the auth.users row. We do NOT hard-delete because that would
  //    cascade through public.users → invoices/subscriptions and destroy
  //    legally retained payment records (FKs are ON DELETE CASCADE).
  try {
    type AdminLike = {
      auth: {
        admin: {
          updateUserById?: (
            id: string,
            attrs: Record<string, unknown>,
          ) => Promise<unknown>;
        };
      };
    };
    const adminLike = svc as unknown as AdminLike;
    if (typeof adminLike.auth?.admin?.updateUserById === "function") {
      // Replace email with a deterministic, non-deliverable address so the
      // email can never be replayed for password reset.
      const placeholder = `deleted+${args.userId}@deleted.invalid`;
      await adminLike.auth.admin.updateUserById(args.userId, {
        email: placeholder,
        user_metadata: {},
        app_metadata: { deleted_at: new Date().toISOString() },
        ban_duration: "876000h", // ~100 years, effectively permanent ban
      });
      summary.authUserAnonymised = true; // F3: pin success
    }
  } catch (err) {
    console.error("[account-deletion] anonymise auth.users failed", err);
  }

  return summary;
}
