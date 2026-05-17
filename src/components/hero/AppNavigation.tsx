"use client";

import { useState } from "react";
import {
  ModuleConceptIcon,
  ModuleFinancialsIcon,
  ModuleOperationsIcon,
  ModuleStaffingIcon,
  ModuleBuildOutIcon,
  ModuleMenuIcon,
  ModuleMarketingIcon,
  ModuleLaunchIcon,
  SettingsIcon,
  UserCircleIcon,
  SidebarIcon,
  type PhosphorIcon,
} from "@/lib/icons";

const MODULE_ITEMS: Array<{
  number: number;
  label: string;
  Icon: PhosphorIcon;
}> = [
  { number: 1, label: "Concept", Icon: ModuleConceptIcon },
  { number: 2, label: "Financials", Icon: ModuleFinancialsIcon },
  { number: 3, label: "Operations", Icon: ModuleOperationsIcon },
  { number: 4, label: "Staffing", Icon: ModuleStaffingIcon },
  { number: 5, label: "Build-Out", Icon: ModuleBuildOutIcon },
  { number: 6, label: "Menu", Icon: ModuleMenuIcon },
  { number: 7, label: "Marketing", Icon: ModuleMarketingIcon },
  { number: 8, label: "Launch", Icon: ModuleLaunchIcon },
];

export interface AppNavigationProps {
  /** The currently active module number (1–8), or undefined for no active module. */
  activeModule?: number;
  /** Called when a module nav item is clicked. */
  onModuleClick?: (moduleNumber: number) => void;
  /** Display name for the current user (shown in the bottom user row). */
  userName?: string;
  /** Forwarded to the settings icon button click handler. */
  onSettingsClick?: () => void;
  /**
   * Controlled collapsed state.
   * When provided, the component uses this value instead of its own state.
   */
  collapsed?: boolean;
  /** Called when the user clicks the collapse toggle. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Additional CSS class names on the root element. */
  className?: string;
}

/**
 * AppNavigation — Component 5 per design-direction v3 Section 6.
 *
 * Left sidebar, 240px wide, collapsible to 56px icon-only mode.
 *
 * Structure:
 *   Top     — "Groundwork" wordmark (teal) + collapse toggle
 *   Middle  — 8 module navigation items with icon + label
 *   Bottom  — User account row + settings
 *
 * Active state: teal icon + 2px left border in teal + --neutral-200 background.
 * Inactive state: --neutral-600 icon and label.
 *
 * Collapses to icon-only at narrow viewports (below 768px) automatically,
 * or can be controlled via the `collapsed` / `onCollapsedChange` props.
 *
 * Responsive: hidden on mobile by default (add your own mobile nav overlay).
 * At tablet (md: 768px+) the sidebar is visible. At lg (1024px+) it is expanded.
 */
export function AppNavigation({
  activeModule,
  onModuleClick,
  userName,
  onSettingsClick,
  collapsed: collapsedProp,
  onCollapsedChange,
  className = "",
}: AppNavigationProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp !== undefined ? collapsedProp : internalCollapsed;

  function toggleCollapsed() {
    const next = !collapsed;
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  }

  return (
    <nav
      aria-label="Workspace navigation"
      className={[
        "flex flex-col h-full",
        "border-r border-[var(--neutral-300)]",
        "bg-[var(--color-white)]",
        "transition-[width] duration-[var(--duration-normal)]",
        collapsed ? "w-14" : "w-60",
        // Responsive: hidden on small, visible on md+
        "hidden md:flex",
        className,
      ].join(" ")}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className={[
          "flex items-center h-14 px-3 shrink-0",
          collapsed ? "justify-center" : "justify-between",
        ].join(" ")}
      >
        {!collapsed && (
          <span
            className="font-semibold select-none text-[var(--color-teal)]"
            style={{
              fontSize: "var(--text-h4)",
              lineHeight: "var(--text-h4-lh)",
            }}
          >
            Groundwork
          </span>
        )}

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={[
            "flex items-center justify-center w-8 h-8 rounded-md",
            "text-[var(--neutral-600)]",
            "hover:bg-[var(--neutral-200)] hover:text-[var(--neutral-950)]",
            "transition-colors duration-[var(--duration-fast)]",
          ].join(" ")}
        >
          <SidebarIcon size={18} weight="regular" aria-hidden />
        </button>
      </div>

      {/* ── Module navigation ──────────────────────────────────────────── */}
      <ul className="flex flex-col flex-1 gap-0.5 px-2 py-2 overflow-y-auto" role="list">
        {MODULE_ITEMS.map(({ number, label, Icon }) => {
          const isActive = activeModule === number;

          return (
            <li key={number} role="listitem">
              <button
                type="button"
                onClick={() => onModuleClick?.(number)}
                aria-label={collapsed ? label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative flex items-center w-full h-9 px-2 rounded-md gap-3",
                  "transition-colors duration-[var(--duration-fast)]",
                  isActive
                    ? "bg-[var(--neutral-200)] text-[var(--color-teal)]"
                    : "text-[var(--neutral-600)] hover:bg-[var(--neutral-200)] hover:text-[var(--neutral-950)]",
                  collapsed ? "justify-center px-0" : "",
                ].join(" ")}
              >
                {/* Active left border */}
                {isActive && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-[var(--color-teal)]"
                    aria-hidden
                  />
                )}

                {/* Icon */}
                <Icon
                  size={18}
                  weight="regular"
                  aria-hidden
                  style={{ color: isActive ? "var(--color-teal)" : "var(--neutral-600)" }}
                />

                {/* Label — hidden when collapsed */}
                {!collapsed && (
                  <span
                    className="truncate"
                    style={{
                      fontSize: "var(--text-body-sm)",
                      lineHeight: "var(--text-body-sm-lh)",
                    }}
                  >
                    {label}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ── Bottom: user + settings ─────────────────────────────────────── */}
      <div
        className={[
          "shrink-0 flex items-center gap-2 px-3 py-3 border-t border-[var(--neutral-200)]",
          collapsed ? "flex-col" : "flex-row",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <UserCircleIcon
            size={20}
            weight="regular"
            style={{ color: "var(--neutral-600)" }}
            aria-hidden
          />
          {!collapsed && userName && (
            <span
              className="truncate text-[var(--neutral-700)]"
              style={{
                fontSize: "var(--text-body-sm)",
                lineHeight: "var(--text-body-sm-lh)",
              }}
            >
              {userName}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onSettingsClick}
          aria-label="Settings"
          className={[
            "flex items-center justify-center w-7 h-7 rounded-md",
            "text-[var(--neutral-600)]",
            "hover:bg-[var(--neutral-200)] hover:text-[var(--neutral-950)]",
            "transition-colors duration-[var(--duration-fast)]",
          ].join(" ")}
        >
          <SettingsIcon size={16} weight="regular" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
