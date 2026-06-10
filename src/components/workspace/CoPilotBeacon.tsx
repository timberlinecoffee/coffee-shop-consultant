"use client";

// TIM-1408: Single global Co-pilot entry point. Replaces the WorkspaceTopBar
// "Co-pilot" button and the per-card "Ask Co-pilot" controls. Fields that need
// a seeded prompt can still dispatch `copilot:open-with-prompt` directly.
// TIM-2592: Hidden in ui_revamp_v2 — ScoutRail is always visible.

import { usePathname } from "next/navigation";
import { COPILOT_NAME } from "@/lib/copilot/branding";
import { useUiRevamp } from "@/hooks/useUiRevamp";

export function CoPilotBeacon() {
  const uiRevamp = useUiRevamp();
  const pathname = usePathname();

  // v2: ScoutRail is persistent — no floating launcher needed.
  if (uiRevamp) return null;
  // TIM-1788: also surface the single desktop entry point on the post-login
  // dashboard (no suite open), the first screen users land on. The dashboard
  // mounts its own CoPilotDrawer (with showDesktopLauncher=false) so this
  // Beacon stays the lone desktop launcher there too — no duplicate overlap.
  const isCoPilotPage =
    pathname?.startsWith("/workspace/") || pathname?.startsWith("/dashboard");

  if (!isCoPilotPage) return null;

  function open() {
    window.dispatchEvent(new CustomEvent("workspace-copilot-open"));
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Open ${COPILOT_NAME}`}
      title={COPILOT_NAME}
      className="fixed bottom-6 right-6 z-30 w-12 h-12 rounded-full bg-[var(--teal)] text-white shadow-md hover:shadow-lg hover:brightness-105 transition hidden lg:flex items-center justify-center"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z" />
        <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
      </svg>
    </button>
  );
}
