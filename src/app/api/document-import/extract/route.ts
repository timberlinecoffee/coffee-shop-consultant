// TIM-2434: Document Import — extraction endpoint.
//
// POST { importId } — runs the extraction LLM call against each file, charges
// credits, writes one ai_turn_metrics row per file (await — Vercel rule),
// merges proposedChanges into the session, and returns the proposals shaped
// for the unified AIReviewModal.
//
// Critical Rule-4 compliance: this is the ONLY paid path in the pipeline.
//   - enforceRateLimit() per user (low limit; extraction is heavy).
//   - Credits checked BEFORE each per-file turn; turns abort cleanly if the
//     balance runs out mid-batch (charges only what was processed).
//   - recordTurnMetric() is awaited — never fire-and-forget on Vercel.

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit, clientIp } from "@/lib/rate-limit";
import { notifyIfCreditBalanceLow } from "@/lib/email/credit-balance-low-callsite";
import {
  effectivePlanForGating,
  isBetaWaived,
} from "@/lib/access";
import { recordTurnMetric, type TurnMetricRecord } from "@/lib/ai/turn-metrics";
import { parseDocument } from "@/lib/document-import/parsers";
import { extractDocument } from "@/lib/document-import/extract";
import {
  routeExtractedChanges,
  type ExtractedChange,
} from "@/lib/document-import/suite-routing";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  importId: z.string().uuid(),
});

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const user = auth.user;

  // Rule 4 — paid API path, throttled hard. Document extraction can run for
  // ~30s and cost real money; 5/min/user is generous.
  const rl = await enforceRateLimit({
    bucket: "document-import-extract",
    id: user.id || ip,
    limit: 5,
    windowSec: 60,
  });
  if (rl) return rl;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Rule 2 — re-check ownership server-side.
  const { data: session } = await supabase
    .from("document_imports")
    .select("id, user_id, plan_id, estimated_credits, status")
    .eq("id", parsed.data.importId)
    .single();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: "Import not found." }, { status: 404 });
  }
  if (session.status === "applied" || session.status === "ready") {
    return NextResponse.json(
      { error: "Import already extracted." },
      { status: 409 },
    );
  }

  // Tier + credit check.
  const { data: profile } = await supabase
    .from("users")
    .select(
      "ai_credits_remaining, subscription_tier, subscription_status, beta_waiver_until, trial_ends_at, paused_from_tier",
    )
    .eq("id", user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  const waived = isBetaWaived(profile.beta_waiver_until);
  const tier = effectivePlanForGating({
    subscription_status: profile.subscription_status,
    subscription_tier: profile.subscription_tier,
    paused_from_tier: profile.paused_from_tier,
    trial_ends_at: profile.trial_ends_at,
  });
  const isUnlimited = waived;
  if (
    !isUnlimited &&
    profile.ai_credits_remaining < (session.estimated_credits ?? 0)
  ) {
    return NextResponse.json(
      {
        error: "Not enough credits for this import.",
        code: "out_of_credits",
        balance: profile.ai_credits_remaining,
        estimate: session.estimated_credits,
      },
      { status: 402 },
    );
  }

  // Flip session to extracting up front; UI polls.
  await supabase
    .from("document_imports")
    .update({ status: "extracting" })
    .eq("id", session.id);

  const { data: files } = await supabase
    .from("document_import_files")
    .select("id, storage_path, file_name, file_type, page_count, status")
    .eq("import_id", session.id);

  if (!files || files.length === 0) {
    await supabase
      .from("document_imports")
      .update({ status: "error", error_code: "no_content" })
      .eq("id", session.id);
    return NextResponse.json(
      { error: "No files to extract." },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const allChanges: ExtractedChange[] = [];
  let runningCharged = 0;
  let runningBalance = profile.ai_credits_remaining;
  const route = "/api/document-import/extract";
  const planTier = (() => {
    if (waived) return "beta_waived" as const;
    if (profile.subscription_status === "free_trial") return "free_trial" as const;
    if (tier === "pro") return "pro" as const;
    if (tier === "starter") return "starter" as const;
    return "unknown" as const;
  })();

  for (const f of files) {
    if (f.status === "error") continue;
    const dl = await svc.storage
      .from("document-imports")
      .download(f.storage_path);
    if (dl.error || !dl.data) {
      await supabase
        .from("document_import_files")
        .update({ status: "error", error_code: "extraction_failed" })
        .eq("id", f.id);
      continue;
    }
    await supabase
      .from("document_import_files")
      .update({ status: "extracting" })
      .eq("id", f.id);

    const bytes = Buffer.from(await dl.data.arrayBuffer());
    const parsedDoc = await parseDocument({
      bytes,
      fileName: f.file_name,
      mimeType: mimeFor(f.file_type),
    });
    const result = await extractDocument({
      parsed: parsedDoc,
      fileName: f.file_name,
      bytes,
    });

    // Charge credits + write metric row. ALWAYS await per the Vercel rule.
    const inserter = {
      async insert(row: TurnMetricRecord) {
        const { error } = await svc.from("ai_turn_metrics").insert(row);
        return { error: error ? { message: error.message } : null };
      },
    };
    const metric = await recordTurnMetric(inserter, {
      route,
      model: result.modelUsed,
      usage: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_input_tokens: result.usage.cache_read_input_tokens,
        cache_creation_input_tokens: result.usage.cache_creation_input_tokens,
      },
      userId: user.id,
      planTier,
    });
    const charged = metric.creditBreakdown.credits;
    if (!isUnlimited && charged > 0) {
      runningBalance = Math.max(0, runningBalance - charged);
      await svc
        .from("users")
        .update({ ai_credits_remaining: runningBalance })
        .eq("id", user.id);
      // TIM-3023: at-most-one credit-balance-low notice per month.
      void notifyIfCreditBalanceLow({ userId: user.id, postMutationBalance: runningBalance, supabase: svc });
    }
    runningCharged += charged;

    // Tag each extracted change with the file name for source provenance.
    const tagged: ExtractedChange[] = result.extracted.proposedChanges.map(
      (c) => ({ ...c, sourceFileName: f.file_name }),
    );
    allChanges.push(...tagged);

    await supabase
      .from("document_import_files")
      .update({
        status:
          result.errorCode === "no_content"
            ? "no_content"
            : result.errorCode
              ? "error"
              : "complete",
        error_code: result.errorCode ?? null,
        extracted_json: { proposedChanges: tagged },
        credits_charged: charged,
      })
      .eq("id", f.id);
  }

  const sessionStatus = allChanges.length === 0 ? "error" : "ready";
  await supabase
    .from("document_imports")
    .update({
      status: sessionStatus,
      credits_charged: runningCharged,
      error_code: sessionStatus === "error" ? "no_content" : null,
    })
    .eq("id", session.id);

  const suggestions = routeExtractedChanges({
    changes: allChanges,
    idPrefix: `imp_${session.id.slice(0, 8)}`,
  });

  return NextResponse.json({
    importId: session.id,
    creditsCharged: runningCharged,
    balance: isUnlimited ? null : runningBalance,
    proposedChanges: allChanges,
    suggestions,
  });
}

function mimeFor(t: string): string {
  switch (t) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
