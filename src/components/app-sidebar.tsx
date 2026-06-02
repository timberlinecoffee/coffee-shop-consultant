"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavItem, NavIcon, WorkspaceCategory } from "@/lib/workspace-manifest";
import { Logo, LogoMark } from "@/app/_components/Logo";
import {
  WORKSPACE_CATEGORY_LABEL,
  WORKSPACE_CATEGORY_ORDER,
} from "@/lib/workspace-manifest";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import {
  WORKSPACE_STATUS_LABEL,
  type WorkspaceStatus,
} from "@/lib/workspace-status";

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

function ChevronIcon({ open }: { open: boolean }) {
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
      className="transition-transform duration-150"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      <polyline points="6 9 12 15 18 9" />
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

// TIM-1213
function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

// ── Nav item ─────────────────────────────────────────────────────────────────

// TIM-1152: color-coded status pill rendered in sidebar + workspace headers.
function statusPillClasses(status: WorkspaceStatus): string {
  switch (status) {
    case "complete":
      return "bg-[var(--teal)]/10 text-[var(--teal)] border-[var(--teal)]/20";
    case "in_progress":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "not_started":
      return "bg-[var(--surface-warm-100)] text-[var(--neutral-cool-500)] border-[var(--warm-700)]";
  }
}

function SidebarStatusPill({ status }: { status: WorkspaceStatus }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-[1px] rounded-full border leading-none whitespace-nowrap ${statusPillClasses(status)}`}
    >
      {WORKSPACE_STATUS_LABEL[status]}
    </span>
  );
}

function statusDotClass(status: WorkspaceStatus): string {
  switch (status) {
    case "complete":
      return "bg-[var(--teal)]";
    case "in_progress":
      return "bg-amber-400";
    case "not_started":
      return "bg-[var(--warm-1000)]";
  }
}

function NavItem({
  item,
  isActive,
  collapsed,
  showStatus,
  onNavigate,
}: {
  item: WorkspaceNavItem;
  isActive: boolean;
  collapsed: boolean;
  // TIM-1213: when false (Menu mode), suppress all per-item status chrome.
  showStatus: boolean;
  onNavigate?: () => void;
}) {
  // TIM-1152: surface manual status as a color-coded pill on every workspace
  // row (Not Started / In Progress / Complete). Replaces the prior check-icon
  // + thin auto-bar treatment from TIM-1147.
  const status: WorkspaceStatus = item.status;

  if (!item.isUnlocked) {
    if (collapsed) {
      return (
        <span
          aria-disabled="true"
          title={item.label}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--neutral-cool-400)] cursor-default select-none mx-auto"
        >
          <LockIcon />
        </span>
      );
    }
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[var(--dark-grey)] cursor-default select-none"
      >
        <LockIcon />
        <span className="text-sm">{item.label}</span>
      </span>
    );
  }

  if (collapsed) {
    // Tiny color-coded dot at bottom-right of the icon so status is still
    // visible when the sidebar is collapsed. TIM-1213: only in Status mode.
    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        title={showStatus ? `${item.label} — ${WORKSPACE_STATUS_LABEL[status]}` : item.label}
        onClick={onNavigate}
        className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors mx-auto ${
          isActive
            ? "bg-[var(--teal)]/10 text-[var(--teal)]"
            : "text-[var(--muted-foreground)] hover:bg-[var(--surface-warm-100)] hover:text-[var(--foreground)]"
        }`}
      >
        <NavIconGlyph icon={item.icon} size={17} />
        {showStatus && (
          <span
            aria-hidden="true"
            className={`absolute bottom-1 right-1 w-2 h-2 rounded-full ring-1 ring-white ${statusDotClass(status)}`}
          />
        )}
      </Link>
    );
  }

  // TIM-1213: Menu mode — clean single-row item, no status pill / check chrome.
  if (!showStatus) {
    return (
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors min-w-0 ${
          isActive
            ? "border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
            : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
        }`}
      >
        <NavIconGlyph icon={item.icon} size={14} />
        <span className="text-sm truncate flex-1 min-w-0">{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`flex flex-col gap-1 px-3 py-2 rounded-lg transition-colors ${
        isActive
          ? "border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
          : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <NavIconGlyph icon={item.icon} size={14} />
        <span className="text-sm truncate flex-1 min-w-0">{item.label}</span>
        {status === "complete" && (
          <span className="text-[var(--teal)] flex-shrink-0" aria-hidden="true">
            <CheckIcon />
          </span>
        )}
      </div>
      <div className="pl-[22px]">
        <SidebarStatusPill status={status} />
      </div>
    </Link>
  );
}

// ── Sidebar content ───────────────────────────────────────────────────────────

// TIM-1154: persist per-user expand/collapse state for each sidebar category.
// Versioned key — bump suffix if the set of categories changes incompatibly.
const CATEGORY_COLLAPSED_KEY = "tcs-sidebar-category-collapsed-v1";

type CategoryCollapsedMap = Partial<Record<WorkspaceCategory, boolean>>;

const EMPTY_COLLAPSED_MAP: CategoryCollapsedMap = {};

function parseCollapsedMap(raw: string | null): CategoryCollapsedMap {
  if (!raw) return EMPTY_COLLAPSED_MAP;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return EMPTY_COLLAPSED_MAP;
    const out: CategoryCollapsedMap = {};
    let hasAny = false;
    for (const cat of WORKSPACE_CATEGORY_ORDER) {
      const v = (parsed as Record<string, unknown>)[cat];
      if (typeof v === "boolean") {
        out[cat] = v;
        hasAny = true;
      }
    }
    return hasAny ? out : EMPTY_COLLAPSED_MAP;
  } catch {
    return EMPTY_COLLAPSED_MAP;
  }
}

// Cache the parsed snapshot so useSyncExternalStore gets a stable reference
// between calls when the underlying storage hasn't changed.
let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: CategoryCollapsedMap = EMPTY_COLLAPSED_MAP;

function getCollapsedSnapshot(): CategoryCollapsedMap {
  const raw = window.localStorage.getItem(CATEGORY_COLLAPSED_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parseCollapsedMap(raw);
  return cachedSnapshot;
}

function subscribeCollapsed(notify: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === CATEGORY_COLLAPSED_KEY) notify();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function useCategoryCollapsed(): {
  isCollapsed: (cat: WorkspaceCategory) => boolean;
  toggle: (cat: WorkspaceCategory) => void;
} {
  const state = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    () => EMPTY_COLLAPSED_MAP,
  );

  const isCollapsed = useCallback(
    (cat: WorkspaceCategory) => Boolean(state[cat]),
    [state]
  );

  const toggle = useCallback((cat: WorkspaceCategory) => {
    const current = getCollapsedSnapshot();
    const next: CategoryCollapsedMap = { ...current, [cat]: !current[cat] };
    try {
      window.localStorage.setItem(CATEGORY_COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    // localStorage writes from this tab don't fire `storage`, so bust the
    // snapshot cache and dispatch a same-tab event to trigger re-render.
    cachedRaw = undefined;
    window.dispatchEvent(new StorageEvent("storage", { key: CATEGORY_COLLAPSED_KEY }));
  }, []);

  return { isCollapsed, toggle };
}

// TIM-1213: persist the sidebar status-visibility preference per user.
// Stored as "1" (Status mode) / "0" (Menu mode). Default = Menu mode (off):
// the founder's lead sentiment disliked the per-item statuses, so the glance
// view is opt-in. Versioned key — bump suffix if semantics change.
const SHOW_STATUS_KEY = "tcs-sidebar-show-status-v1";

function getShowStatusSnapshot(): boolean {
  return window.localStorage.getItem(SHOW_STATUS_KEY) === "1";
}

function subscribeShowStatus(notify: () => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === SHOW_STATUS_KEY) notify();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function useShowStatus(): { showStatus: boolean; toggle: () => void } {
  const showStatus = useSyncExternalStore(
    subscribeShowStatus,
    getShowStatusSnapshot,
    () => false, // SSR / pre-hydration default: Menu mode
  );

  const toggle = useCallback(() => {
    const next = !getShowStatusSnapshot();
    try {
      window.localStorage.setItem(SHOW_STATUS_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    // localStorage writes from this tab don't fire `storage`; dispatch a
    // same-tab event so useSyncExternalStore re-reads the snapshot.
    window.dispatchEvent(new StorageEvent("storage", { key: SHOW_STATUS_KEY }));
  }, []);

  return { showStatus, toggle };
}

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
  const { isCollapsed: isCategoryCollapsed, toggle: toggleCategory } =
    useCategoryCollapsed();
  const { showStatus, toggle: toggleShowStatus } = useShowStatus();

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div
        className={`flex items-center border-b border-[var(--border)] flex-shrink-0 ${
          collapsed ? "justify-center px-2 py-4" : "justify-between px-4 py-4"
        }`}
      >
        {collapsed ? (
          <Link
            href="/dashboard"
            ref={firstLinkRef}
            title="Groundwork"
            className="flex items-center justify-center"
            onClick={onClose}
          >
            <LogoMark variant="color" height={28} />
          </Link>
        ) : (
          <>
            <Link
              href="/dashboard"
              ref={firstLinkRef}
              className="flex items-center gap-2"
              aria-label="Groundwork home"
              onClick={onClose}
            >
              <Logo variant="color" height={28} />
            </Link>
            {onClose && (
              <button
                onClick={onClose}
                className="lg:hidden text-[var(--dark-grey)] hover:text-[var(--foreground)] p-1 transition-colors"
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

          // TIM-1154: in icon-only collapsed mode, the category headers reduce to
          // hairline separators (no toggle UX). Per-category expand/collapse only
          // applies when the sidebar is in its full-width state.
          const isOpen = collapsed ? true : !isCategoryCollapsed(category);
          const panelId = `nav-cat-panel-${category}`;
          const headerId = `nav-cat-${category}`;

          return (
            <section
              key={category}
              aria-labelledby={headerId}
              className={collapsed ? (index === 0 ? "" : "mt-3") : index === 0 ? "" : "mt-4"}
            >
              {collapsed ? (
                <div
                  id={headerId}
                  role="separator"
                  aria-label={WORKSPACE_CATEGORY_LABEL[category]}
                  className="mx-2 my-2 h-px bg-[var(--border)]"
                />
              ) : (
                <button
                  id={headerId}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="group flex w-full items-center justify-between px-3 py-1 mb-1 rounded-md text-left hover:bg-[var(--surface-warm-100)] transition-colors"
                >
                  <span className="text-[10px] font-semibold text-[var(--dark-grey)] uppercase tracking-wider group-hover:text-[var(--muted-foreground)]">
                    {WORKSPACE_CATEGORY_LABEL[category]}
                  </span>
                  <span className="text-[var(--dark-grey)] group-hover:text-[var(--muted-foreground)]">
                    <ChevronIcon open={isOpen} />
                  </span>
                </button>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  transition: "grid-template-rows 150ms ease-out",
                }}
                aria-hidden={!isOpen}
              >
                <div style={{ overflow: "hidden" }}>
                  <ul id={panelId} role="list" className="space-y-0.5">
                    {groupItems.map((item) => (
                      <li key={item.moduleNumber}>
                        <NavItem
                          item={item}
                          isActive={pathname.startsWith(item.href)}
                          collapsed={collapsed}
                          showStatus={showStatus}
                          onNavigate={onClose}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </nav>

      {/* TIM-1351: compact footer — Account icon + quiet Show Progress toggle,
          consolidated into one light row. Collapse control rides along on the
          right in desktop (expanded) mode. */}
      <div
        className={`border-t border-[var(--border)] py-2 flex-shrink-0 ${collapsed ? "px-1" : "px-2"}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/account"
              title="Account"
              aria-label="Account"
              aria-current={pathname.startsWith("/account") ? "page" : undefined}
              onClick={onClose}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                pathname.startsWith("/account")
                  ? "bg-[var(--teal)]/10 text-[var(--teal)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-warm-100)] hover:text-[var(--foreground)]"
              }`}
            >
              <AccountIcon />
            </Link>
            <button
              type="button"
              role="switch"
              aria-checked={showStatus}
              onClick={toggleShowStatus}
              title={showStatus ? "Hide Progress" : "Show Progress"}
              aria-label={showStatus ? "Hide Progress" : "Show Progress"}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                showStatus
                  ? "text-[var(--teal)] bg-[var(--teal)]/5"
                  : "text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
              }`}
            >
              {showStatus ? <EyeIcon /> : <EyeOffIcon />}
            </button>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <CollapseIcon flipped />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Link
              href="/account"
              title="Account"
              aria-label="Account"
              aria-current={pathname.startsWith("/account") ? "page" : undefined}
              onClick={onClose}
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                pathname.startsWith("/account")
                  ? "bg-[var(--teal)]/10 text-[var(--teal)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-warm-100)] hover:text-[var(--foreground)]"
              }`}
            >
              <AccountIcon />
            </Link>
            <button
              type="button"
              role="switch"
              aria-checked={showStatus}
              onClick={toggleShowStatus}
              title={showStatus ? "Hide Progress" : "Show Progress"}
              aria-label={showStatus ? "Hide Progress" : "Show Progress"}
              className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                showStatus
                  ? "text-[var(--teal)] bg-[var(--teal)]/5"
                  : "text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
              }`}
            >
              {showStatus ? <EyeIcon /> : <EyeOffIcon />}
            </button>
            {onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="ml-auto flex items-center justify-center w-9 h-9 rounded-lg text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <CollapseIcon />
              </button>
            )}
          </div>
        )}
      </div>
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
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen ${sidebarWidth} bg-white border-r border-[var(--border)] z-30 transition-all duration-200`}
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
