"use client";

// TIM-1244 (v2): inline contextual guided setup. Instead of a separate modal
// interview, this spotlights the *real* field on the page, shows a pop-out that
// asks the question and gives a typical-coffee-shop range, and lets the owner
// fill that actual field. They see where the data lives, so it doubles as
// platform training. The tour drives tab switches and expands collapsed
// sections so each target is on screen before it's highlighted.
//
// v2.1 (founder refinements): the pop-out must never cover the highlighted
// field. It auto-places beside / below / above the target (never overlapping by
// construction), repositions on scroll/resize, is draggable (and remembers
// where the owner put it for the rest of the session), and collapses to a
// bottom sheet on small screens with the field scrolled clear above it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X, GripHorizontal } from "lucide-react";

export interface TourStep {
  id: string;
  /** Financials tab this field lives on (matches the workspace Tab union). */
  tab: string;
  /** DOM id of the element to spotlight. */
  targetId: string;
  /** Optional DOM id of a collapsible Section to expand before highlighting. */
  sectionId?: string;
  title: string;
  body: string;
  /** Typical-coffee-shop reference range — gives a first-timer a sane start. */
  hint?: string;
  why?: string;
}

interface Props {
  steps: TourStep[];
  startIndex?: number;
  onTabChange: (tab: string) => void;
  onExpandSection: (sectionId: string) => void;
  onFinish: () => void;
  onSkip: () => void;
  onClose: (index: number) => void;
}

const POP_W = 340;
const PAD = 8; // spotlight padding around the target
const GAP = 14; // gap between the target and the pop-out
const MARGIN = 12; // keep the pop-out this far from the viewport edge
const SHEET_BP = 640; // below this width we dock to a bottom sheet
const SHEET_EST_H = 280; // reserved height when scrolling a field clear of the sheet

type Placement =
  | { mode: "float"; left: number; top: number }
  | { mode: "sheet" };

function resolvePlacement(
  rect: DOMRect | null,
  popH: number,
  popW: number,
  vw: number,
  vh: number
): Placement {
  if (!rect) {
    return { mode: "float", left: Math.max(MARGIN, (vw - popW) / 2), top: Math.max(MARGIN, vh * 0.18) };
  }
  const clampTop = (t: number) => Math.max(MARGIN, Math.min(t, vh - popH - MARGIN));
  const clampLeft = (l: number) => Math.max(MARGIN, Math.min(l, vw - popW - MARGIN));
  // Prefer beside (keeps vertical context and never eats the field's row).
  if (vw - rect.right - GAP >= popW) {
    return { mode: "float", left: rect.right + GAP, top: clampTop(rect.top) };
  }
  if (rect.left - GAP >= popW) {
    return { mode: "float", left: rect.left - GAP - popW, top: clampTop(rect.top) };
  }
  // Then below / above the target.
  if (vh - rect.bottom - GAP >= popH) {
    return { mode: "float", left: clampLeft(rect.left), top: rect.bottom + GAP };
  }
  if (rect.top - GAP >= popH) {
    return { mode: "float", left: clampLeft(rect.left), top: rect.top - GAP - popH };
  }
  // Nothing fits without overlapping — dock to a sheet.
  return { mode: "sheet" };
}

export function GuidedTour({
  steps,
  startIndex = 0,
  onTabChange,
  onExpandSection,
  onFinish,
  onSkip,
  onClose,
}: Props) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), steps.length - 1));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [popH, setPopH] = useState(220);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  // Once the owner drags the pop-out, it stays where they put it for the rest
  // of the session (across steps) — only clamped back into view on resize.
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const popRef = useRef<HTMLDivElement | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const popHRef = useRef(popH);
  const dragPosRef = useRef(dragPos);
  useEffect(() => {
    popHRef.current = popH;
  }, [popH]);
  useEffect(() => {
    dragPosRef.current = dragPos;
  }, [dragPos]);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const progressPct = Math.round(((index + 1) / steps.length) * 100);

  const measure = useCallback(() => {
    const el = document.getElementById(steps[index].targetId);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [index, steps]);

  // On step change: switch tab, expand the section, scroll the target into
  // view (clear of a bottom sheet when one will be used), then measure.
  useEffect(() => {
    const s = steps[index];
    onTabChange(s.tab);
    let cancelled = false;
    const t1 = setTimeout(() => {
      if (cancelled) return;
      if (s.sectionId) onExpandSection(s.sectionId);
      const t2 = setTimeout(() => {
        if (cancelled) return;
        const el = document.getElementById(s.targetId);
        if (!el) {
          setRect(null);
          return;
        }
        const w = window.innerWidth;
        const h = window.innerHeight;
        const willSheet =
          !dragPosRef.current &&
          (w < SHEET_BP ||
            resolvePlacement(el.getBoundingClientRect(), popHRef.current, Math.min(POP_W, w - 24), w, h)
              .mode === "sheet");
        el.scrollIntoView({ block: willSheet ? "start" : "center", inline: "nearest" });
        requestAnimationFrame(() => {
          if (cancelled) return;
          let r = el.getBoundingClientRect();
          // If a sheet will sit at the bottom, make sure the field isn't under it.
          if (willSheet && r.bottom > h - SHEET_EST_H - MARGIN) {
            window.scrollBy(0, r.bottom - (h - SHEET_EST_H) + MARGIN);
            r = el.getBoundingClientRect();
          }
          setRect(r);
        });
      }, 140);
      return () => clearTimeout(t2);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keep the spotlight + pop-out glued to the field while scrolling / resizing.
  useEffect(() => {
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      measure();
    }
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", onResize);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (popRef.current) setPopH(popRef.current.offsetHeight);
  }, [index, rect, dragPos, viewport]);

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  // ── Drag ──────────────────────────────────────────────────────────────────
  function onDragMove(e: PointerEvent) {
    setDragPos({ left: e.clientX - dragOffset.current.x, top: e.clientY - dragOffset.current.y });
  }
  function onDragEnd() {
    setDragging(false);
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  }
  function onDragStart(e: React.PointerEvent) {
    if (!popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    setDragging(true);
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
  }

  const { w: vw, h: vh } = viewport;
  const popWidth = Math.min(POP_W, vw - 2 * MARGIN);

  // Resolve placement: a dragged pop-out floats where the owner left it; a
  // narrow screen docks to a sheet; otherwise auto-place around the target.
  let placement: Placement;
  if (dragPos) {
    placement = {
      mode: "float",
      left: Math.max(MARGIN, Math.min(dragPos.left, vw - popWidth - MARGIN)),
      top: Math.max(MARGIN, Math.min(dragPos.top, vh - popH - MARGIN)),
    };
  } else if (vw < SHEET_BP) {
    placement = { mode: "sheet" };
  } else {
    placement = resolvePlacement(rect, popH, popWidth, vw, vh);
  }

  // Dim panels around the spotlight (block clicks outside; the hole stays
  // interactive so the owner can type into the real field).
  const panels: React.CSSProperties[] = [];
  if (rect) {
    const top = Math.max(0, rect.top - PAD);
    const bottom = Math.min(vh, rect.bottom + PAD);
    const left = Math.max(0, rect.left - PAD);
    const right = Math.min(vw, rect.right + PAD);
    panels.push({ top: 0, left: 0, width: "100%", height: top });
    panels.push({ top: bottom, left: 0, width: "100%", height: Math.max(0, vh - bottom) });
    panels.push({ top, left: 0, width: left, height: bottom - top });
    panels.push({ top, left: right, width: Math.max(0, vw - right), height: bottom - top });
  }

  const isSheet = placement.mode === "sheet";
  const popStyle: React.CSSProperties =
    placement.mode === "sheet"
      ? { left: MARGIN, right: MARGIN, bottom: MARGIN }
      : { left: placement.left, top: placement.top, width: popWidth };

  return (
    <div className="fixed inset-0 z-50" aria-live="polite">
      {rect ? (
        <>
          {panels.map((p, i) => (
            <div key={i} className="fixed bg-[var(--foreground)]/55" style={p} onClick={(e) => e.stopPropagation()} />
          ))}
          {/* Highlight ring — does not capture clicks so the field stays usable */}
          <div
            className="fixed rounded-xl ring-2 ring-[var(--teal)] ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-150"
            style={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              boxShadow: "0 0 0 2px rgba(21,94,99,0.25)",
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-[var(--foreground)]/40" />
      )}

      {/* Coachmark pop-out */}
      <div
        ref={popRef}
        className={`fixed z-[52] rounded-2xl bg-white shadow-xl border border-[var(--border)] ${
          isSheet ? "mx-auto max-w-md" : ""
        } ${dragging ? "select-none" : ""}`}
        style={popStyle}
        role="dialog"
        aria-modal="false"
        aria-label="Guided setup step"
      >
        {/* Header doubles as the drag handle */}
        <div
          onPointerDown={onDragStart}
          className={`px-5 pt-4 pb-3 border-b border-[var(--neutral-cool-150)] ${dragging ? "cursor-grabbing" : "cursor-grab"} touch-none`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
              <GripHorizontal size={13} className="text-[var(--neutral-cool-400)]" aria-hidden="true" />
              Guided Setup
            </span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onClose(index)}
              className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
              aria-label="Close guided setup"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[var(--muted-foreground)]">
              Step {index + 1} of {steps.length}
            </span>
            <span className="text-[11px] text-[var(--dark-grey)]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--neutral-cool-150)] overflow-hidden">
            <div
              className="h-full bg-[var(--teal)] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-[var(--foreground)] mb-1.5">{step.title}</h3>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{step.body}</p>
          {step.hint && (
            <p className="mt-3 text-xs text-[var(--teal-deeper)] bg-[var(--teal-tint-100)] border border-[var(--teal-tint-400)] rounded-lg px-3 py-2 leading-relaxed">
              <span className="font-semibold">Typical coffee shop:</span> {step.hint}
            </p>
          )}
          {step.why && <p className="mt-2 text-[11px] text-[var(--dark-grey)] leading-relaxed">{step.why}</p>}
          {!rect && (
            <p className="mt-3 text-[11px] text-[var(--coffee-brown-3)]">Finding this field. You can still continue.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--neutral-cool-150)] flex items-center justify-between gap-3">
          {!isFirst ? (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-[var(--dark-grey)] hover:text-[var(--muted-foreground)] px-2 py-1.5 rounded-lg transition-colors"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--teal)] hover:bg-[var(--teal-deep)] px-4 py-2 rounded-lg transition-colors"
          >
            {isLast ? (
              <>
                Done <Check size={15} />
              </>
            ) : (
              <>
                Next <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
