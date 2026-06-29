"use client";

// TIM-2590: SidebarV2 — category nav with expandable sub-items + ProfileMenu popover.
// Rendered when ui_revamp_v2 flag is on. Existing app-sidebar.tsx untouched.
// TIM-3014: expanded from 5 flat items to category+sub-item groups per TIM-3013 IA mapping.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide sections: Design Tokens, Nav components, Profile popover
//   References:
//     src/components/app-sidebar.tsx — category expand/collapse pattern
//       (gridTemplateRows animation, useSyncExternalStore, ChevronIcon)
//     src/components/app-sidebar.tsx — active-state pattern
//       (border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5)
//   All values from existing token set: --teal, --background, --foreground,
//     --border, --muted-foreground, --surface-warm-100, --dark-grey, --card
//   Voice Mandate: no em dashes, no "unlock/leverage/embark/elevate/delve"

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Layers,
  BarChart2,
  ClipboardList,
  User,
  CreditCard,
  Settings,
  LogOut,
  Moon,
  Sun,
  LifeBuoy,
  Shield,
} from "lucide-react";
import { Logo, LogoMark } from "@/app/_components/Logo";
import { RevertToggle } from "@/components/account/RevertToggle";
import { HiringRevertToggle } from "@/components/account/HiringRevertToggle";
import { ProjectSwitcher } from "@/components/project-switcher";

export interface SidebarV2UserInfo {
  email: string;
  displayName: string | null;
  planLabel: string;
  uiRevampEnabled: boolean;
  hiringRevampEnabled: boolean;
  isPro: boolean;
}

// ── Nav category definitions ───────────────────────────────────────────────
// TIM-3014: IA mapping from TIM-3013 — every workspace nested under its category.

type V2Icon = React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

interface V2SubItem {
  label: string;
  href: string;
}

interface V2NavCategory {
  key: string;
  label: string;
  icon: V2Icon;
  href?: string;         // direct link (Home only — no sub-items)
  subItems?: V2SubItem[]; // expandable categories
}

const NAV_CATEGORIES: V2NavCategory[] = [
  {
    key: "home",
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    key: "plan",
    label: "Plan",
    icon: FileText,
    subItems: [
      { label: "Concept", href: "/workspace/concept" },
      { label: "Business Plan", href: "/workspace/business-plan" },
    ],
  },
  {
    key: "build",
    label: "Build",
    icon: Layers,
    subItems: [
      { label: "Location & Lease", href: "/workspace/location-lease" },
      { label: "Menu & Pricing", href: "/workspace/menu-pricing" },
      { label: "Equipment & Supplies", href: "/workspace/buildout-equipment" },
      { label: "Suppliers & Vendors", href: "/workspace/suppliers" },
      { label: "Hiring & Onboarding", href: "/workspace/hiring" },
      { label: "Launch Plan", href: "/workspace/launch-plan" },
    ],
  },
  {
    key: "financials",
    label: "Financials",
    icon: BarChart2,
    subItems: [
      { label: "Financials", href: "/workspace/financials" },
    ],
  },
  {
    key: "run",
    label: "Run",
    icon: ClipboardList,
    subItems: [
      { label: "Operations Playbook", href: "/workspace/operations-playbook" },
      { label: "Marketing", href: "/workspace/marketing" },
    ],
  },
];

// ── Category expand/collapse state ─────────────────────────────────────────
// Default: all categories expanded. A category is expanded unless explicitly
// collapsed by the user. Persisted per-browser via localStorage.

const V2_CATEGORY_COLLAPSED_KEY = "tcs-v2-nav-collapsed-v1";

type V2CollapsedState = Partial<Record<string, boolean>>;

function useV2CategoryExpanded() {
  const [collapsed, setCollapsed] = useState<V2CollapsedState>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(V2_CATEGORY_COLLAPSED_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      // Guard against "null", arrays, or non-objects written by other code paths.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setCollapsed(parsed as V2CollapsedState);
      }
    } catch {
      // ignore
    }
  }, []);

  const isExpanded = useCallback((key: string) => !collapsed[key], [collapsed]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(V2_CATEGORY_COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Force-open a category without toggling (used when navigating directly to a sub-item URL).
  const forceExpand = useCallback((key: string) => {
    setCollapsed((prev) => {
      if (!prev[key]) return prev; // already expanded — no-op, stable reference
      const next = { ...prev, [key]: false };
      try {
        localStorage.setItem(V2_CATEGORY_COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { isExpanded, toggle, forceExpand };
}

// ── Dark mode hook ─────────────────────────────────────────────────────────

const DARK_MODE_KEY = "tcs-dark-mode-v1";

function useDarkMode(): { isDark: boolean; toggle: () => void } {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DARK_MODE_KEY);
    const initial = stored === "1";
    setIsDark(initial);
    if (initial) document.documentElement.classList.add("dark");
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DARK_MODE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  return { isDark, toggle };
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function initials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0][0] ?? "?").toUpperCase();
  }
  return (email[0] ?? "?").toUpperCase();
}

function Avatar({ displayName, email }: { displayName: string | null; email: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[var(--teal)]/10 text-[var(--teal)] text-sm font-semibold flex-shrink-0 select-none"
    >
      {initials(displayName, email)}
    </span>
  );
}

// ── ProfileMenu popover ────────────────────────────────────────────────────

function ProfileMenu({
  userInfo,
  onNavigate,
}: {
  userInfo: SidebarV2UserInfo;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isDark, toggle: toggleDark } = useDarkMode();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPrefsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPrefsOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleNavigate = () => {
    setOpen(false);
    setPrefsOpen(false);
    onNavigate?.();
  };

  const displayText = userInfo.displayName ?? userInfo.email;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setPrefsOpen(false); }}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-[var(--surface-warm-100)] transition-colors text-left min-w-0"
      >
        <Avatar displayName={userInfo.displayName} email={userInfo.email} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-[var(--foreground)] truncate leading-tight">
            {displayText}
          </span>
          <span className="text-xs text-[var(--muted-foreground)] leading-tight">
            {userInfo.planLabel}
          </span>
        </div>
        <ChevronUpDownIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-[var(--border)] rounded-xl shadow-lg py-1 z-50"
        >
          {!prefsOpen ? (
            <>
              <Link
                href="/account"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <User size={14} strokeWidth={1.75} aria-hidden />
                Account
              </Link>
              <Link
                href="/account/billing"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <CreditCard size={14} strokeWidth={1.75} aria-hidden />
                Billing
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => setPrefsOpen(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors text-left"
              >
                <Settings size={14} strokeWidth={1.75} aria-hidden />
                Preferences
                <ChevronRightIcon />
              </button>
              <div role="separator" className="my-1 mx-2 h-px bg-[var(--border)]" />
              {/* TIM-3299: Help / Terms / Privacy in-app surfacing. Existing routes
                  /help (TIM-1941), /terms (TIM-1358), /privacy (TIM-1395). */}
              <Link
                href="/help"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <LifeBuoy size={14} strokeWidth={1.75} aria-hidden />
                Help
              </Link>
              <Link
                href="/terms"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <FileText size={14} strokeWidth={1.75} aria-hidden />
                Terms of Service
              </Link>
              <Link
                href="/privacy"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <Shield size={14} strokeWidth={1.75} aria-hidden />
                Privacy Policy
              </Link>
              <div role="separator" className="my-1 mx-2 h-px bg-[var(--border)]" />
              <Link
                href="/auth/signout"
                role="menuitem"
                onClick={handleNavigate}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors"
              >
                <LogOut size={14} strokeWidth={1.75} aria-hidden />
                Sign Out
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPrefsOpen(false)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-left"
              >
                <ChevronLeftIcon />
                Back
              </button>
              <div role="separator" className="my-1 mx-2 h-px bg-[var(--border)]" />

              {/* Dark mode toggle */}
              <div className="px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {isDark ? (
                      <Moon size={14} strokeWidth={1.75} className="text-[var(--muted-foreground)]" aria-hidden />
                    ) : (
                      <Sun size={14} strokeWidth={1.75} className="text-[var(--muted-foreground)]" aria-hidden />
                    )}
                    <span className="text-sm text-[var(--foreground)]">Dark mode</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDark}
                    onClick={toggleDark}
                    aria-label={isDark ? "Disable dark mode" : "Enable dark mode"}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-2 cursor-pointer ${
                      isDark ? "bg-[var(--teal)]" : "bg-[var(--border)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                        isDark ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* RevertToggle (Use new UI) */}
              <div className="px-3 py-1">
                <RevertToggle initialEnabled={userInfo.uiRevampEnabled} />
              </div>

              {/* TIM-3369 HiringRevertToggle */}
              <div className="px-3 py-1">
                <HiringRevertToggle
                  initialEnabled={userInfo.hiringRevampEnabled}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline SVG icons ───────────────────────────────────────────────────────

function ChevronUpDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--muted-foreground)] flex-shrink-0">
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-auto text-[var(--muted-foreground)]">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
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

function ChevronDownIcon({ open }: { open: boolean }) {
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
      className="transition-transform duration-150 text-[var(--muted-foreground)]"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Sidebar content ────────────────────────────────────────────────────────

function SidebarV2Content({
  userInfo,
  onClose,
  firstLinkRef,
}: {
  userInfo: SidebarV2UserInfo;
  onClose?: () => void;
  firstLinkRef?: React.RefObject<HTMLAnchorElement | null>;
}) {
  const pathname = usePathname();
  const { isExpanded, toggle, forceExpand } = useV2CategoryExpanded();

  // Auto-expand the category containing the current path so direct-URL navigation
  // (bookmarks, deep links, CoPilot) never leaves the active sub-item hidden.
  useEffect(() => {
    for (const cat of NAV_CATEGORIES) {
      if (cat.subItems?.some((sub) => pathname.startsWith(sub.href))) {
        forceExpand(cat.key);
        break;
      }
    }
  }, [pathname, forceExpand]);

  return (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)] flex-shrink-0">
        <Link
          href="/dashboard"
          ref={firstLinkRef}
          aria-label="Groundwork home"
          onClick={onClose}
          className="flex items-center gap-2"
        >
          <Logo variant="color" height={40} />
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
      </div>

      {/* Nav items */}
      <nav
        aria-label="Main navigation"
        className="flex-1 overflow-y-auto py-4 px-2"
      >
        {/* TIM-2378: project switcher above main nav */}
        <ProjectSwitcher isPro={userInfo.isPro} />
        <ul role="list" className="space-y-0.5">
          {NAV_CATEGORIES.map((cat) => {
            const Icon = cat.icon;

            // Home — single direct link, no sub-items
            if (cat.href && !cat.subItems) {
              const active = pathname.startsWith(cat.href);
              return (
                <li key={cat.key}>
                  <Link
                    href={cat.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
                      active
                        ? "border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
                        : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                    <span className="text-sm">{cat.label}</span>
                  </Link>
                </li>
              );
            }

            // Expandable category with sub-items
            const expanded = isExpanded(cat.key);
            // Highlight the category header when collapsed + a sub-item is active,
            // so the user always has a visual anchor even if the section is closed.
            const anyCatSubActive = !expanded &&
              (cat.subItems?.some((sub) => pathname.startsWith(sub.href)) ?? false);
            return (
              <li key={cat.key}>
                <button
                  type="button"
                  onClick={() => toggle(cat.key)}
                  aria-expanded={expanded}
                  className={`flex items-center gap-2.5 px-3 py-2.5 w-full rounded-lg transition-colors ${
                    anyCatSubActive
                      ? "border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
                      : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className="text-sm flex-1 text-left">{cat.label}</span>
                  <ChevronDownIcon open={expanded} />
                </button>
                <div
                  style={{
                    display: "grid",
                    gridTemplateRows: expanded ? "1fr" : "0fr",
                    transition: "grid-template-rows 150ms ease-out",
                  }}
                  aria-hidden={!expanded}
                >
                  <div style={{ overflow: "hidden" }}>
                    <ul className="space-y-0.5 mt-0.5 pb-0.5">
                      {cat.subItems?.map((sub) => {
                        const subActive = pathname.startsWith(sub.href);
                        return (
                          <li key={sub.href}>
                            <Link
                              href={sub.href}
                              tabIndex={expanded ? undefined : -1}
                              aria-current={subActive ? "page" : undefined}
                              onClick={onClose}
                              className={`flex items-center pr-3 py-2 rounded-lg transition-colors text-sm ${
                                subActive
                                  ? "border-l-2 border-[var(--teal)] pl-[34px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
                                  : "pl-9 text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ProfileMenu footer */}
      <div className="border-t border-[var(--border)] px-2 py-2 flex-shrink-0">
        <ProfileMenu userInfo={userInfo} onNavigate={onClose} />
      </div>
    </div>
  );
}

// ── Public component ───────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SidebarV2({ userInfo }: { userInfo: SidebarV2UserInfo }) {
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

  // Keyboard: Escape closes drawer; Tab trapped within drawer
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
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
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

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside
        className="hidden lg:flex flex-col fixed top-0 left-0 h-screen w-[224px] bg-white border-r border-[var(--border)] z-30"
        aria-label="Main navigation"
      >
        <SidebarV2Content userInfo={userInfo} />
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
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
        className={`fixed top-0 left-0 h-screen w-[280px] bg-white z-50 lg:hidden transition-transform duration-200 ease-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarV2Content
          userInfo={userInfo}
          onClose={closeDrawer}
          firstLinkRef={firstLinkRef}
        />
      </div>
    </>
  );
}
