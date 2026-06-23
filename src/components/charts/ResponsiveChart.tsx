"use client";

// TIM-2841: Responsive chart wrapper using container queries (via ResizeObserver).
// Adapts chart height to container width and shows an "Expand chart" bottom-sheet
// drawer on narrow containers. Gated on ui_revamp_v2 flag — falls back to current
// behavior when the flag is off.

import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, RotateCw, X } from "lucide-react";
import { useUiRevamp } from "@/hooks/useUiRevamp";

// Context used by chart tooltip components to push their active data into the
// drawer's pinned tooltip bar. Setter is the stable useState dispatcher — the
// context value itself never changes reference after mount.
export interface DrawerTooltipEntry {
  name?: string;
  formattedValue: string;
  color?: string;
}
export interface DrawerTooltipState {
  label: string;
  payload: DrawerTooltipEntry[];
}
export type DrawerTooltipSetter = (data: DrawerTooltipState) => void;
export const DrawerTooltipContext = createContext<DrawerTooltipSetter | null>(null);

export interface ResponsiveChartProps {
  children: (height: number, isDrawer?: boolean, isCompact?: boolean) => React.ReactNode;
  title: string;
  description?: string;
  className?: string;
  minHeightNarrow?: number;
  minHeightMedium?: number;
  defaultHeight?: number;
}

export function ResponsiveChart({
  children,
  title,
  description,
  className,
  minHeightNarrow = 200,
  minHeightMedium = 240,
  defaultHeight = 300,
}: ResponsiveChartProps) {
  const uiRevamp = useUiRevamp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setContainerWidth(w);
    });
    ro.observe(el);
    // measure immediately
    setContainerWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const isCompact = uiRevamp && containerWidth < 768;

  const chartHeight = uiRevamp
    ? containerWidth < 480
      ? minHeightNarrow
      : containerWidth < 768
      ? minHeightMedium
      : defaultHeight
    : defaultHeight;

  const showExpand = isCompact;

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [drawerOpen, closeDrawer]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const drawerChartHeight =
    typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.55) : 400;

  return (
    <div
      ref={containerRef}
      className={`rounded-xl border border-[var(--border)] bg-white p-5 ${className ?? ""}`}
    >
      <div className="mb-3">
        <p className="text-xs font-semibold text-[var(--teal)] uppercase tracking-wide">
          {title}
        </p>
        {description && (
          <p className="text-xs text-[var(--muted-foreground)] mt-1">{description}</p>
        )}
      </div>

      {children(chartHeight, false, isCompact)}

      {showExpand && (
        <div className="mt-2 flex justify-start">
          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Expand ${title} chart`}
            className="flex min-h-[32px] items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--teal)] transition-colors hover:bg-[var(--teal-tint-100)]"
          >
            <Maximize2 size={16} aria-hidden />
            Expand chart
          </button>
        </div>
      )}

      {mounted &&
        drawerOpen &&
        createPortal(
          <ChartDrawer title={title} onClose={closeDrawer}>
            {children(drawerChartHeight, true, false)}
          </ChartDrawer>,
          document.body
        )}
    </div>
  );
}

function ChartDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [tooltip, setTooltip] = useState<DrawerTooltipState | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  // TIM-2877: best-effort attempt to lock device to landscape. Browsers
  // require fullscreen + the Screen Orientation API; iOS Safari and most
  // desktops reject silently. When the lock can't run, surface the
  // "rotate your device" inline hint so the icon remains useful.
  const handleRotate = useCallback(async () => {
    let locked = false;
    try {
      const orientation = (typeof screen !== "undefined" && screen.orientation) as
        | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
        | undefined;
      if (orientation?.lock) {
        if (document.fullscreenElement == null && document.documentElement.requestFullscreen) {
          try {
            await document.documentElement.requestFullscreen();
          } catch {
            // ignore — many browsers reject without a user-gesture chain
          }
        }
        await orientation.lock("landscape");
        locked = true;
      }
    } catch {
      // swallow — fall through to the visual hint
    }
    if (!locked) {
      setHintVisible(true);
      window.setTimeout(() => setHintVisible(false), 2400);
    }
  }, []);

  return (
    <DrawerTooltipContext.Provider value={setTooltip}>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} — expanded chart`}
        className="fixed bottom-0 left-0 right-0 z-50 flex h-[95dvh] flex-col rounded-t-2xl bg-white shadow-lg"
      >
        {/* Header */}
        <div className="flex min-h-[48px] items-center justify-between gap-2 border-b border-[var(--border)] px-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRotate}
              aria-label="Rotate to landscape"
              title="Rotate your device for a wider view"
              data-testid="chart-drawer-rotate-hint"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              <RotateCw size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chart"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        </div>

        {hintVisible && (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-[var(--border)] bg-[var(--neutral-cool-100)] px-4 py-2 text-[12px] text-[var(--muted-foreground)]"
          >
            Rotate your device to landscape for a wider view.
          </div>
        )}

        {/* Chart content */}
        <div className="flex-1 overflow-hidden p-4">{children}</div>

        {/* Pinned tooltip bar — shows last touched data point */}
        {tooltip && (
          <div className="border-t border-[var(--border)] bg-white px-4 py-2.5">
            <p className="mb-1 text-[11px] font-semibold text-[var(--foreground)]">
              {tooltip.label}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {tooltip.payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: entry.color }}
                  />
                  <span className="text-[var(--muted-foreground)]">{entry.name}</span>
                  <span className="tabular-nums font-semibold text-[var(--foreground)]">
                    {entry.formattedValue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DrawerTooltipContext.Provider>
  );
}
