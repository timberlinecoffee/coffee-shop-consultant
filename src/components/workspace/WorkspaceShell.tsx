"use client";

import type { LucideIcon } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import type { WorkspaceKey } from "@/types/supabase";

interface WorkspaceShellProps {
  planId: string;
  workspaceKey: WorkspaceKey;
  title: string;
  description: string;
  icon: LucideIcon;
  currentFocusLabel?: string;
  trialMessagesUsed?: number;
}

export function WorkspaceShell({
  planId,
  workspaceKey,
  title,
  description,
  icon: Icon,
  currentFocusLabel,
  trialMessagesUsed,
}: WorkspaceShellProps) {
  return (
    <div className="bg-[var(--background)]">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        {/* Page header — matches Concept page header pattern */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Icon
              className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
              aria-hidden="true"
            />
            <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
              {title}
            </h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            {description}
          </p>
        </header>

        {/* Placeholder content card — matches Concept card design (TIM-1408: rounded-xl) */}
        <div className="rounded-xl border border-[var(--border)] bg-white">
          <div className="px-5 pt-5 pb-4">
            <div className="mb-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">
                This workspace is being built
              </span>
              <p className="text-xs text-[var(--dark-grey)] mt-0.5">
                Full tools are on the way.
              </p>
            </div>
            <p className="mt-2 text-sm text-[var(--dark-grey)] italic leading-relaxed">
              The Co-pilot can answer questions and help you plan right now. Tap
              the Co-pilot button to get started.
            </p>
          </div>
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey={workspaceKey}
        currentFocus={
          currentFocusLabel ? { label: currentFocusLabel } : undefined
        }
        initialTrialMessagesUsed={trialMessagesUsed}
      />
    </div>
  );
}
