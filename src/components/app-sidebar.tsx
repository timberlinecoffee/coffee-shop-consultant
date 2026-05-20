"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/workspace-manifest";

export interface AppSidebarProps {
  items: WorkspaceNavItem[];
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function NavItem({
  item,
  isActive,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const isComplete =
    item.totalSections !== null &&
    item.completedSections >= item.totalSections;
  const isInProgress =
    item.totalSections !== null &&
    item.completedSections > 0 &&
    item.completedSections < item.totalSections;

  if (!item.isUnlocked) {
    return (
      <span
        role="listitem"
        aria-disabled="true"
        title="Coming soon"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#afafaf] cursor-default select-none"
      >
        <LockIcon />
        <span className="text-sm">{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`flex flex-col px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? "border-l-2 border-[#155e63] pl-[10px] bg-[#155e63]/5 font-semibold text-[#155e63]"
          : "text-[#1a1a1a] hover:bg-[#f5f4f0]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{item.label}</span>
        {isComplete && (
          <span className="text-[#155e63] flex-shrink-0">
            <CheckIcon />
          </span>
        )}
      </div>
      {isInProgress && item.totalSections && (
        <>
          <div className="mt-1.5 h-1 bg-[#efefef] rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full"
              style={{
                width: `${(item.completedSections / item.totalSections) * 100}%`,
              }}
            />
          </div>
          <span className="mt-1 text-xs text-[#afafaf]">
            {item.completedSections} of {item.totalSections} sections
          </span>
        </>
      )}
      {isComplete && (
        <div className="mt-1.5 h-1 bg-[#155e63] rounded-full" />
      )}
    </Link>
  );
}

function SidebarContent({
  items,
  onClose,
  firstLinkRef,
}: {
  items: WorkspaceNavItem[];
  onClose?: () => void;
  firstLinkRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#efefef] flex-shrink-0">
        <Link
          href="/dashboard"
          ref={firstLinkRef}
          className="flex items-center gap-2"
          onClick={onClose}
        >
          <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">TCS</span>
          </div>
          <span className="text-sm font-semibold text-[#1a1a1a]">
            Timberline
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-[#afafaf] hover:text-[#1a1a1a] p-1 transition-colors"
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Workspace nav */}
      <nav
        aria-label="Workspace navigation"
        className="flex-1 px-2 py-4 overflow-y-auto"
      >
        <div className="mb-2 px-3">
          <span className="text-xs font-medium text-[#afafaf] uppercase tracking-wide">
            Workspaces
          </span>
        </div>
        <ul role="list" className="space-y-0.5">
          {items.map((item) => (
            <li key={item.moduleNumber}>
              <NavItem
                item={item}
                isActive={pathname.startsWith(item.href)}
                onNavigate={onClose}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Account link */}
      <div className="border-t border-[#efefef] px-2 py-3 flex-shrink-0">
        <Link
          href="/account"
          aria-current={
            pathname.startsWith("/account") ? "page" : undefined
          }
          onClick={onClose}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            pathname.startsWith("/account")
              ? "border-l-2 border-[#155e63] pl-[10px] bg-[#155e63]/5 font-semibold text-[#155e63]"
              : "text-[#1a1a1a] hover:bg-[#f5f4f0]"
          }`}
        >
          <AccountIcon />
          Account
        </Link>
      </div>
    </div>
  );
}

export function AppSidebar({ items }: AppSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Listen for hamburger trigger from WorkspaceTopBar
  useEffect(() => {
    const open = () => setDrawerOpen(true);
    window.addEventListener("workspace-sidebar-open", open);
    return () => window.removeEventListener("workspace-sidebar-open", open);
  }, []);

  // Body scroll lock + focus management
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
      firstLinkRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  // Escape key closes drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-[224px] bg-white border-r border-[#efefef] z-30"
        aria-label="Workspace navigation"
      >
        <SidebarContent items={items} />
      </aside>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workspace navigation"
        className={`fixed top-0 left-0 h-screen w-[280px] bg-white z-50 lg:hidden transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent
          items={items}
          onClose={closeDrawer}
          firstLinkRef={firstLinkRef}
        />
      </div>
    </>
  );
}
