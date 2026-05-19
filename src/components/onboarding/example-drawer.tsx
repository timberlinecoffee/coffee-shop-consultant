"use client";

import { useState } from "react";

// TIM-821: collapsed by default. Toggle reveals founder-voice examples.
// Trigger text is always "See how other founders answered this" — never "view example."

interface ExampleDrawerProps {
  examples: string[];
  label?: string;
}

export function ExampleDrawer({
  examples,
  label = "See how other founders answered this",
}: ExampleDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-[#155e63] hover:underline focus:outline-none"
        aria-expanded={open}
      >
        <span
          className={`inline-block transition-transform duration-150 ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          &#8250;
        </span>
        {label}
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-4">
          {examples.map((ex, i) => (
            <p
              key={i}
              className="text-sm text-[#4a4a4a] leading-relaxed italic border-l-2 border-[#e0ddd8] pl-3"
            >
              {ex}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
