"use client";

// TIM-1941: page-level header + sub-nav for each Help & Support route.
// Built on top of the canonical workspace chrome (WorkspaceHeader +
// WorkspaceSubNav) so the help section visually matches the rest of
// Groundwork (TIM-1894 / TIM-1537 style guide). The reference surface chosen
// by the board for this scope is Financials: same title bar, same pill
// sub-nav strip.
//
// Icons are resolved here from a small key map rather than passed in as
// component references. Server components (the help pages themselves) can't
// pass a Lucide function across the server->client boundary, so we keep the
// LucideIcon import inside this client component.

import type { ReactNode } from "react";
import { Compass, LifeBuoy, Mail, Wrench } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";

type HelpSubNavKey = "docs" | "contact";

export type HelpIconKey = "life-buoy" | "mail" | "compass" | "wrench";

const ICONS: Record<HelpIconKey, typeof LifeBuoy> = {
  "life-buoy": LifeBuoy,
  mail: Mail,
  compass: Compass,
  wrench: Wrench,
};

type HelpPageHeaderProps = {
  iconKey: HelpIconKey;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  active: HelpSubNavKey;
};

const TABS: ReadonlyArray<{ key: HelpSubNavKey; label: string; href: string }> = [
  { key: "docs", label: "Docs", href: "/help" },
  { key: "contact", label: "Contact Support", href: "/help/contact" },
];

export function HelpPageHeader({
  iconKey,
  title,
  description,
  actions,
  active,
}: HelpPageHeaderProps) {
  const Icon = ICONS[iconKey];
  return (
    <>
      <WorkspaceHeader
        Icon={Icon}
        title={title}
        description={description}
        actions={actions}
      />
      <div className="mb-5">
        <WorkspaceSubNav
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: t.href }))}
          active={active}
          ariaLabel="Help sections"
          className="mb-0"
        />
      </div>
    </>
  );
}
