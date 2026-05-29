"use client";

// TIM-1147: 3-state status pill control. Rendered in the workspace top bar
// (one per workspace) so the founder can manually mark every workspace +
// component as Not Started / In Progress / Complete. Disabled when the
// active route isn't a workspace.

import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import {
  WORKSPACE_STATUS_LABEL,
  WORKSPACE_STATUS_VALUES,
  type WorkspaceStatus,
} from "@/lib/workspace-status";

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
    <div className="inline-flex items-center gap-1.5">
      {label && (
        <span className="hidden sm:inline text-[11px] text-[var(--muted-foreground)] font-medium">
          {label}:
        </span>
      )}
      <div
        role="group"
        aria-label={label ? `${label} status` : "Component status"}
        className="inline-flex rounded-full border border-[var(--warm-700)] bg-white p-0.5"
      >
        {WORKSPACE_STATUS_VALUES.map((value) => (
          <StatusButton
            key={value}
            value={value}
            current={current}
            onSelect={() => {
              if (current !== value) void setStatus(componentKey, value);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatusButton({
  value,
  current,
  onSelect,
}: {
  value: WorkspaceStatus;
  current: WorkspaceStatus;
  onSelect: () => void;
}) {
  const active = value === current;
  const styles = active ? activeStyleFor(value) : "text-[var(--muted-foreground)] hover:bg-[var(--surface-warm-100)]";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors leading-none ${styles}`}
    >
      {WORKSPACE_STATUS_LABEL[value]}
    </button>
  );
}

function activeStyleFor(value: WorkspaceStatus): string {
  switch (value) {
    case "not_started":
      return "bg-[var(--border)] text-[var(--foreground)]";
    case "in_progress":
      return "bg-amber-100 text-amber-800";
    case "complete":
      return "bg-[var(--teal)]/10 text-[var(--teal)]";
  }
}
