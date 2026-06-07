"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";

// TIM-2461: dashboard Refresh button re-runs the Plan Quality Check (TIM-2394
// /api/business-plan/audit) on demand, then refreshes the server-rendered
// dashboard to pick up the new cached conflict list.
export function RefreshConflictsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    try {
      const res = await fetch("/api/business-plan/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        if (res.status === 402) {
          setError("Conflict check requires a paid plan.");
          return;
        }
        if (res.status === 429) {
          setError("Too many checks. Try again in a moment.");
          return;
        }
        setError("Could not refresh conflicts.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Could not refresh conflicts.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-xs text-amber-700" role="status">
          {error}
        </span>
      ) : null}
      <WorkspaceActionButton
        onClick={onClick}
        disabled={pending}
        aria-label="Refresh conflict check"
        title="Refresh conflict check"
      >
        <RefreshCw
          size={WORKSPACE_ACTION_ICON_SIZE}
          className={pending ? "animate-spin" : undefined}
          aria-hidden="true"
        />
      </WorkspaceActionButton>
    </div>
  );
}
