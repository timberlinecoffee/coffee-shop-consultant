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
        className="flex items-center gap-1.5 text-sm text-[var(--teal)] hover:underline focus:outline-none"
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
              className="text-sm text-[var(--gray-1200)] leading-relaxed italic border-l-2 border-[var(--warm-800)] pl-3"
            >
              {ex}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
