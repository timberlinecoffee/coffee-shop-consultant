// TIM-2254: data export bundle builder.
//
// Spec: TIM-2250 deletion-spec §1 (export-request endpoint).
//
// Synchronous build: we read every user-scoped row + per-plan rows, serialise
// to JSON, upload to the private `account-exports` bucket, and create a
// 24-hour signed URL. Most users have well under 1 MB of data so a single
// request is fine; if it ever stops fitting in a serverless invocation we
// move this to a Vercel cron worker reading account_export_requests.

import { createServiceClient } from "@/lib/supabase/service";
import {
  PLAN_SCOPED_TABLES,
  USER_SCOPED_TABLES,
} from "@/lib/account-deletion";

type ServiceClient = ReturnType<typeof createServiceClient>;

const EXPORT_BUCKET = "account-exports";
const SIGNED_URL_TTL_SEC = 24 * 60 * 60; // 24 hours per spec.

export type ExportBundle = {
  exportedAt: string;
  userId: string;
  email: string;
  profile: unknown;
  subscription: unknown;
  invoices: unknown;
  plans: unknown[];
  userScoped: Record<string, unknown>;
  planScoped: Record<string, Record<string, unknown>>;
};

export async function buildExportBundle(args: {
  userId: string;
  email: string;
  svc?: ServiceClient;
}): Promise<ExportBundle> {
  const svc = args.svc ?? createServiceClient();
  const bundle: ExportBundle = {
    exportedAt: new Date().toISOString(),
    userId: args.userId,
    email: args.email,
    profile: null,
    subscription: null,
    invoices: [],
    plans: [],
    userScoped: {},
    planScoped: {},
  };

  const { data: profile } = await svc
    .from("users")
    .select("*")
    .eq("id", args.userId)
    .maybeSingle();
  bundle.profile = profile ?? null;

  const { data: subscription } = await svc
    .from("subscriptions")
    .select("*")
    .eq("user_id", args.userId)
    .maybeSingle();
  bundle.subscription = subscription ?? null;

  const { data: invoices } = await svc
    .from("invoices")
    .select("*")
    .eq("user_id", args.userId)
    .order("invoice_date", { ascending: false });
  bundle.invoices = invoices ?? [];

  for (const table of USER_SCOPED_TABLES) {
    const { data } = await svc.from(table).select("*").eq("user_id", args.userId);
    bundle.userScoped[table] = data ?? [];
  }

  const { data: plans } = await svc
    .from("coffee_shop_plans")
    .select("*")
    .eq("user_id", args.userId);
  bundle.plans = plans ?? [];
  const planIds = (plans ?? []).map((p) => p.id as string);

  if (planIds.length > 0) {
    for (const table of PLAN_SCOPED_TABLES) {
      try {
        const { data } = await svc.from(table).select("*").in("plan_id", planIds);
        bundle.planScoped[table] = { rows: data ?? [] };
      } catch {
        bundle.planScoped[table] = { rows: [], error: "table_not_readable" };
      }
    }
  }

  return bundle;
}

export async function uploadExportBundle(args: {
  userId: string;
  bundle: ExportBundle;
  svc?: ServiceClient;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  const svc = args.svc ?? createServiceClient();
  const json = JSON.stringify(args.bundle, null, 2);
  const sizeBytes = Buffer.byteLength(json, "utf8");
  // Use timestamp suffix so multiple exports do not overwrite each other.
  const stamp = args.bundle.exportedAt.replace(/[:.]/g, "-");
  const storagePath = `${args.userId}/groundwork-export-${stamp}.json`;
  const { error } = await svc.storage
    .from(EXPORT_BUCKET)
    .upload(storagePath, json, {
      contentType: "application/json",
      upsert: false,
    });
  if (error) throw new Error(`export upload failed: ${error.message}`);
  return { storagePath, sizeBytes };
}

export async function createSignedExportUrl(args: {
  storagePath: string;
  svc?: ServiceClient;
}): Promise<{ signedUrl: string; expiresAt: string }> {
  const svc = args.svc ?? createServiceClient();
  const { data, error } = await svc.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(args.storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl)
    throw new Error(`signed url creation failed: ${error?.message ?? "no url"}`);
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
  return { signedUrl: data.signedUrl, expiresAt };
}
