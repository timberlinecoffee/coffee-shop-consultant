// TIM-2472: Benchmark metrics API.
// Returns cohort + pillar data for the "How You Compare" dashboard.
// Phase 1: mock data. Replace with real cohort-service calls when Phase 1 ships.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { BenchmarkPageData } from "@/components/benchmark/types";

const VALID_SLUGS = ["financials", "operations-playbook", "menu-pricing"] as const;

const slugSchema = z.enum(VALID_SLUGS);

const previewQuerySchema = z.object({
  previewOnly: z.literal("1"),
  shopModel: z.string().optional(),
  locationType: z.string().optional(),
  shopSize: z.string().optional(),
});

const mainQuerySchema = z.object({
  previewOnly: z.string().optional(),
});

// Rate-limit: applied per Standing Engineering Rule 4 (TIM-2246).
// Benchmark data is cached and not an LLM call, so limit is generous.
// TODO: swap to enforceRateLimit() once this workspace is confirmed non-LLM path.

const MOCK_DATA: BenchmarkPageData = {
  cohort: {
    axes: {
      shopModel: ["Espresso bar"],
      locationType: "Urban",
      shopSize: ["500–1,000 sq ft"],
    },
    sampleSize: 42,
    dataFreshnessDate: "May 2026",
    sourceCatalog: "Groundwork Industry Reference v2.1",
    isFallback: false,
  },
  pillars: [
    {
      id: "financials",
      label: "Financials",
      metrics: [
        { id: "cogs_pct", label: "COGS %", value: "28%", status: "green", sourceType: "cohort" },
        { id: "labor_pct", label: "Labor %", value: "38%", status: "yellow", sourceType: "best-practice" },
        { id: "rent_pct", label: "Rent %", value: "9%", status: "blue", sourceType: "cohort" },
        { id: "net_margin", label: "Net margin", value: "11%", status: "blue", sourceType: "both" },
      ],
    },
    {
      id: "operations",
      label: "Operations",
      metrics: [
        { id: "ticket_avg", label: "Avg ticket", value: "$8.40", status: "blue", sourceType: "cohort" },
        { id: "txn_per_hour", label: "Txn/hr", value: "18", status: "green", sourceType: "cohort" },
        { id: "waste_pct", label: "Waste %", value: "—", status: "grey", sourceType: "no data" },
      ],
    },
    {
      id: "menu",
      label: "Menu",
      metrics: [
        { id: "menu_size", label: "Menu items", value: "24", status: "blue", sourceType: "best-practice" },
        { id: "signature_pct", label: "Signature share", value: "22%", status: "yellow", sourceType: "best-practice" },
      ],
    },
  ],
  drilldowns: {
    cogs_pct: {
      metricId: "cogs_pct",
      metricLabel: "COGS %",
      userValue: "28%",
      status: "green",
      sourceType: "cohort",
      percentilePosition: 78,
      percentileLabel: "You are in the top 25% of espresso bars.",
      insightText:
        "Your cost of goods sold is well-controlled at 28%, placing you in the top quartile among similar urban espresso bars. Most shops in your cohort run 30–34%. Your sourcing discipline is paying off.",
      citationSource: "Groundwork Industry Reference v2.1",
      citationDate: "May 2026",
      citationConfidence: "high",
      trendData: [
        { period: "Jan", userValue: 31, cohortMedian: 32, bpLow: 26, bpHigh: 32 },
        { period: "Feb", userValue: 30, cohortMedian: 32, bpLow: 26, bpHigh: 32 },
        { period: "Mar", userValue: 29, cohortMedian: 31, bpLow: 26, bpHigh: 32 },
        { period: "Apr", userValue: 28, cohortMedian: 31, bpLow: 26, bpHigh: 32 },
        { period: "May", userValue: 28, cohortMedian: 31, bpLow: 26, bpHigh: 32 },
      ],
    },
    labor_pct: {
      metricId: "labor_pct",
      metricLabel: "Labor %",
      userValue: "38%",
      status: "yellow",
      sourceType: "best-practice",
      bpLow: 28,
      bpHigh: 35,
      bpUnit: "%",
      userValueNumeric: 38,
      insightText:
        "Your labor cost is running 3 points above the top of the best-practice range. For a solo-operated bar this often reflects an owner transition period. Review shift scheduling — even a half-hour trim per day compounds fast.",
      citationSource: "SCA Specialty Coffee Financial Benchmarks 2025",
      citationDate: "2025 Q4",
      citationConfidence: "high",
    },
    rent_pct: {
      metricId: "rent_pct",
      metricLabel: "Rent %",
      userValue: "9%",
      status: "blue",
      sourceType: "cohort",
      percentilePosition: 48,
      percentileLabel: "You're right at the cohort median.",
      insightText:
        "Your rent-to-revenue ratio is healthy and sits in the median band. Urban espresso bars in your size range typically range from 7–12%. You have room to grow revenue without moving.",
      citationSource: "Groundwork Industry Reference v2.1",
      citationDate: "May 2026",
      citationConfidence: "medium",
    },
    net_margin: {
      metricId: "net_margin",
      metricLabel: "Net margin",
      userValue: "11%",
      status: "blue",
      sourceType: "both",
      percentilePosition: 60,
      bpLow: 8,
      bpHigh: 15,
      bpUnit: "%",
      userValueNumeric: 11,
      insightText:
        "An 11% net margin is solid for specialty coffee. You're above the cohort median and inside the best-practice band. Focus on labor cost (flagged above) to push toward 13–15%.",
      citationSource: "SCA / Groundwork composite",
      citationDate: "May 2026",
      citationConfidence: "high",
    },
    ticket_avg: {
      metricId: "ticket_avg",
      metricLabel: "Avg ticket",
      userValue: "$8.40",
      status: "blue",
      sourceType: "cohort",
      percentilePosition: 55,
      insightText:
        "Your average ticket is right at the cohort median. Adding one add-on item (oat milk, pastry, syrup) to 20% of orders would push you into the top quartile without raising menu prices.",
      citationSource: "Groundwork Industry Reference v2.1",
      citationDate: "May 2026",
      citationConfidence: "medium",
    },
    txn_per_hour: {
      metricId: "txn_per_hour",
      metricLabel: "Txn/hr",
      userValue: "18",
      status: "green",
      sourceType: "cohort",
      percentilePosition: 82,
      insightText:
        "18 transactions per peak hour places you in the top quartile for throughput. Your bar workflow is efficient. This is your biggest competitive advantage.",
      citationSource: "Groundwork Industry Reference v2.1",
      citationDate: "May 2026",
      citationConfidence: "high",
    },
    menu_size: {
      metricId: "menu_size",
      metricLabel: "Menu items",
      userValue: "24",
      status: "blue",
      sourceType: "best-practice",
      bpLow: 18,
      bpHigh: 30,
      userValueNumeric: 24,
      insightText:
        "Your menu size is within the best-practice range. Specialty coffee best practice favors focused menus — 18–30 items keeps quality high and complexity low.",
      citationSource: "SCA Specialty Coffee Retail Standards",
      citationDate: "2025",
      citationConfidence: "medium",
    },
    signature_pct: {
      metricId: "signature_pct",
      metricLabel: "Signature share",
      userValue: "22%",
      status: "yellow",
      sourceType: "best-practice",
      bpLow: 30,
      bpHigh: 50,
      bpUnit: "%",
      userValueNumeric: 22,
      insightText:
        "Signature drinks — your highest-margin items — make up only 22% of sales, below the 30–50% target. Promoting your signature drinks with better positioning or staff recommendations can meaningfully improve margin mix.",
      citationSource: "SCA Specialty Coffee Retail Standards",
      citationDate: "2025",
      citationConfidence: "medium",
    },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> }
) {
  // Engineering Rule 5: wrap auth in try-catch — Supabase connection errors must
  // not surface raw stack traces.
  let user: { id: string } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Engineering Rule 3: validate path param + query params before use.
  const { workspaceSlug: rawSlug } = await params;
  const slugResult = slugSchema.safeParse(rawSlug);
  if (!slugResult.success) {
    return NextResponse.json({ error: "Invalid workspace slug" }, { status: 400 });
  }
  const workspaceSlug = slugResult.data;

  const url = new URL(request.url);
  const rawQuery = Object.fromEntries(url.searchParams.entries());

  if (rawQuery.previewOnly === "1") {
    const queryResult = previewQuerySchema.safeParse(rawQuery);
    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: queryResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { shopModel, locationType: _locationType, shopSize } = queryResult.data;
    const shopModelArr = shopModel ? shopModel.split(",") : [];
    const shopSizeArr = shopSize ? shopSize.split(",") : [];
    const n = Math.max(5, 80 - shopModelArr.length * 10 - (shopSizeArr.length > 1 ? 5 : 0));
    return NextResponse.json({ sampleSize: n });
  }

  // Return mock data (Phase 1: real cohort service not yet available)
  // Filter pillars to those relevant to the requested workspace
  const relevantPillars = MOCK_DATA.pillars.filter((p) => {
    if (workspaceSlug.includes("financials")) return ["financials"].includes(p.id);
    if (workspaceSlug.includes("operations")) return ["operations"].includes(p.id);
    if (workspaceSlug.includes("menu")) return ["menu"].includes(p.id);
    return true;
  });

  const response: BenchmarkPageData = {
    ...MOCK_DATA,
    pillars: relevantPillars.length > 0 ? relevantPillars : MOCK_DATA.pillars,
  };

  return NextResponse.json(response);
}
