"use client";

// TIM-736: Cross-workspace launch readiness check button + result display.
// Streams SSE from /api/copilot/launch-readiness and renders a structured verdict.

import { useState, useCallback } from "react";
import { consumeSseFrames } from "@/components/copilot/sse";

type ReadinessStatus = "green" | "yellow" | "red";

type WorkspaceResult = {
  key: string;
  status: ReadinessStatus;
  blockers: string[];
  topNextActions: string[];
};

type CriticalPathItem = {
  action: string;
  owner: string;
  dueBy: string | null;
};

type ReadinessResult = {
  overall: ReadinessStatus;
  perWorkspace: WorkspaceResult[];
  criticalPath: CriticalPathItem[];
};

const WORKSPACE_LABELS: Record<string, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
};

const STATUS_COLORS: Record<ReadinessStatus, { bg: string; text: string; dot: string; label: string }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Green" },
  yellow: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", label: "Yellow" },
  red: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Red" },
};

export function LaunchReadinessButton({ planId }: { planId: string }) {
  const [state, setState] = useState<"idle" | "thinking" | "done" | "error">("idle");
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setState("thinking");
    setResult(null);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/copilot/launch-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ planId }),
      });

      if (!response.ok || !response.body) {
        setErrorMsg("Request failed. Please try again.");
        setState("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = consumeSseFrames(buffer);
        buffer = rest;

        for (const evt of events) {
          if (evt.event === "result") {
            try {
              const parsed = JSON.parse(evt.data) as ReadinessResult;
              setResult(parsed);
              setState("done");
            } catch {
              setErrorMsg("Could not parse readiness result. Please try again.");
              setState("error");
            }
          } else if (evt.event === "error") {
            try {
              const parsed = JSON.parse(evt.data) as { message?: string };
              setErrorMsg(parsed.message ?? "Something went wrong.");
            } catch {
              setErrorMsg("Something went wrong. Please try again.");
            }
            setState("error");
          }
        }
      }

      // If stream ended without result or error event, it was aborted
      if (state === "thinking") {
        setState("idle");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error. Please try again.");
      setState("error");
    }
  }, [planId, state]);

  return (
    <div className="bg-white rounded-xl border border-[#efefef] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm text-[#1a1a1a] mb-1">Launch Readiness Check</h3>
          <p className="text-xs text-[#6b6b6b]">
            AI grades all 6 workspaces against a launch rubric and surfaces critical blockers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={state === "thinking"}
          className="flex-shrink-0 inline-flex items-center gap-2 text-sm font-semibold text-white bg-[#155e63] hover:bg-[#155e63]/90 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {state === "thinking" ? (
            <>
              <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Checking…
            </>
          ) : (
            <>
              <span aria-hidden>✦</span>
              {state === "done" ? "Re-run" : "Run readiness check"}
            </>
          )}
        </button>
      </div>

      {state === "thinking" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-[#155e63] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#155e63] animate-pulse" />
          Thinking across all 6 workspaces…
        </div>
      )}

      {state === "error" && errorMsg && (
        <div className="mt-4 border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">
          {errorMsg}
          <button
            type="button"
            onClick={() => void runCheck()}
            className="ml-3 text-xs font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {state === "done" && result && <ReadinessResultView result={result} />}
    </div>
  );
}

function ReadinessResultView({ result }: { result: ReadinessResult }) {
  const overall = STATUS_COLORS[result.overall];

  return (
    <div className="mt-5 space-y-5">
      {/* Overall verdict */}
      <div className={`${overall.bg} rounded-lg px-4 py-3 flex items-center gap-3`}>
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${overall.dot}`} />
        <div>
          <p className={`text-sm font-semibold ${overall.text}`}>
            Overall: {overall.label}
          </p>
          <p className="text-xs text-[#555] mt-0.5">
            {result.overall === "green"
              ? "All workspaces are on track."
              : result.overall === "yellow"
              ? "Notable gaps — review yellow workspaces before setting your opening date."
              : "Critical blockers exist — address red workspaces before proceeding."}
          </p>
        </div>
      </div>

      {/* Per-workspace breakdown */}
      <div>
        <p className="text-xs font-semibold text-[#888] uppercase tracking-wide mb-2">
          Workspace Breakdown
        </p>
        <div className="divide-y divide-[#efefef] rounded-lg border border-[#efefef] overflow-hidden">
          {result.perWorkspace.map((ws) => {
            const colors = STATUS_COLORS[ws.status];
            return (
              <div key={ws.key} className="px-4 py-3 bg-white">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <span className="text-xs font-semibold text-[#1a1a1a]">
                    {WORKSPACE_LABELS[ws.key] ?? ws.key}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} ml-auto`}>
                    {colors.label}
                  </span>
                </div>
                {ws.blockers.length > 0 && (
                  <ul className="ml-4 mt-1 space-y-0.5">
                    {ws.blockers.map((b, i) => (
                      <li key={i} className="text-[11px] text-[#555]">
                        ⚠ {b}
                      </li>
                    ))}
                  </ul>
                )}
                {ws.topNextActions.length > 0 && (
                  <ul className="ml-4 mt-1 space-y-0.5">
                    {ws.topNextActions.map((a, i) => (
                      <li key={i} className="text-[11px] text-[#155e63]">
                        → {a}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Critical path */}
      {result.criticalPath.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#888] uppercase tracking-wide mb-2">
            Critical Path
          </p>
          <ol className="space-y-2">
            {result.criticalPath.map((item, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#155e63] text-white flex items-center justify-center text-[10px] font-bold">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[#1a1a1a] font-medium">{item.action}</p>
                  <p className="text-[#888] mt-0.5">
                    {item.owner}
                    {item.dueBy ? ` · by ${item.dueBy}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
