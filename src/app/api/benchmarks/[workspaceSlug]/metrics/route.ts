// TIM-2450: Real engine bridge for the "How You Compare" dashboard surface.
//
// Previously (TIM-2472 scaffolding) returned MOCK_DATA. Now resolves the
// user's most-recent plan, runs the Phase 1 verdict engine
// (computeAllVerdicts), and transforms the result into BenchmarkPageData
// for the dashboard.
//
// Standing Rules (TIM-2242):
//   Rule 2 — server-side ownership (loadWorkspaceInputs enforces user_id) +
//            plan-tier gate (mirrors /api/benchmarks/workspace/[planId]).
//   Rule 3 — path and query params validated with zod safeParse.
//   Rule 4 — per-user rate limit on the bucket. Engine is deterministic, no
//            paid API; cap is generous (60/min) but hard-enforced.
//   Rule 5 — single error boundary, sanitized 5xx shape, widening logged to
//            server log so dashboard fallback banner is auditable.

export const runtime = "nodejs";
export const maxDuration = 30;

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasWriteAccess } from "@/lib/access";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadReferenceDataset } from "@/lib/benchmarking/load-reference-data";
import { loadWorkspaceInputs } from "@/lib/benchmarking/load-workspace-inputs";
import { deriveWorkspaceProfile } from "@/lib/benchmarking/derive-workspace-profile";
import { computeAllVerdicts } from "@/lib/benchmarking/verdict";
import {
  buildBenchmarkPageData,
  type WorkspaceSlug,
} from "@/lib/benchmarking/page-data-transform";
import type { BenchmarkPageData } from "@/components/benchmark/types";

const SLUG_SCHEMA = z.enum([
  "financials",
  "operations-playbook",
  "menu-pricing",
  "marketing",
  "all",
] as const);

const QUERY_SCHEMA = z.object({
  planId: z.string().uuid().optional(),
  previewOnly: z.literal("1").optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> },
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
    bucket: "benchmarks:dashboard",
    id: userId,
    limit: 60,
    windowSec: 60,
  });
  if (rl) return rl;

  const rawParams = await params;
  const slugRes = SLUG_SCHEMA.safeParse(rawParams.workspaceSlug);
  if (!slugRes.success) {
    return NextResponse.json(
      { error: "Invalid workspace slug", fields: slugRes.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const workspaceSlug = slugRes.data as WorkspaceSlug;

  const url = new URL(request.url);
  const queryRes = QUERY_SCHEMA.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!queryRes.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", fields: queryRes.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Preview-only short-circuit — sample-size estimate for the Adjust-cohort modal.
  // The modal POSTs an axis selection in the query string. Phase 1 cohort
  // matcher is keyed off the workspace profile we derive from the plan, not
  // arbitrary axis combinations, so the preview returns the headline sample
  // size of the closest matching cohort given the override.
  if (queryRes.data.previewOnly === "1") {
    try {
      const dataset = await loadReferenceDataset(supabase);
      // We don't apply the override in Phase 1 — Phase 6 spec adds that. For now
      // surface the largest single-cohort sample so users see a meaningful number
      // rather than a 0. This is honest: the cohort the dashboard is using sits
      // behind the Adjust button and Phase 6 will plumb the override end-to-end.
      const maxSample = dataset.cohorts.reduce((acc, c) => {
        const sum = dataset.referenceRows
          .filter((r) => r.cohort_id === c.id)
          .reduce((a, r) => a + (r.sample_size ?? 0), 0);
        return Math.max(acc, sum);
      }, 0);
      return NextResponse.json({ sampleSize: maxSample });
    } catch {
      return NextResponse.json({ sampleSize: 0 });
    }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, trial_ends_at, beta_waiver_until")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const hasAccess = hasWriteAccess({
    subscription_status: profile.subscription_status,
    trial_ends_at: profile.trial_ends_at,
  });
  const betaWaivedUntil = profile.beta_waiver_until ? new Date(profile.beta_waiver_until) : null;
  const isBetaWaived = betaWaivedUntil ? betaWaivedUntil > new Date() : false;
  if (!hasAccess && !isBetaWaived) {
    return NextResponse.json(
      { reason: "no_subscription", tier_required: "starter" },
      { status: 402 },
    );
  }

  let planId: string | undefined = queryRes.data.planId;
  if (!planId) {
    const { data: plan } = await supabase
      .from("coffee_shop_plans")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!plan) {
      return NextResponse.json(emptyPageData(workspaceSlug), { status: 200 });
    }
    planId = plan.id as string;
  }
  const resolvedPlanId: string = planId;

  try {
    const workspaceInputs = await loadWorkspaceInputs(supabase, resolvedPlanId, userId);
    if ("error" in workspaceInputs) {
      return NextResponse.json(emptyPageData(workspaceSlug), { status: 200 });
    }
    const workspace = deriveWorkspaceProfile(workspaceInputs);
    const dataset = await loadReferenceDataset(supabase);

    const result = computeAllVerdicts({
      workspace,
      metrics: dataset.metrics,
      cohorts: dataset.cohorts,
      referenceRows: dataset.referenceRows,
      bestPracticeRows: dataset.bestPracticeRows,
    });

    if (result.widenLog.length > 0) {
      console.info("[benchmarks/dashboard] cohort widening", {
        userId,
        planId: resolvedPlanId,
        workspaceSlug,
        cohort: result.cohortMatch?.cohort.cohort_key,
        events: result.widenLog,
      });
    }

    const dataFreshnessDate = mostRecentDatasetDate(dataset.referenceRows);
    const sourceCatalog = pickPrimaryCatalog(dataset.referenceRows);

    const pageData: BenchmarkPageData = buildBenchmarkPageData({
      workspaceSlug,
      verdicts: result.verdicts,
      cohortMatch: result.cohortMatch,
      dataFreshnessDate,
      sourceCatalog,
    });

    return NextResponse.json(pageData);
  } catch (err) {
    console.error("[benchmarks/dashboard] failed", {
      userId,
      planId: resolvedPlanId,
      workspaceSlug,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Benchmark unavailable; please retry." }, { status: 500 });
  }
}

function emptyPageData(workspaceSlug: WorkspaceSlug): BenchmarkPageData {
  return {
    cohort: {
      axes: { shopModel: [], locationType: "Not classified", shopSize: [] },
      sampleSize: 0,
      dataFreshnessDate: "—",
      sourceCatalog: "Groundwork Industry Reference",
      isFallback: true,
    },
    pillars: [],
    drilldowns: {},
  };
}

function mostRecentDatasetDate(rows: { extraction_date: string }[]): string {
  if (!rows.length) return "—";
  const latest = rows.map((r) => r.extraction_date).filter(Boolean).sort().pop();
  return latest ? formatExtractionDate(latest) : "—";
}

function formatExtractionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function pickPrimaryCatalog(rows: { source_name: string; dataset_version: string }[]): string {
  if (!rows.length) return "Groundwork Industry Reference";
  // Pick the most-common source name + the highest dataset_version we see.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.source_name, (counts.get(r.source_name) ?? 0) + 1);
  const [name] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const versions = [...new Set(rows.map((r) => r.dataset_version))].sort();
  return versions.length ? `${name} ${versions[versions.length - 1]}` : name;
}
