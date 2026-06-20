"use client";

// TIM-2775: Benchmarks workspace v2 — WorkspaceHeader + responsive data table.
// Desktop: BenchmarkTableDesktop (one row per metric, grouped by pillar).
// Mobile:  BenchmarkTableMobile (card-per-row, tap → detail sheet).
// Replaces the BenchmarkDashboard chip-grid that was here in v1 (TIM-2498).

import { useCallback, useEffect, useState } from "react";
import { TrendingUp, RefreshCcw } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { BenchmarkTableDesktop } from "@/components/benchmark/BenchmarkTableDesktop";
import { BenchmarkTableMobile } from "@/components/benchmark/BenchmarkTableMobile";
import type { BenchmarkPageData } from "@/components/benchmark/types";

interface BenchmarksWorkspaceProps {
  planId: string;
  initialTrialMessagesUsed?: number;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

async function fetchBenchmarkMetrics(): Promise<BenchmarkPageData> {
  const res = await fetch("/api/benchmarks/all/metrics");
  if (!res.ok) throw new Error("Failed to load benchmark data");
  return res.json() as Promise<BenchmarkPageData>;
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden animate-pulse">
      <div className="bg-[var(--background)] border-b border-[var(--border)] h-10" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border-b border-[var(--border)] bg-white px-4 py-3 flex gap-4">
          <div className="h-4 bg-[var(--muted)] rounded flex-1" />
          <div className="h-4 w-16 bg-[var(--muted)] rounded" />
          <div className="h-4 w-24 bg-[var(--muted)] rounded" />
          <div className="h-4 w-20 bg-[var(--muted)] rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center space-y-2">
      <p className="text-sm font-semibold text-[var(--foreground)]">No benchmark data yet</p>
      <p className="text-xs text-[var(--muted-foreground)] max-w-sm mx-auto">
        We don&apos;t have enough comparison data for this workspace yet. Check back as more coffee
        shops connect their numbers.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-8 text-center space-y-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">
        Benchmark data didn&apos;t load
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Your own numbers are fine. This is just the comparison view.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--teal)] hover:bg-[var(--teal-tint-100)] transition-colors"
      >
        <RefreshCcw size={12} />
        Try again
      </button>
    </div>
  );
}

export function BenchmarksWorkspace({
  planId: _planId,
  initialTrialMessagesUsed: _initialTrialMessagesUsed,
}: BenchmarksWorkspaceProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [data, setData] = useState<BenchmarkPageData | null>(null);

  const load = useCallback(() => {
    setLoadState("loading");
    fetchBenchmarkMetrics()
      .then((d) => {
        setData(d);
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pillars = data?.pillars ?? [];
  const drilldowns = data?.drilldowns ?? {};

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-6 pt-8 pb-16">
        <WorkspaceHeader
          Icon={TrendingUp}
          title="Benchmarks"
          description="See how your numbers compare to real independent coffee shops."
        />

        {loadState === "loading" || loadState === "idle" ? (
          <TableSkeleton />
        ) : loadState === "error" ? (
          <ErrorState onRetry={load} />
        ) : pillars.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Desktop table — hidden on mobile */}
            <div className="hidden md:block">
              <BenchmarkTableDesktop pillars={pillars} drilldowns={drilldowns} />
            </div>

            {/* Mobile card list — hidden on desktop */}
            <div className="block md:hidden">
              <BenchmarkTableMobile pillars={pillars} drilldowns={drilldowns} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
