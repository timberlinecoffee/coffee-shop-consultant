"use client";

import Link from "next/link";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import type { WorkspaceKey } from "@/types/supabase";

interface WorkspaceShellProps {
  planId: string;
  workspaceKey: WorkspaceKey;
  title: string;
  description: string;
  icon: string;
  shipsWith: string;
  currentFocusLabel?: string;
}

export function WorkspaceShell({
  planId,
  workspaceKey,
  title,
  description,
  icon,
  shipsWith,
  currentFocusLabel,
}: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-[#faf9f7] pb-24 lg:pb-0">
      <nav className="bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-[#155e63] font-medium hover:underline"
          >
            ← Back to dashboard
          </Link>
          <span className="text-xs text-[#6b6b6b]" data-workspace-key={workspaceKey}>
            Workspace · {title}
          </span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-[#efefef] p-8">
          <div className="text-5xl mb-4" aria-hidden="true">
            {icon}
          </div>
          <h1 className="font-semibold text-2xl text-[#1a1a1a] mb-2">{title}</h1>
          <p className="text-sm text-[#6b6b6b] mb-6 leading-relaxed">
            {description}
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#faf9f7] rounded-full border border-[#efefef] mb-6">
            <span className="text-xs font-medium text-[#155e63]">
              Workspace shell stub
            </span>
            <span className="text-xs text-[#6b6b6b]">· {shipsWith}</span>
          </div>
          <p className="text-xs text-[#888] leading-relaxed">
            The Co-pilot is live in this workspace today. Tap the floating
            button to ask questions — it has access to your plan context across
            all 6 workspaces.
          </p>
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey={workspaceKey}
        currentFocus={
          currentFocusLabel ? { label: currentFocusLabel } : undefined
        }
      />

      <BottomTabBar />
    </div>
  );
}
