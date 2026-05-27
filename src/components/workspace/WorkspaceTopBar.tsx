"use client";

import { usePathname } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/workspace-manifest";
import { WorkspaceStatusControl } from "@/components/workspace/WorkspaceStatusControl";

export interface WorkspaceTopBarProps {
  items: WorkspaceNavItem[];
}

function HamburgerIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function WorkspaceTopBar({ items }: WorkspaceTopBarProps) {
  const pathname = usePathname();

  const activeItem = items.find((item) => pathname.startsWith(item.href));
  const isAccount = pathname.startsWith("/account");
  const currentName = isAccount
    ? "Account"
    : activeItem?.label ?? "Workspace";
  const isWorkspacePage = !!activeItem;

  function openSidebar() {
    window.dispatchEvent(new CustomEvent("workspace-sidebar-open"));
  }

  function openCopilot() {
    window.dispatchEvent(new CustomEvent("workspace-copilot-open"));
  }

  return (
    <div className="sticky top-0 z-20 h-12 bg-white border-b border-[#efefef] flex items-center px-4 gap-3">
      <button
        onClick={openSidebar}
        className="lg:hidden text-[#1a1a1a] hover:text-[#155e63] transition-colors flex-shrink-0"
        aria-label="Open navigation"
      >
        <HamburgerIcon />
      </button>
      <span className="text-sm font-medium text-[#1a1a1a] flex-1 truncate">
        {currentName}
      </span>
      {isWorkspacePage && (
        <>
          {/* TIM-1147: Manual workspace status control. */}
          <WorkspaceStatusControl
            componentKey={activeItem!.workspaceKey}
            label="Workspace"
          />
          <button
            onClick={openCopilot}
            className="text-xs text-[#155e63] font-medium border border-[#155e63]/30 px-3 py-1 rounded-full hover:bg-[#155e63]/5 transition-colors flex-shrink-0"
          >
            Co-pilot
          </button>
        </>
      )}
    </div>
  );
}
