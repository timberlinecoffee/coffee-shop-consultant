"use client";

import { useState } from "react";
import { MenuItemsTable } from "./MenuItemsTable";
import type { MenuItem } from "./MenuItemsTable";
import type { MenuAnchor } from "./MenuItemsTable";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import type { CopilotFocus } from "@/components/copilot/types";

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

  // W3 PDF framework: not yet loaded (TIM-622-F pending)
  const pdfFrameworkReady = false;

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
          <button
            disabled={!pdfFrameworkReady}
            title={pdfFrameworkReady ? undefined : "PDF export coming soon"}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 text-sm font-medium transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:bg-white
              enabled:hover:bg-neutral-50 enabled:text-neutral-700"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Export PDF
          </button>
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
