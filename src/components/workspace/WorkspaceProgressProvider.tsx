"use client";

// TIM-884: Single source of truth for sidebar progress counters.
// TIM-1029: Add sidebar collapse state with localStorage persistence.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { WorkspaceNavItem } from "@/lib/workspace-manifest";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

const SIDEBAR_COLLAPSED_KEY = "tcs-sidebar-collapsed";

interface WorkspaceProgressContextValue {
  setModuleProgress: (moduleNumber: number, filled: number, total: number) => void;
}

const WorkspaceProgressContext = createContext<WorkspaceProgressContextValue | null>(null);

export function useWorkspaceProgress(): WorkspaceProgressContextValue {
  const ctx = useContext(WorkspaceProgressContext);
  if (!ctx) throw new Error("useWorkspaceProgress must be used within WorkspaceProgressProvider");
  return ctx;
}

export function WorkspaceProgressProvider({
  initialItems,
  children,
}: {
  initialItems: WorkspaceNavItem[];
  children: React.ReactNode;
}) {
  const [overrides, setOverrides] = useState<
    Map<number, { filled: number; total: number }>
  >(new Map());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Restore collapse preference from localStorage after mount
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

  const setModuleProgress = useCallback(
    (moduleNumber: number, filled: number, total: number) => {
      setOverrides((prev) => {
        const cur = prev.get(moduleNumber);
        if (cur && cur.filled === filled && cur.total === total) return prev;
        const next = new Map(prev);
        next.set(moduleNumber, { filled, total });
        return next;
      });
    },
    []
  );

  const navItems = useMemo(
    () =>
      initialItems.map((item) => {
        const override = overrides.get(item.moduleNumber);
        if (!override) return item;
        return {
          ...item,
          completedSections: override.filled,
          totalSections: override.total,
        };
      }),
    [initialItems, overrides]
  );

  const contentPadding = sidebarCollapsed ? "lg:pl-[64px]" : "lg:pl-[224px]";

  return (
    <WorkspaceProgressContext.Provider value={{ setModuleProgress }}>
      <div className="flex min-h-screen bg-[#faf9f7]">
        <AppSidebar
          items={navItems}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <div className={`flex-1 min-w-0 ${contentPadding} flex flex-col transition-all duration-200`}>
          <WorkspaceTopBar items={navItems} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </WorkspaceProgressContext.Provider>
  );
}
