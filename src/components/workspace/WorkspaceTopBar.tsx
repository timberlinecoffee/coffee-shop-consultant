"use client";

import { usePathname } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/workspace-manifest";
import { WorkspaceStatusControl } from "@/components/workspace/WorkspaceStatusControl";
import { useUiRevamp } from "@/hooks/useUiRevamp";

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
  const uiRevamp = useUiRevamp();

  const activeItem = items.find((item) => pathname.startsWith(item.href));
  const isAccount = pathname.startsWith("/account");
  const currentName = isAccount
    ? "Account"
    : activeItem?.label ?? "Workspace";
  const isWorkspacePage = !!activeItem;

  function openSidebar() {
    window.dispatchEvent(new CustomEvent("workspace-sidebar-open"));
  }

  return (
    <div className="sticky top-0 z-20 h-12 bg-white border-b border-[var(--border)] flex items-center px-4 gap-3">
      {/* TIM-2591: hamburger hidden on mobile when tab bar is active */}
      {!uiRevamp && (
        <button
          onClick={openSidebar}
          className="lg:hidden text-[var(--foreground)] hover:text-[var(--teal)] transition-colors flex-shrink-0"
          aria-label="Open navigation"
        >
          <HamburgerIcon />
        </button>
      )}
      <span className="text-sm font-medium text-[var(--foreground)] flex-1 truncate">
        {currentName}
      </span>
      {isWorkspacePage && (
        <WorkspaceStatusControl
          componentKey={activeItem!.workspaceKey}
          label="Workspace"
        />
      )}
    </div>
  );
}
