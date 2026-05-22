"use client";

// TIM-867: Per-field "see an example" icon popover.
// Renders a lightbulb icon trigger + inline collapsible panel with a fictional sample answer.
// No modal takeover. Keyboard accessible (Escape closes). Voice-mandate compliant copy.

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
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
        className={`inline-flex items-center justify-center w-5 h-5 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-[#155e63] ${
          open
            ? "text-[#155e63]"
            : "text-[#c8c5be] hover:text-[#155e63]"
        }`}
      >
        <Lightbulb size={13} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="mt-1 max-w-72 bg-[#f5f3ef] border border-[#e0ddd8] rounded-xl p-4"
          role="region"
          aria-label="Sample answer from a fictional coffee shop"
        >
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[10px] font-semibold text-[#155e63] uppercase tracking-wider leading-none">
                {ex.shopName}
              </p>
              <p className="text-[10px] text-[#6b6b6b] italic mt-0.5">
                {ex.shopType}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close example"
              className="text-[#afafaf] hover:text-[#1a1a1a] transition-colors focus:outline-none focus:text-[#1a1a1a] ml-2 shrink-0"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>

          <p className="text-sm text-[#4a4a4a] leading-relaxed italic border-l-2 border-[#c5c0b8] pl-3">
            {ex.answer}
          </p>

          <div className="flex items-center justify-between mt-3">
            {examples.length > 1 ? (
              <button
                type="button"
                onClick={nextExample}
                className="text-xs text-[#155e63] hover:underline focus:outline-none focus:text-[#0e4448]"
              >
                See another shop
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-[#1a1a1a] hover:text-[#155e63] transition-colors focus:outline-none"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
