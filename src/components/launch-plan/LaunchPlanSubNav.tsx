"use client";

// TIM-1521: Shared sub-nav for the Launch Plan suite. Renders tabs at the top
// of the Launch Milestones page (/workspace/launch-plan/milestones) and the
// Opening Month Plan page (/workspace/launch-plan/opening-month) so the
// founder toggles between them inside one suite — matches the
// Equipment & Supplies pattern (EquipmentSuppliesSubNav).

import Link from "next/link";
import { Rocket, ClipboardList } from "lucide-react";

type Active = "milestones" | "opening-month";

const TABS: Array<{
  key: Active;
  label: string;
  href: string;
  Icon: typeof Rocket;
}> = [
  { key: "milestones", label: "Launch Milestones", href: "/workspace/launch-plan/milestones", Icon: Rocket },
  { key: "opening-month", label: "Opening Month Plan", href: "/workspace/launch-plan/opening-month", Icon: ClipboardList },
];

export function LaunchPlanSubNav({ active }: { active: Active }) {
  return (
    <nav
      aria-label="Launch Plan"
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
