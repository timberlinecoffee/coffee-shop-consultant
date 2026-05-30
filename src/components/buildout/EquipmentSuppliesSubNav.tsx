"use client";

// TIM-1458: Shared sub-nav for the Equipment & Supplies suite. Renders a tab
// strip at the top of both the Equipment page (/workspace/buildout-equipment)
// and the Supplies page (/workspace/buildout-equipment/supplies) so the
// founder toggles between them inside one suite.

import Link from "next/link";
import { Wrench, Package } from "lucide-react";

type Active = "equipment" | "supplies";

const TABS: Array<{
  key: Active;
  label: string;
  href: string;
  Icon: typeof Wrench;
}> = [
  { key: "equipment", label: "Equipment", href: "/workspace/buildout-equipment", Icon: Wrench },
  { key: "supplies", label: "Supplies", href: "/workspace/buildout-equipment/supplies", Icon: Package },
];

export function EquipmentSuppliesSubNav({ active }: { active: Active }) {
  return (
    <nav
      aria-label="Equipment & Supplies"
      className="flex items-center gap-1 border-b border-[var(--border)] mb-5"
    >
      {TABS.map(({ key, label, href, Icon }) => {
        const isActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? "border-[var(--teal)] text-[var(--teal)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--neutral-cool-200)]"
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
