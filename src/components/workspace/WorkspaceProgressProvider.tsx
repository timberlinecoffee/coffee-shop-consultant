"use client";

// TIM-884: Single source of truth for sidebar progress counters.
// A client-side context that lets workspace editors push live progress updates
// so the sidebar counter matches the in-page counter at all times.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { WorkspaceNavItem } from "@/lib/workspace-manifest";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceTopBar } from "@/components/workspace/WorkspaceTopBar";

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

  return (
    <WorkspaceProgressContext.Provider value={{ setModuleProgress }}>
      <div className="flex min-h-screen bg-[#faf9f7]">
        <AppSidebar items={navItems} />
        <div className="flex-1 min-w-0 lg:pl-[224px] flex flex-col">
          <WorkspaceTopBar items={navItems} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </WorkspaceProgressContext.Provider>
  );
}
