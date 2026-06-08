// TIM-2461: Data assembly for the Plan Overview dashboard panel.
// Pure server-side helper — composes plan status, component counts, recent
// activity, and cached conflicts into the four section payloads consumed by
// /dashboard.
// TIM-2525: Also loads financial health metrics (free, non-Copilot) so the
// dashboard card surfaces Labor %, COGS %, break-even and working capital.

import type { SupabaseClient } from "@supabase/supabase-js";
import { AVAILABLE_MODULES } from "@/lib/modules";
import {
  normalizeMonthlyProjections,
  deriveFinancialInputs,
  computeMonthlySlices,
} from "@/lib/financial-projection";
import {
  computeFinancialHealthMetrics,
  worstTier,
  type HealthMetric,
  type HealthTier,
} from "@/lib/financials/health-metrics";
import {
  WORKSPACE_MANIFEST,
  WORKSPACE_CATEGORY_LABEL,
  type WorkspaceCategory,
} from "@/lib/workspace-manifest";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import type {
  AuditReport,
  AuditFinding,
} from "@/lib/business-plan/audit";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type HealthState = "on_track" | "needs_attention" | "has_conflicts";

export interface PlanStatus {
  stageName: string;
  healthState: HealthState;
  healthLabel: string;
  lastUpdatedAt: string | null;
  startedAt: string | null;
  planStarted: boolean;
}

export interface ComponentCounts {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completedPct: number;
  inProgressPct: number;
  notStartedPct: number;
}

export type ActivityKind =
  | "section_completed"
  | "section_started"
  | "notable_edit"
  | "conflict_resolved"
  | "conflict_appeared";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  description: string;
  occurredAt: string;
  href: string | null;
}

export interface ConflictItem {
  id: string;
  sectionLabel: string;
  description: string;
  suggestion: string;
  href: string | null;
}

export interface FinancialHealthSummary {
  metrics: HealthMetric[];
  worst: HealthTier;
}

export interface PlanOverview {
  planId: string | null;
  status: PlanStatus;
  counts: ComponentCounts;
  activity: ActivityItem[];
  conflicts: ConflictItem[];
  lastConflictCheckAt: string | null;
  // TIM-2525: financial health metrics (free, not Copilot-gated).
  financialHealth: FinancialHealthSummary | null;
}

// Re-export so the dashboard page doesn't need a direct lib import.
export type { HealthMetric, HealthTier };

interface CountedStatusRow {
  component_key: string;
  status: string;
  updated_at: string;
}

const UNLOCKED_MANIFEST = WORKSPACE_MANIFEST.filter((item) =>
  AVAILABLE_MODULES.has(item.moduleNumber)
);

const LABEL_BY_KEY = new Map(
  WORKSPACE_MANIFEST.map((item) => [item.workspaceKey, item.label])
);

const HREF_BY_KEY = new Map(
  WORKSPACE_MANIFEST.map((item) => [item.workspaceKey, item.href])
);

const CATEGORY_BY_KEY = new Map(
  WORKSPACE_MANIFEST.map((item) => [item.workspaceKey, item.category])
);

const CATEGORY_ORDER: WorkspaceCategory[] = ["plan", "setup", "launch", "operate"];

function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function deriveStageName(
  statusByKey: ReadonlyMap<string, WorkspaceStatus>
): string {
  let mostAdvanced: WorkspaceCategory | null = null;
  for (const item of UNLOCKED_MANIFEST) {
    const status = statusByKey.get(item.workspaceKey);
    if (status === "complete" || status === "in_progress") {
      const idx = CATEGORY_ORDER.indexOf(item.category);
      const currentIdx = mostAdvanced
        ? CATEGORY_ORDER.indexOf(mostAdvanced)
        : -1;
      if (idx > currentIdx) mostAdvanced = item.category;
    }
  }
  if (!mostAdvanced) return "Not Started";
  return WORKSPACE_CATEGORY_LABEL[mostAdvanced];
}

function deriveHealth(
  hasConflicts: boolean,
  inProgressCount: number,
  completedCount: number,
  lastUpdatedAt: string | null
): { state: HealthState; label: string } {
  if (hasConflicts) {
    return { state: "has_conflicts", label: "Has Conflicts" };
  }
  if (completedCount === 0 && inProgressCount === 0) {
    return { state: "needs_attention", label: "Needs Attention" };
  }
  if (inProgressCount === 0 && lastUpdatedAt) {
    const ageMs = Date.now() - new Date(lastUpdatedAt).getTime();
    if (ageMs > SEVEN_DAYS_MS) {
      return { state: "needs_attention", label: "Needs Attention" };
    }
  }
  return { state: "on_track", label: "On Track" };
}

function buildActivity(
  rows: ReadonlyArray<CountedStatusRow>,
  now: number
): ActivityItem[] {
  const cutoff = now - SEVEN_DAYS_MS;
  const items: ActivityItem[] = [];
  for (const row of rows) {
    const ts = new Date(row.updated_at).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const label = LABEL_BY_KEY.get(row.component_key);
    if (!label) continue;
    if (row.status === "complete") {
      items.push({
        id: `complete:${row.component_key}`,
        kind: "section_completed",
        description: `${label} marked complete`,
        occurredAt: row.updated_at,
        href: HREF_BY_KEY.get(row.component_key) ?? null,
      });
    } else if (row.status === "in_progress") {
      items.push({
        id: `started:${row.component_key}`,
        kind: "section_started",
        description: `${label} in progress`,
        occurredAt: row.updated_at,
        href: HREF_BY_KEY.get(row.component_key) ?? null,
      });
    }
  }
  items.sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
  return items.slice(0, 10);
}

const CONFLICT_RULE_IDS = new Set([
  "self_consistency",
  "hiring_financials_payroll",
  "equipment_capex",
  "menu_ticket",
  "hiring_opening_month",
]);

function findingToConflict(finding: AuditFinding): ConflictItem | null {
  if (finding.severity === "info") return null;
  const sectionLabel =
    finding.source.workspace_label ??
    finding.target.workspace_label ??
    "Plan";
  const description =
    finding.issue ?? finding.raw_message ?? "Conflict detected";
  const suggestion =
    finding.suggested_fix ??
    finding.suggested_replacement ??
    finding.expected_text ??
    "Open the source workspace and reconcile the values.";
  const sourceWorkspace = finding.source.workspace ?? finding.target.workspace;
  const href = sourceWorkspace ? hrefForAuditWorkspace(sourceWorkspace) : null;
  return {
    id: finding.id,
    sectionLabel,
    description,
    suggestion,
    href,
  };
}

const AUDIT_WORKSPACE_HREF: Record<string, string> = {
  "financials": "/workspace/financials",
  "real-estate": "/workspace/location-lease",
  "labor": "/workspace/hiring",
  "hiring": "/workspace/hiring",
  "buildout-equipment": "/workspace/buildout-equipment",
  "menu-pricing": "/workspace/menu-pricing",
  "launch-plan": "/workspace/launch-plan",
  "business-plan": "/workspace/business-plan",
  "location-lease": "/workspace/location-lease",
};

function hrefForAuditWorkspace(workspace: string): string | null {
  return AUDIT_WORKSPACE_HREF[workspace] ?? null;
}

function buildConflicts(report: AuditReport | null): ConflictItem[] {
  if (!report) return [];
  return report.findings
    .filter(
      (f) =>
        (f.severity === "critical" || f.severity === "warning") &&
        CONFLICT_RULE_IDS.has(f.rule_id)
    )
    .map(findingToConflict)
    .filter((c): c is ConflictItem => c !== null)
    .slice(0, 20);
}

export async function loadPlanOverview(
  supabase: SupabaseClient,
  userId: string
): Promise<PlanOverview> {
  const { data: plan } = await supabase
    .from("coffee_shop_plans")
    .select("id, updated_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planId = plan?.id ?? null;

  const statusByKey = new Map<string, WorkspaceStatus>();
  let statusRows: CountedStatusRow[] = [];
  let cachedReport: AuditReport | null = null;
  let lastConflictCheckAt: string | null = null;

  let financialHealth: FinancialHealthSummary | null = null;

  if (planId) {
    const [{ data: rows }, { data: cacheRow }, { data: modelRow }] = await Promise.all([
      supabase
        .from("workspace_status")
        .select("component_key, status, updated_at")
        .eq("plan_id", planId),
      supabase
        .from("plan_quality_audit_cache")
        .select("report_json, created_at")
        .eq("user_id", userId)
        .eq("plan_id", planId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // TIM-2525: load financial model for health panel (select only what we need).
      supabase
        .from("financial_models")
        .select("forecast_inputs, monthly_projections")
        .eq("plan_id", planId)
        .maybeSingle(),
    ]);

    statusRows = (rows ?? []) as CountedStatusRow[];
    for (const row of statusRows) {
      if (isWorkspaceStatus(row.status)) {
        statusByKey.set(row.component_key, row.status);
      }
    }

    if (cacheRow) {
      cachedReport = (cacheRow as { report_json: AuditReport }).report_json;
      lastConflictCheckAt =
        (cacheRow as { created_at: string }).created_at ?? null;
    }

    // TIM-2525: compute financial health metrics from the stored model.
    if (modelRow) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (modelRow as any).forecast_inputs ?? (modelRow as any).monthly_projections;
        const mp = normalizeMonthlyProjections(raw);
        const fi = deriveFinancialInputs(mp);
        const slices = computeMonthlySlices(mp, { total_cost_cents: 0, financed_cost_cents: 0 }, {
          equipment_cost_cents: fi.equipment_cost_cents,
          buildout_cost_cents: fi.buildout_cost_cents,
          rent_deposits_cents: fi.rent_deposits_cents,
          license_permits_cents: fi.license_permits_cents,
          pre_opening_marketing_cents: fi.pre_opening_marketing_cents,
          initial_inventory_cents: fi.initial_inventory_cents,
          startup_supplies_cents: fi.startup_supplies_cents,
          professional_fees_cents: fi.professional_fees_cents,
        });
        const metrics = computeFinancialHealthMetrics(slices, fi);
        if (metrics.length > 0) {
          financialHealth = { metrics, worst: worstTier(metrics) };
        }
      } catch {
        // Non-blocking: a corrupt model should not break the dashboard.
      }
    }
  }

  const total = UNLOCKED_MANIFEST.length;
  let completed = 0;
  let inProgress = 0;
  for (const item of UNLOCKED_MANIFEST) {
    const s = statusByKey.get(item.workspaceKey);
    if (s === "complete") completed += 1;
    else if (s === "in_progress") inProgress += 1;
  }
  const notStarted = Math.max(0, total - completed - inProgress);
  const counts: ComponentCounts = {
    total,
    completed,
    inProgress,
    notStarted,
    completedPct: pctOf(completed, total),
    inProgressPct: pctOf(inProgress, total),
    notStartedPct: pctOf(notStarted, total),
  };

  const lastUpdatedAt = (() => {
    const candidates: string[] = [];
    for (const row of statusRows) {
      if (CATEGORY_BY_KEY.has(row.component_key)) candidates.push(row.updated_at);
    }
    if (plan?.updated_at) candidates.push(plan.updated_at);
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, t) =>
      new Date(t).getTime() > new Date(latest).getTime() ? t : latest
    );
  })();

  const conflicts = buildConflicts(cachedReport);
  const health = deriveHealth(
    conflicts.length > 0,
    inProgress,
    completed,
    lastUpdatedAt
  );

  const status: PlanStatus = {
    stageName: deriveStageName(statusByKey),
    healthState: health.state,
    healthLabel: health.label,
    lastUpdatedAt,
    startedAt: plan?.created_at ?? null,
    planStarted: completed > 0 || inProgress > 0,
  };

  const activity = buildActivity(statusRows, Date.now());

  return {
    planId,
    status,
    counts,
    activity,
    conflicts,
    lastConflictCheckAt,
    financialHealth,
  };
}
