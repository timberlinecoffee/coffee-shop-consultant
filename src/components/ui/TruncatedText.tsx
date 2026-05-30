"use client";

// TIM-1414: Shared elegant truncation primitive.
//
// Board feedback: "It's just a bubble, and you only see part of it, and that's
// not ideal for me. ... please do a platform-wide audit and fix this as well
// with a really nice, elegant solution that's often used by other platforms."
//
// Pattern (Linear / Notion / Airtable / Stripe):
//   1. Truncate with end-ellipsis at the layout boundary.
//   2. Detect actual clipping (scrollWidth > clientWidth) — no tooltip when
//      text fits, so we don't flood every cell with stale hover affordances.
//   3. On hover/focus, show a small popover with the full value, wrapped.
//   4. Native `title` attribute as a fallback for assistive tech and keyboard
//      users who haven't yet hovered the element.
//
// Used by Suppliers, Equipment, Financial Suite, Marketing, SOPs, and the
// dashboard. One component, one behaviour everywhere.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";

type TruncatedTextProps = HTMLAttributes<HTMLSpanElement> & {
  text: string;
  /** Render text inside a fixed-line clamp (`lines`>1 uses webkit-box). */
  lines?: number;
  /** Optional tooltip content override (defaults to `text`). */
  tooltipContent?: string;
  /** Force-show tooltip even if text would fit (rare — e.g. badges). */
  alwaysTooltip?: boolean;
  /** Disable tooltip entirely (use when a parent already shows one). */
  disableTooltip?: boolean;
};

export function TruncatedText({
  text,
  lines = 1,
  tooltipContent,
  alwaysTooltip = false,
  disableTooltip = false,
  className = "",
  style,
  ...rest
}: TruncatedTextProps) {
  const id = useId();
  const ref = useRef<HTMLSpanElement | null>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxWidth: number } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (lines > 1) {
      setClipped(el.scrollHeight - 1 > el.clientHeight);
    } else {
      setClipped(el.scrollWidth - 1 > el.clientWidth);
    }
  }, [lines]);

  useLayoutEffect(() => {
    measure();
  }, [text, measure]);

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => measure());
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [measure]);

  const showTooltip = !disableTooltip && (alwaysTooltip || clipped) && open;
  const fullText = tooltipContent ?? text;

  const computePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const maxWidth = Math.min(360, Math.max(220, window.innerWidth - 2 * margin));
    // Prefer below; flip above if no room.
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeBelow = spaceBelow >= 64;
    const top = placeBelow ? rect.bottom + 6 : rect.top - 6;
    let left = rect.left;
    if (left + maxWidth + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - maxWidth - margin);
    }
    setPosition({ top, left, maxWidth });
  }, []);

  const handleEnter = useCallback(() => {
    if (disableTooltip || (!alwaysTooltip && !clipped)) return;
    computePosition();
    setOpen(true);
  }, [alwaysTooltip, clipped, computePosition, disableTooltip]);

  const handleLeave = useCallback(() => {
    setOpen(false);
  }, []);

  const clampStyle: CSSProperties =
    lines > 1
      ? {
          display: "-webkit-box",
          WebkitLineClamp: lines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          wordBreak: "break-word",
        }
      : {
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        };

  return (
    <>
      <span
        {...rest}
        ref={ref}
        title={!disableTooltip && (alwaysTooltip || clipped) ? fullText : undefined}
        aria-describedby={showTooltip ? id : undefined}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        className={`min-w-0 ${className}`}
        style={{ ...clampStyle, ...style }}
      >
        {text}
      </span>
      {showTooltip && position && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            maxWidth: position.maxWidth,
            zIndex: 60,
            pointerEvents: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {fullText}
        </span>
      )}
    </>
  );
}
