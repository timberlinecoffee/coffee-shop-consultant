"use client";

// TIM-2498: Standalone Benchmarks workspace — full-suite view using the "all"
// pillar slug so every metric category is visible in one place.
//
// Note: CoPilot drawer omitted for now — adding workspaceKey="benchmarks" to
// the ai_conversations constraint requires a migration (follow-up).

import { TrendingUp } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { BenchmarkDashboard } from "@/components/benchmark/BenchmarkDashboard";

interface BenchmarksWorkspaceProps {
  planId: string;
  initialTrialMessagesUsed?: number;
}

export function BenchmarksWorkspace({
  planId: _planId,
  initialTrialMessagesUsed: _initialTrialMessagesUsed,
}: BenchmarksWorkspaceProps) {
  function handleAskBenchmark(metricId: string, metricLabel: string) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("copilot:open-in-mode", {
          detail: {
            mode: "benchmark",
            scope: "benchmarks",
            focus: { metricId, metricLabel },
          },
        }),
      );
    }
  }

  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        <WorkspaceHeader
          Icon={TrendingUp}
          title="Benchmarks"
          description="See how your numbers compare to real independent coffee shops."
        />

        <BenchmarkDashboard
          workspaceSlug="all"
          onAskBenchmark={handleAskBenchmark}
          onApplySuggestion={() => {
            // Apply path is a follow-up (TIM-2450b).
          }}
        />
      </div>
    </div>
  );
}
