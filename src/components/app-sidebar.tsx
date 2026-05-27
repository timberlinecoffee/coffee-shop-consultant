"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavItem, NavIcon } from "@/lib/workspace-manifest";
import {
  WORKSPACE_CATEGORY_LABEL,
  WORKSPACE_CATEGORY_ORDER,
} from "@/lib/workspace-manifest";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";

export interface AppSidebarProps {
  items: WorkspaceNavItem[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

// TIM-1099: render the same lucide-react icon the page header uses, sourced
// from the shared WORKSPACE_ICONS map so the two can't drift.
function NavIconGlyph({ icon, size = 15 }: { icon: NavIcon; size?: number }) {
  const Icon = WORKSPACE_ICONS[icon];
  if (!Icon) return null;
  return <Icon width={size} height={size} strokeWidth={1.75} aria-hidden="true" />;
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CollapseIcon({ flipped }: { flipped?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: flipped ? "scaleX(-1)" : undefined }}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// TIM-1062
function ExportPlanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 12 15 15" />
    </svg>
  );
}

// ── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  isActive: boolean;
  collapsed: boolean;
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
    if (collapsed) {
      return (
        <span
          aria-disabled="true"
          title={item.label}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-[#c0c0c0] cursor-default select-none mx-auto"
        >
          <LockIcon />
        </span>
      );
    }
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#afafaf] cursor-default select-none"
      >
        <LockIcon />
        <span className="text-sm">{item.label}</span>
      </span>
    );
  }

  if (collapsed) {
    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        title={item.label}
        onClick={onNavigate}
        className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors mx-auto ${
          isActive
            ? "bg-[#155e63]/10 text-[#155e63]"
            : "text-[#6b6b6b] hover:bg-[#f5f4f0] hover:text-[#1a1a1a]"
        }`}
      >
        <NavIconGlyph icon={item.icon} size={17} />
      </Link>
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
        <div className="flex items-center gap-2 min-w-0">
          <NavIconGlyph icon={item.icon} size={14} />
          <span className="text-sm truncate">{item.label}</span>
        </div>
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

// ── Sidebar content ───────────────────────────────────────────────────────────

function SidebarContent({
  items,
  collapsed,
  onToggleCollapse,
  onClose,
  firstLinkRef,
}: {
  items: WorkspaceNavItem[];
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  firstLinkRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div
        className={`flex items-center border-b border-[#efefef] flex-shrink-0 ${
          collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"
        }`}
      >
        {collapsed ? (
          <Link
            href="/dashboard"
            ref={firstLinkRef}
            title="Timberline"
            className="flex items-center justify-center"
            onClick={onClose}
          >
            <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
          </Link>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Workspace nav — TIM-1142: grouped by phase category */}
      <nav
        aria-label="Workspace navigation"
        className={`flex-1 overflow-y-auto py-4 ${collapsed ? "px-1" : "px-2"}`}
      >
        {WORKSPACE_CATEGORY_ORDER.map((category, index) => {
          const groupItems = items.filter((item) => item.category === category);
          if (groupItems.length === 0) return null;

          return (
            <section
              key={category}
              aria-labelledby={`nav-cat-${category}`}
              className={collapsed ? (index === 0 ? "" : "mt-3") : index === 0 ? "" : "mt-4"}
            >
              {collapsed ? (
                <div
                  id={`nav-cat-${category}`}
                  role="separator"
                  aria-label={WORKSPACE_CATEGORY_LABEL[category]}
                  className="mx-2 my-2 h-px bg-[#efefef]"
                />
              ) : (
                <div className="mb-1.5 px-3">
                  <span
                    id={`nav-cat-${category}`}
                    className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wider"
                  >
                    {WORKSPACE_CATEGORY_LABEL[category]}
                  </span>
                </div>
              )}
              <ul role="list" className="space-y-0.5">
                {groupItems.map((item) => (
                  <li key={item.moduleNumber}>
                    <NavItem
                      item={item}
                      isActive={pathname.startsWith(item.href)}
                      collapsed={collapsed}
                      onNavigate={onClose}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>

      {/* TIM-1062: Export Business Plan — single entry point from any workspace */}
      <div className={`border-t border-[#efefef] py-3 flex-shrink-0 ${collapsed ? "px-1" : "px-2"}`}>
        {collapsed ? (
          <Link
            href="/workspace/business-plan/print"
            target="_blank"
            title="Export Business Plan"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-lg mx-auto text-[#155e63] hover:bg-[#155e63]/5 transition-colors"
          >
            <ExportPlanIcon />
          </Link>
        ) : (
          <Link
            href="/workspace/business-plan/print"
            target="_blank"
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-[#155e63] hover:bg-[#155e63]/5 transition-colors"
          >
            <ExportPlanIcon />
            Export Business Plan
          </Link>
        )}
      </div>

      {/* Account link */}
      <div className={`border-t border-[#efefef] py-3 flex-shrink-0 ${collapsed ? "px-1" : "px-2"}`}>
        {collapsed ? (
          <Link
            href="/account"
            title="Account"
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
            onClick={onClose}
            className={`flex items-center justify-center w-10 h-10 rounded-lg mx-auto transition-colors ${
              pathname.startsWith("/account")
                ? "bg-[#155e63]/10 text-[#155e63]"
                : "text-[#6b6b6b] hover:bg-[#f5f4f0] hover:text-[#1a1a1a]"
            }`}
          >
            <AccountIcon />
          </Link>
        ) : (
          <Link
            href="/account"
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
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
        )}
      </div>

      {/* Desktop collapse toggle */}
      {onToggleCollapse && (
        <div className={`border-t border-[#efefef] py-2 flex-shrink-0 ${collapsed ? "px-1" : "px-2"}`}>
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`flex items-center rounded-lg text-[#afafaf] hover:text-[#1a1a1a] hover:bg-[#f5f4f0] transition-colors py-2 ${
              collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-2 px-3 w-full"
            }`}
          >
            <CollapseIcon flipped={collapsed} />
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      )}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AppSidebar({ items, collapsed = false, onToggleCollapse }: AppSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Keyboard: Escape closes drawer; Tab/Shift+Tab trapped within drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(FOCUSABLE)
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  const sidebarWidth = collapsed ? "w-[64px]" : "w-[224px]";

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen ${sidebarWidth} bg-white border-r border-[#efefef] z-30 transition-all duration-200`}
        aria-label="Workspace navigation"
      >
        <SidebarContent
          items={items}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>

      {/* Mobile overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer (always expanded) */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Workspace navigation"
        className={`fixed top-0 left-0 h-screen w-[280px] bg-white z-50 lg:hidden transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent
          items={items}
          collapsed={false}
          onClose={closeDrawer}
          firstLinkRef={firstLinkRef}
        />
      </div>
    </>
  );
}
