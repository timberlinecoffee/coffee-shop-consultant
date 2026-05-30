"use client";

export function PrintButton() {
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
