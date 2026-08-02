"use client";

// TIM-4106 (UX Phase 1): one print button, one name.
//
// There were four byte-identical copies of this component, one per print
// route, and they had already drifted: three said "Print document" and menu
// said "Print recipe cards". Four copies of the same thing will always drift —
// so there is now one, and the copies re-export it.
//
// Naming rule: a button that prints the page you are looking at is always
// "Print document". Buttons that print something DIFFERENT from the current
// page (a blank scorecard, an interview worksheet) keep their descriptive
// names — those are not the same action and should not share a label.

export function PrintDocumentButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-block bg-[var(--teal)] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors"
    >
      Print document
    </button>
  );
}
