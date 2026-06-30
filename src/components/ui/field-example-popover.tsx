"use client";

// TIM-867: Per-field "see an example" icon popover.
// Renders a lightbulb icon trigger + inline collapsible panel with a fictional sample answer.
// No modal takeover. Keyboard accessible (Escape closes). Voice-mandate compliant copy.

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";
import { CollapseButton } from "@/components/ui/CollapseButton";
import type { FieldExample } from "@/lib/field-examples";

interface FieldExamplePopoverProps {
  examples: FieldExample[];
}

export function FieldExamplePopover({ examples }: FieldExamplePopoverProps) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function toggle() {
    if (!open) setIdx(0);
    setOpen((o) => !o);
  }

  function nextExample() {
    setIdx((i) => (i + 1) % examples.length);
  }

  const ex = examples[idx];

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="See a sample answer from a fictional coffee shop"
        title="See a sample answer"
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)] ${
          open
            ? "text-[var(--teal)]"
            : "text-[var(--warm-900)] hover:text-[var(--teal)]"
        }`}
      >
        <Lightbulb size={13} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="mt-1 max-w-[min(18rem,calc(100vw-1rem))] bg-[var(--warm-250)] border border-[var(--warm-800)] rounded-xl p-4"
          role="region"
          aria-label="Sample answer from a fictional coffee shop"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[10px] font-semibold text-[var(--teal)] uppercase tracking-wider leading-none">
                {ex.shopName}
              </p>
              <p className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                {ex.shopType}
              </p>
            </div>
            <CollapseButton
              onClick={() => setOpen(false)}
              size={13}
              className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-none focus:text-[var(--foreground)] ml-2 shrink-0"
              aria-label="Close example"
            />
          </div>

          <p className="text-sm text-[var(--gray-1200)] leading-relaxed italic border-l-2 border-[var(--warm-950)] pl-3">
            {ex.answer}
          </p>

          <div className="flex items-center justify-between mt-3">
            {examples.length > 1 ? (
              <button
                type="button"
                onClick={nextExample}
                className="text-xs text-[var(--teal)] hover:underline focus-visible:outline-none focus:text-[var(--teal-dark)]"
              >
                See another shop
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[var(--foreground)] hover:text-[var(--teal)] transition-colors focus-visible:outline-none"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
