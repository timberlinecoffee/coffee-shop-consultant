"use client";

// TIM-2436 — Past Chats Drawer. Per the TIM-2435 design spec, this is a
// second, independent drawer that slides in from the left edge of the
// viewport — not a rail inside the chat panel. It wraps the existing
// `ThreadBrowser` unchanged in its `variant="fill"` mode.
//
// Coexistence with the chat panel: the outer container is
// `pointer-events-none` and only the drawer surface + its right-side
// backdrop region opt in via `pointer-events-auto`. The backdrop's right
// edge is offset by the chat panel width (when open) so it never occludes
// the chat panel — that lets the user keep both surfaces side by side and
// only intercepts clicks where the workspace is showing through.

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import {
  ThreadBrowser,
  type ConversationScope,
  type ThreadBrowserItem,
} from "./ThreadBrowser";
import type { WorkspaceKey } from "@/types/supabase";

export const PAST_CHATS_DRAWER_WIDTH = 320;

export interface PastChatsDrawerProps {
  open: boolean;
  onClose: () => void;
  // ThreadBrowser passthrough.
  planId: string;
  activeScope: ConversationScope;
  activeThreadId: string | null;
  currentWorkspaceKey: WorkspaceKey;
  onSelectThread: (item: ThreadBrowserItem) => void;
  onNewThread: (scope: ConversationScope) => void;
  onRenameThread?: (threadId: string, newTitle: string) => void;
  onDeleteThread?: (threadId: string) => void;
  refreshKey?: number;
  // Drives mobile bottom-sheet behavior and the desktop backdrop's right offset
  // when the chat panel is also open (we do not occlude the chat panel).
  viewportWidth?: number;
  chatPanelOpen?: boolean;
  chatPanelWidth?: number;
  // v2 Scout rail: width of the right rail in pixels. When > 0, the drawer
  // slides in from the left edge of the rail instead of the viewport left.
  railWidth?: number;
}

export function PastChatsDrawer({
  open,
  onClose,
  viewportWidth = 1280,
  chatPanelOpen = false,
  chatPanelWidth = 0,
  railWidth = 0,
  ...threadProps
}: PastChatsDrawerProps) {
  const isMobile = viewportWidth < 640;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="past-chats-drawer"
          data-testid="past-chats-drawer"
          className="fixed inset-0 z-[55] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {isMobile ? (
            <>
              <button
                type="button"
                aria-label="Close past chats"
                onClick={onClose}
                className="absolute inset-0 bg-black/40 pointer-events-auto"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Past chats"
                className="absolute bottom-0 inset-x-0 flex flex-col bg-[var(--background)] rounded-t-2xl border-t border-[var(--border)] pointer-events-auto"
                style={{ height: "85vh" }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="flex justify-center pt-2 pb-1 shrink-0" aria-hidden>
                  <div className="w-10 h-1 rounded-full bg-[var(--neutral-cool-300)]" />
                </div>
                <DrawerHeader onClose={onClose} />
                <div className="flex-1 overflow-hidden">
                  <ThreadBrowser variant="fill" {...threadProps} />
                </div>
              </motion.div>
            </>
          ) : (
            railWidth > 0 ? (
              /* v2: drawer slides out to the LEFT of the Scout rail */
              <>
                <motion.aside
                  role="dialog"
                  aria-modal="false"
                  aria-label="Past chats"
                  className="absolute top-0 h-full bg-[var(--background)] border-l border-[var(--border)] flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.08)] pointer-events-auto"
                  style={{ width: PAST_CHATS_DRAWER_WIDTH, right: railWidth }}
                  initial={{ x: PAST_CHATS_DRAWER_WIDTH }}
                  animate={{ x: 0 }}
                  exit={{ x: PAST_CHATS_DRAWER_WIDTH }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <DrawerHeader onClose={onClose} />
                  <div className="flex-1 overflow-hidden">
                    <ThreadBrowser variant="fill" {...threadProps} />
                  </div>
                </motion.aside>
                <button
                  type="button"
                  aria-label="Close past chats"
                  onClick={onClose}
                  className="absolute top-0 bottom-0 bg-black/30 pointer-events-auto"
                  style={{ left: 0, right: PAST_CHATS_DRAWER_WIDTH + railWidth }}
                />
              </>
            ) : (
              /* v1: drawer slides in from the left edge of the viewport */
              <>
                <motion.aside
                  role="dialog"
                  aria-modal="false"
                  aria-label="Past chats"
                  className="absolute top-0 left-0 h-full bg-[var(--background)] border-r border-[var(--border)] flex flex-col shadow-xl pointer-events-auto"
                  style={{ width: PAST_CHATS_DRAWER_WIDTH }}
                  initial={{ x: -PAST_CHATS_DRAWER_WIDTH }}
                  animate={{ x: 0 }}
                  exit={{ x: -PAST_CHATS_DRAWER_WIDTH }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <DrawerHeader onClose={onClose} />
                  <div className="flex-1 overflow-hidden">
                    <ThreadBrowser variant="fill" {...threadProps} />
                  </div>
                </motion.aside>
                <button
                  type="button"
                  aria-label="Close past chats"
                  onClick={onClose}
                  className="absolute top-0 bottom-0 bg-black/30 pointer-events-auto"
                  style={{
                    left: PAST_CHATS_DRAWER_WIDTH,
                    right: chatPanelOpen ? chatPanelWidth : 0,
                  }}
                />
              </>
            )
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DrawerHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-7 h-7 rounded-full bg-[var(--teal)]/10 text-[var(--teal)] flex items-center justify-center shrink-0">
          <Sparkles aria-hidden className="w-3.5 h-3.5" />
        </div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] truncate">
          Past chats
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close past chats"
        className="w-8 h-8 rounded-full hover:bg-[var(--neutral-cool-100)] flex items-center justify-center text-[var(--neutral-cool-600)] shrink-0"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </header>
  );
}

export default PastChatsDrawer;
