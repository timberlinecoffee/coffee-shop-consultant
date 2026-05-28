"use client";

// TIM-1244 (v2): inline contextual guided setup. Instead of a separate modal
// interview, this spotlights the *real* field on the page, shows a pop-out that
// asks the question and gives a typical-coffee-shop range, and lets the owner
// fill that actual field. They see where the data lives, so it doubles as
// platform training. The tour drives tab switches and expands collapsed
// sections so each target is on screen before it's highlighted.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

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

const POP_W = 344;
const PAD = 8; // spotlight padding around the target

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
  const popRef = useRef<HTMLDivElement | null>(null);
  const [popH, setPopH] = useState(220);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const progressPct = Math.round(((index + 1) / steps.length) * 100);

  const measure = useCallback(() => {
    const el = document.getElementById(steps[index].targetId);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [index, steps]);

  // On step change: switch tab, expand the section, scroll the target into
  // view, then measure. Staggered timeouts let React mount the tab/section
  // before we look for the element.
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
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest" });
          requestAnimationFrame(() => {
            if (!cancelled) {
              const el2 = document.getElementById(s.targetId);
              setRect(el2 ? el2.getBoundingClientRect() : null);
            }
          });
        } else {
          setRect(null);
        }
      }, 140);
      return () => clearTimeout(t2);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Keep the spotlight glued to the field while the user scrolls or resizes.
  useEffect(() => {
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (popRef.current) setPopH(popRef.current.offsetHeight);
  }, [index, rect]);

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => Math.min(steps.length - 1, i + 1));
  }
  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const clampLeft = (x: number) => Math.max(12, Math.min(x, vw - POP_W - 12));

  // Popover placement relative to the spotlight.
  let popStyle: React.CSSProperties;
  if (!rect) {
    popStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  } else {
    const belowSpace = vh - rect.bottom;
    const aboveSpace = rect.top;
    const left = clampLeft(rect.left);
    if (belowSpace > popH + 24) {
      popStyle = { top: rect.bottom + 12, left };
    } else if (aboveSpace > popH + 24) {
      popStyle = { top: Math.max(12, rect.top - popH - 12), left };
    } else {
      popStyle = { bottom: 16, left };
    }
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

  return (
    <div className="fixed inset-0 z-50" aria-live="polite">
      {rect ? (
        <>
          {panels.map((p, i) => (
            <div
              key={i}
              className="fixed bg-[#1a1a1a]/55"
              style={p}
              onClick={(e) => e.stopPropagation()}
            />
          ))}
          {/* Highlight ring — does not capture clicks so the field stays usable */}
          <div
            className="fixed rounded-xl ring-2 ring-[#155e63] ring-offset-2 ring-offset-transparent pointer-events-none transition-all duration-150"
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
        <div className="fixed inset-0 bg-[#1a1a1a]/40" />
      )}

      {/* Coachmark popover */}
      <div
        ref={popRef}
        className="fixed z-[51] bg-white rounded-2xl shadow-xl border border-[#efefef]"
        style={{ width: POP_W, ...popStyle }}
        role="dialog"
        aria-modal="false"
        aria-label="Guided setup step"
      >
        <div className="px-5 pt-4 pb-3 border-b border-[#f0f0f0]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63]">
              Guided Setup
            </span>
            <button
              type="button"
              onClick={() => onClose(index)}
              className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
              aria-label="Close guided setup"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-[#6b6b6b]">
              Step {index + 1} of {steps.length}
            </span>
            <span className="text-[11px] text-[#afafaf]">{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className="h-full bg-[#155e63] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="px-5 py-4">
          <h3 className="text-base font-bold text-[#1a1a1a] mb-1.5">{step.title}</h3>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">{step.body}</p>
          {step.hint && (
            <p className="mt-3 text-xs text-[#2a4a4c] bg-[#f0f9f9] border border-[#e5eef0] rounded-lg px-3 py-2 leading-relaxed">
              <span className="font-semibold">Typical coffee shop:</span> {step.hint}
            </p>
          )}
          {step.why && (
            <p className="mt-2 text-[11px] text-[#afafaf] leading-relaxed">{step.why}</p>
          )}
          {!rect && (
            <p className="mt-3 text-[11px] text-[#c0723d]">
              Finding this field… you can still continue.
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[#f0f0f0] flex items-center justify-between gap-3">
          {!isFirst ? (
            <button
              type="button"
              onClick={back}
              className="flex items-center gap-1.5 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] px-2 py-1.5 rounded-lg transition-colors"
            >
              <ArrowLeft size={15} /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-[#afafaf] hover:text-[#6b6b6b] px-2 py-1.5 rounded-lg transition-colors"
            >
              Skip for now
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[#155e63] hover:bg-[#124e52] px-4 py-2 rounded-lg transition-colors"
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
