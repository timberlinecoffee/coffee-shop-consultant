"use client";

// TIM-2590: SidebarV2 — 5 flat nav items + ProfileMenu popover.
// Rendered when ui_revamp_v2 flag is on. Existing app-sidebar.tsx untouched.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide section: Design Tokens, Nav components, Profile popover
//   Reference: src/components/app-sidebar.tsx — active-state pattern
//     (border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5)
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
} from "lucide-react";
import { Logo, LogoMark } from "@/app/_components/Logo";
import { RevertToggle } from "@/components/account/RevertToggle";

export interface SidebarV2UserInfo {
  email: string;
  displayName: string | null;
  planLabel: string;
  uiRevampEnabled: boolean;
}

// ── Nav item definitions ───────────────────────────────────────────────────

interface V2NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  matchPrefixes: string[];
}

const NAV_ITEMS: V2NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
    matchPrefixes: ["/dashboard"],
  },
  {
    label: "Plan",
    href: "/workspace/concept",
    icon: FileText,
    matchPrefixes: ["/workspace/concept", "/workspace/business-plan"],
  },
  {
    label: "Build",
    href: "/workspace/launch-plan",
    icon: Layers,
    matchPrefixes: [
      "/workspace/build",
      "/workspace/buildout-equipment",
      "/workspace/location-lease",
      "/workspace/menu-pricing",
      "/workspace/suppliers",
      "/workspace/hiring",
      "/workspace/launch-plan",
    ],
  },
  {
    label: "Financials",
    href: "/workspace/financials",
    icon: BarChart2,
    matchPrefixes: ["/workspace/financials", "/workspace/benchmarks"],
  },
  {
    label: "Run",
    href: "/workspace/operations-playbook",
    icon: ClipboardList,
    matchPrefixes: ["/workspace/operations-playbook", "/workspace/marketing"],
  },
];

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

  function isActive(item: V2NavItem): boolean {
    return item.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  }

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
        <ul role="list" className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? "border-l-2 border-[var(--teal)] pl-[10px] bg-[var(--teal)]/5 font-semibold text-[var(--teal)]"
                      : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)]"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className="text-sm">{item.label}</span>
                </Link>
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
