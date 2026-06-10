"use client";

// TIM-2591: BottomTabBar v2 — replaces hamburger on mobile when ui_revamp_v2 is on.
// Only renders on viewports < lg (768px) when flag is true.
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide section: Nav components, Design Tokens
//   Reference: src/components/SidebarV2.tsx — active-state pattern + NAV_ITEMS
//   Tokens: --teal, --background, --border, --muted-foreground, --foreground
//   No new colors, no hardcoded hex/px spacing values invented here.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Layers,
  BarChart2,
  ClipboardList,
} from "lucide-react";
import { useUiRevamp } from "@/hooks/useUiRevamp";

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  matchPrefixes: string[];
}

// Mirrors SidebarV2.tsx NAV_ITEMS — keep in sync.
const TABS: TabItem[] = [
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
    href: "/workspace/build",
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

export function BottomTabBar() {
  const uiRevamp = useUiRevamp();
  const pathname = usePathname();

  if (!uiRevamp) return null;

  function isActive(tab: TabItem): boolean {
    return tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));
  }

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] border-t border-[var(--border)] lg:hidden safe-area-pb"
    >
      <div className="flex">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] gap-1 transition-colors ${
                active
                  ? "text-[var(--teal)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
