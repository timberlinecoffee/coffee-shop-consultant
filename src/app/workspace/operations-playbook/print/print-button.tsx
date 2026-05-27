"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-block bg-[#155e63] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[#0e4448] transition-colors"
    >
      Print document
    </button>
  );
}
