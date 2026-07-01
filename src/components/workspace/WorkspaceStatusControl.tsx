"use client";

// TIM-1450: Status badge with auto-advance + explicit completion.
// - not_started → in_progress: automatic on first save (see promoteOnEdit in WorkspaceProgressProvider),
//   plus a manual "Mark In Progress" button so every state has a next-action affordance (TIM-1909).
// - in_progress → complete: manual "Mark Complete" button (single click, no modal)
// - complete → in_progress: manual "Reopen" link
// Replaces the previous 3-button pill (TIM-1147) where all states were clickable.

import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import type { WorkspaceStatus } from "@/lib/workspace-status";

export function WorkspaceStatusControl({
  componentKey,
  label,
}: {
  componentKey: string;
  label?: string;
}) {
  const { statusByKey, setStatus } = useWorkspaceStatus();
  const current = statusByKey.get(componentKey) ?? "not_started";

  return (
    <div className="inline-flex items-center gap-2">
      {label && (
        <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)] font-medium">
          {label}:
        </span>
      )}
      <StatusBadge status={current} />
      <StatusAction
        status={current}
        onMarkInProgress={() => void setStatus(componentKey, "in_progress")}
        onMarkComplete={() => void setStatus(componentKey, "complete")}
        onReopen={() => void setStatus(componentKey, "in_progress")}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: WorkspaceStatus }) {
  const styles = badgeStyleFor(status);
  return (
    <span
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full leading-none ${styles}`}
    >
      {labelFor(status)}
    </span>
  );
}

function StatusAction({
  status,
  onMarkInProgress,
  onMarkComplete,
  onReopen,
}: {
  status: WorkspaceStatus;
  onMarkInProgress: () => void;
  onMarkComplete: () => void;
  onReopen: () => void;
}) {
  if (status === "not_started") {
    // TIM-1909: every state shows a next-action so the header structure stays
    // consistent across workspaces. Auto-advance on edit still applies; this
    // is the explicit kick-off for users who want to claim the workspace
    // before saving any field (e.g. Suppliers, Hiring on a fresh fixture).
    return (
      <button
        type="button"
        onClick={onMarkInProgress}
        className="text-[11px] font-medium text-[var(--teal)] hover:underline leading-none"
      >
        Mark in Progress
      </button>
    );
  }
  if (status === "in_progress") {
    return (
      <button
        type="button"
        onClick={onMarkComplete}
        className="text-[11px] font-medium text-[var(--teal)] hover:underline leading-none"
      >
        Mark Complete
      </button>
    );
  }
  if (status === "complete") {
    return (
      <button
        type="button"
        onClick={onReopen}
        className="text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline leading-none"
      >
        Reopen
      </button>
    );
  }
  return null;
}

function labelFor(status: WorkspaceStatus): string {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "complete":
      return "Complete";
  }
}

function badgeStyleFor(status: WorkspaceStatus): string {
  switch (status) {
    case "not_started":
      return "border border-[var(--warm-700)] text-[var(--muted-foreground)] bg-white";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "complete":
      return "bg-[var(--teal)]/10 text-[var(--teal)]";
  }
}
