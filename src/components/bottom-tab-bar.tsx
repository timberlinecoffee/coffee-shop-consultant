"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartBar, BookOpen, FileText, User } from "@phosphor-icons/react";
import { UI_WEIGHT } from "@/lib/icons";

const TABS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    Icon: ChartBar,
  },
  {
    label: "Module",
    href: "/plan/1",
    Icon: BookOpen,
  },
  {
    label: "BRD",
    href: "/plan/8",
    Icon: FileText,
  },
  {
    label: "Account",
    href: "/account",
    Icon: User,
  },
];

export function BottomTabBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/plan/1") return pathname.startsWith("/plan/");
    return pathname.startsWith(href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#efefef] lg:hidden safe-area-pb">
      <div className="flex">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center justify-center py-3 min-h-[56px] transition-colors ${
              isActive(tab.href)
                ? "text-[#155e63]"
                : "text-[#afafaf] hover:text-[#1a1a1a]"
            }`}
          >
            <span className="mb-1">
              <tab.Icon size={20} weight={UI_WEIGHT} />
            </span>
            <span className="text-xs font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
