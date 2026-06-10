"use client";

// TIM-2592: Reusable mobile bottom sheet with drag handle + snap points.
// Snap points: 40% / 75% / full. Backdrop dims content above the sheet.
// Used by ScoutRail on mobile (< lg) to present the Scout panel.
//
// Groundwork UI Consistency Protocol (TIM-1536/TIM-1538):
//   Style-guide section: Modals / Sheet overlays
//   Reference: src/components/copilot/CoPilotDrawer.tsx — existing mobile
//     sheet (conversations panel, rounded-t-2xl, bg-black/40 backdrop)
//   Tokens: --background, --border, --neutral-cool-300

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Initial snap point as fraction of viewport height. Default: 0.75. */
  initialSnap?: 0.4 | 0.75 | 1;
  ariaLabel?: string;
}

const SNAP_POINTS = [0.4, 0.75, 1] as const;
const DRAG_THRESHOLD_PX = 60;
const VELOCITY_CLOSE_THRESHOLD = 500;

export function BottomSheet({
  open,
  onClose,
  children,
  initialSnap = 0.75,
  ariaLabel = "Panel",
}: BottomSheetProps) {
  const [snap, setSnap] = useState<0.4 | 0.75 | 1>(initialSnap);
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Reset snap when sheet opens.
  useEffect(() => {
    if (open) setSnap(initialSnap);
  }, [open, initialSnap]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sheetHeight = `${snap * 100}vh`;

  const handleDragStart = useCallback((clientY: number) => {
    dragStartY.current = clientY;
  }, []);

  const handleDragEnd = useCallback((clientY: number, velocity: number) => {
    if (dragStartY.current === null) return;
    const delta = clientY - dragStartY.current;
    dragStartY.current = null;

    // Fast downward flick → close.
    if (velocity > VELOCITY_CLOSE_THRESHOLD && delta > 0) {
      onClose();
      return;
    }

    // Dragged down past threshold → step down or close.
    if (delta > DRAG_THRESHOLD_PX) {
      const idx = SNAP_POINTS.indexOf(snap);
      if (idx <= 0) {
        onClose();
      } else {
        setSnap(SNAP_POINTS[idx - 1]);
      }
      return;
    }

    // Dragged up past threshold → step up.
    if (delta < -DRAG_THRESHOLD_PX) {
      const idx = SNAP_POINTS.indexOf(snap);
      if (idx < SNAP_POINTS.length - 1) {
        setSnap(SNAP_POINTS[idx + 1]);
      }
    }
  }, [snap, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="absolute bottom-0 inset-x-0 flex flex-col bg-[var(--background)] rounded-t-2xl border-t border-[var(--border)] pointer-events-auto overflow-hidden"
            style={{ height: sheetHeight }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Drag handle */}
            <div
              className="shrink-0 flex justify-center pt-3 pb-1 touch-none cursor-grab active:cursor-grabbing"
              aria-hidden="true"
              onMouseDown={(e) => handleDragStart(e.clientY)}
              onMouseUp={(e) => handleDragEnd(e.clientY, 0)}
              onTouchStart={(e) => {
                const t = e.touches[0];
                if (t) handleDragStart(t.clientY);
              }}
              onTouchEnd={(e) => {
                const t = e.changedTouches[0];
                if (t) handleDragEnd(t.clientY, 0);
              }}
            >
              <div className="w-10 h-1 rounded-full bg-[var(--neutral-cool-300)]" />
            </div>

            {/* Content */}
            <div className="flex flex-col flex-1 overflow-hidden min-h-0">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
