"use client";

import { useState } from "react";
import { MenuItemsTable } from "./MenuItemsTable";
import type { MenuItem } from "./MenuItemsTable";
import type { MenuAnchor } from "./MenuItemsTable";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import type { CopilotFocus } from "@/components/copilot/types";
import { MenuPricingExportButton } from "@/components/menu-pricing/MenuPricingExportButton";

const ANCHOR_LABELS: Record<MenuAnchor, string> = {
  table_header: "Menu items table",
  footer_summary: "Footer — margin summary",
};

interface MenuPricingWorkspaceProps {
  planId: string;
  initialItems: MenuItem[];
}

export function MenuPricingWorkspace({ planId, initialItems }: MenuPricingWorkspaceProps) {
  const [anchor, setAnchor] = useState<MenuAnchor>("table_header");

  const currentFocus: CopilotFocus = {
    anchor,
    label: ANCHOR_LABELS[anchor],
  };

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Menu &amp; Pricing</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Build your menu, set prices, track margin per item.
            </p>
          </div>
          <MenuPricingExportButton />
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <MenuItemsTable
            planId={planId}
            initialItems={initialItems}
            onAnchorChange={setAnchor}
          />
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="menu_pricing"
        currentFocus={currentFocus}
      />
    </>
  );
}
