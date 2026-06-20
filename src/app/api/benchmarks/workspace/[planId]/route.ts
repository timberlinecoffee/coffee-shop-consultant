// TIM-2449 — GET /api/benchmarks/workspace/:planId
//
// Returns the verdict map (one BenchmarkVerdict per catalog metric) for the
// owner's plan. Consumed by the Phase 3 dashboard surface and the chat
// companion's "How you compare" Benchmark-mode whole-plan view.
//
// Standing Rules (TIM-2242):
//   Rule 2 — server-side ownership + plan-tier gate (mirrors /audit + /companion/benchmark).
//   Rule 3 — path param + scope query validated with zod.
//   Rule 4 — per-user rate limit on the bucket. No LLM, no paid call — limit is
//            generous (60/min) but enforced so the dashboard can't be hammered.
//   Rule 5 — single error boundary, sanitized 5xx shape, widening events to
//            server log.

export const runtime = "nodejs";
export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { effectivePlanForGating, isBetaWaived } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadReferenceDataset } from "@/lib/benchmarking/load-reference-data";
import { loadWorkspaceInputs } from "@/lib/benchmarking/load-workspace-inputs";
import { deriveWorkspaceProfile } from "@/lib/benchmarking/derive-workspace-profile";
import { computeAllVerdicts } from "@/lib/benchmarking/verdict";

const PARAM_SCHEMA = z.object({
  planId: z.string().uuid({ message: "planId must be a uuid" }),
});

const PILLAR_SCOPES = new Set([
  "revenue_traffic",
  "cogs",
  "labor",
  "real_estate_fitout",
  "equipment_throughput",
  "menu_pricing",
  "marketing_loyalty",
  "customer_experience",
]);

const QUERY_SCHEMA = z.object({
  pillar: z
    .string()
    .optional()
    .refine((v) => v === undefined || PILLAR_SCOPES.has(v), { message: "unknown pillar" }),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
): Promise<Response> {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  const rl = await enforceRateLimit({
    bucket: "benchmarks:workspace",
    id: userId,
    limit: 60,
    windowSec: 60,
  });
  if (rl) return rl;

  const rawParams = await params;
  const paramRes = PARAM_SCHEMA.safeParse(rawParams);
  if (!paramRes.success) {
    return NextResponse.json(
      { error: "Invalid path parameter", fields: paramRes.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());
  const queryRes = QUERY_SCHEMA.safeParse(rawQuery);
  if (!queryRes.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", fields: queryRes.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const pillarScope = queryRes.data.pillar;

  // TIM-2838: Pro-tier gate mirrors /workspace/benchmarks page gate.
  const { data: profile } = await supabase
    .from("users")
    .select(
      "subscription_status, subscription_tier, paused_from_tier, trial_ends_at, beta_waiver_until",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const betaWaived = isBetaWaived(profile.beta_waiver_until);
  const tier = effectivePlanForGating({
    subscription_status: profile.subscription_status,
    subscription_tier: profile.subscription_tier,
    paused_from_tier: profile.paused_from_tier,
    trial_ends_at: profile.trial_ends_at,
  });
  if (tier !== "pro" && !betaWaived) {
    return NextResponse.json(
      { error: "Pro plan required", reason: "pro_required", tier_required: "pro" },
      { status: 403 },
    );
  }

  try {
    const workspaceInputsOrError = await loadWorkspaceInputs(supabase, paramRes.data.planId, userId);
    if ("error" in workspaceInputsOrError) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    const workspace = deriveWorkspaceProfile(workspaceInputsOrError);
    const dataset = await loadReferenceDataset(supabase);

    const filteredMetrics = pillarScope
      ? dataset.metrics.filter((m) => m.pillar === pillarScope)
      : dataset.metrics;

    const result = computeAllVerdicts({
      workspace,
      metrics: filteredMetrics,
      cohorts: dataset.cohorts,
      referenceRows: dataset.referenceRows,
      bestPracticeRows: dataset.bestPracticeRows,
    });

    if (result.widenLog.length > 0) {
      console.info("[benchmarks] cohort widening", {
        userId,
        planId: paramRes.data.planId,
        cohort: result.cohortMatch?.cohort.cohort_key,
        events: result.widenLog,
      });
    }

    return NextResponse.json({
      planId: paramRes.data.planId,
      workspaceProfile: result.workspaceProfile,
      cohort: result.cohortMatch
        ? {
            cohortKey: result.cohortMatch.cohort.cohort_key,
            definition: result.cohortMatch.cohort.axes,
            description: result.cohortMatch.cohort.description,
            sampleSize: result.cohortMatch.sampleSize,
            axesRelaxed: result.cohortMatch.axesRelaxed,
          }
        : null,
      verdicts: result.verdicts,
    });
  } catch (err) {
    console.error("[benchmarks/workspace] failed", {
      userId,
      planId: paramRes.data.planId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Benchmark unavailable; please retry." }, { status: 500 });
  }
}
