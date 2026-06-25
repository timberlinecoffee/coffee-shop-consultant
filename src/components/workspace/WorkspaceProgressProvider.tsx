"use client";

// TIM-1147: provider for manual 3-state workspace status (Not Started /
// In Progress / Complete). Replaces the auto-derived `completedSections /
// totalSections` model that lived here (TIM-884). Workspace pages now read
// their status from this provider and call `setStatus` (explicit user action)
// or `promoteOnEdit` (auto-promote `not_started` → `in_progress`).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarV2, type SidebarV2UserInfo } from "@/components/SidebarV2";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";
import {
  isWorkspaceStatus,
  type WorkspaceStatus,
} from "@/lib/workspace-status";
import type { WorkspaceManifestItem, WorkspaceNavItem } from "@/lib/workspace-manifest";
import { AVAILABLE_MODULES } from "@/lib/modules";
import { useUiRevamp } from "@/hooks/useUiRevamp";

const SIDEBAR_COLLAPSED_KEY = "tcs-sidebar-collapsed";

interface WorkspaceStatusContextValue {
  statusByKey: ReadonlyMap<string, WorkspaceStatus>;
  setStatus: (componentKey: string, status: WorkspaceStatus) => Promise<void>;
  promoteOnEdit: (componentKey: string) => void;
  hydrateStatuses: (statuses: Record<string, WorkspaceStatus>) => void;
}

const WorkspaceStatusContext = createContext<WorkspaceStatusContextValue | null>(null);

export function useWorkspaceStatus(): WorkspaceStatusContextValue {
  const ctx = useContext(WorkspaceStatusContext);
  if (!ctx) {
    throw new Error("useWorkspaceStatus must be used within WorkspaceProgressProvider");
  }
  return ctx;
}

export function WorkspaceProgressProvider({
  manifest,
  initialStatuses,
  userInfo,
  children,
}: {
  manifest: ReadonlyArray<WorkspaceManifestItem>;
  initialStatuses: Record<string, WorkspaceStatus>;
  userInfo?: SidebarV2UserInfo;
  children: React.ReactNode;
}) {
  const uiRevamp = useUiRevamp();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statusByKey, setStatusByKey] = useState<Map<string, WorkspaceStatus>>(
    () => new Map(Object.entries(initialStatuses).filter(([, v]) => isWorkspaceStatus(v)))
  );

  // Restore collapse preference from localStorage after mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "true") setSidebarCollapsed(true);
    } catch {
      // localStorage unavailable — ignore
    }
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // TIM-1093: Called by WorkspaceStatusApplier after the out-of-band bootstrap
  // resolves. Merges server-fetched statuses without triggering an API write.
  const hydrateStatuses = useCallback((statuses: Record<string, WorkspaceStatus>) => {
    setStatusByKey((prev) => {
      const next = new Map(prev);
      for (const [key, status] of Object.entries(statuses)) {
        if (isWorkspaceStatus(status)) next.set(key, status);
      }
      return next;
    });
  }, []);

  const setStatus = useCallback(
    async (componentKey: string, status: WorkspaceStatus) => {
      // Optimistic update.
      setStatusByKey((prev) => {
        const next = new Map(prev);
        next.set(componentKey, status);
        return next;
      });

      try {
        const res = await fetch("/api/workspace-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ componentKey, status, mode: "set" }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        // TIM-3070: invalidate the Next.js Router Cache so the dashboard
        // progress tracker (and any other server-rendered surface that reads
        // workspace_status) refetches on next navigation. Without this, marking
        // Concept Complete from the workspace top-right doesn't show up on
        // /dashboard until a hard reload.
        router.refresh();
      } catch (err) {
        // Rollback on failure.
        setStatusByKey((prev) => {
          const next = new Map(prev);
          const original = initialStatuses[componentKey];
          if (original) next.set(componentKey, original);
          else next.delete(componentKey);
          return next;
        });
        console.warn("Failed to update workspace status", err);
      }
    },
    [initialStatuses, router]
  );

  // De-dupe promote-on-edit fire-and-forgets in a single session.
  const promotedKeysRef = useRef<Set<string>>(new Set());
  const promoteOnEdit = useCallback(
    (componentKey: string) => {
      if (promotedKeysRef.current.has(componentKey)) return;
      const current = statusByKey.get(componentKey) ?? "not_started";
      if (current !== "not_started") {
        promotedKeysRef.current.add(componentKey);
        return;
      }
      promotedKeysRef.current.add(componentKey);

      // Optimistic local update.
      setStatusByKey((prev) => {
        if (prev.get(componentKey) !== "not_started" && prev.has(componentKey)) return prev;
        const next = new Map(prev);
        next.set(componentKey, "in_progress");
        return next;
      });

      void fetch("/api/workspace-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ componentKey, mode: "promote_on_edit" }),
      }).catch((err) => {
        console.warn("Failed to promote workspace status", err);
      });
    },
    [statusByKey]
  );

  const navItems: WorkspaceNavItem[] = useMemo(
    () =>
      manifest.map((item) => ({
        ...item,
        status: statusByKey.get(workspaceKeyForModule(item.moduleNumber)) ?? "not_started",
        isUnlocked: AVAILABLE_MODULES.has(item.moduleNumber),
      })),
    [manifest, statusByKey]
  );

  // TIM-2590: v2 sidebar is always 224px (no collapse). v1 respects the
  // collapsed state as before.
  const contentPadding = uiRevamp
    ? "lg:pl-[224px]"
    : sidebarCollapsed
    ? "lg:pl-[64px]"
    : "lg:pl-[224px]";

  const contextValue = useMemo<WorkspaceStatusContextValue>(
    () => ({ statusByKey, setStatus, promoteOnEdit, hydrateStatuses }),
    [statusByKey, setStatus, promoteOnEdit, hydrateStatuses]
  );

  return (
    <WorkspaceStatusContext.Provider value={contextValue}>
      <div className="flex min-h-screen bg-[var(--background)] overflow-x-hidden">
        {/* TIM-2590: branch sidebar on ui_revamp_v2 flag */}
        {uiRevamp && userInfo ? (
          <SidebarV2 userInfo={userInfo} />
        ) : (
          <AppSidebar
            items={navItems}
            collapsed={sidebarCollapsed}
            onToggleCollapse={handleToggleCollapse}
            isPro={userInfo?.isPro}
          />
        )}
        <div
          className={`flex-1 min-w-0 ${contentPadding} flex flex-col transition-all duration-200`}
        >
          <WorkspaceTopBar items={navItems} />
          {/* TIM-2591: bottom padding clears the fixed tab bar on mobile */}
          <main className={`flex-1 ${uiRevamp ? "pb-20 lg:pb-0" : ""}`}>{children}</main>
        </div>
        {/* TIM-2591: mobile bottom tab bar (v2 only, self-gated on flag) */}
        <BottomTabBar />
      </div>
    </WorkspaceStatusContext.Provider>
  );
}

// ── Module ↔ workspace key mapping ───────────────────────────────────────────
//
// Single source of truth for translating the legacy `moduleNumber` (used in
// the manifest + sidebar) to the workspace_key string used by Supabase and
// the workspace_status component_key column.

// TIM-1458: module-13 "inventory" mapping removed — Supplies is now a page
// inside the Equipment & Supplies suite under module 5 (buildout_equipment).
const MODULE_TO_KEY: Record<number, string> = {
  1: "concept",
  2: "financials",
  3: "location_lease",
  4: "menu_pricing",
  5: "buildout_equipment",
  6: "opening_month_plan",
  7: "hiring",
  8: "business_plan",
  9: "marketing",
  10: "suppliers",
  11: "operations_playbook",
};

export function workspaceKeyForModule(moduleNumber: number): string {
  return MODULE_TO_KEY[moduleNumber] ?? `module_${moduleNumber}`;
}
