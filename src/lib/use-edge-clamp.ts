// TIM-3414: Viewport edge-clamp for absolute-positioned popovers.
// Measures the popover's bounding rect against the viewport and writes a
// translateX transform directly to the element so it never extends past
// either edge. Re-measures on resize.

import { useLayoutEffect, useRef } from "react";

const EDGE_PADDING = 8;

export function useEdgeClamp(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    function measure() {
      if (!el) return;
      el.style.transform = "";
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      let delta = 0;
      if (rect.right > vw - EDGE_PADDING) delta = vw - EDGE_PADDING - rect.right;
      if (rect.left + delta < EDGE_PADDING) delta = EDGE_PADDING - rect.left;
      if (delta !== 0) el.style.transform = `translateX(${delta}px)`;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  return ref;
}
