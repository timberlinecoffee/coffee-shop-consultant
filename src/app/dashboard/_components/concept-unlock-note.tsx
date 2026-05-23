"use client";

import { useState } from "react";

export function ConceptUnlockNote({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(show);

  if (!visible) return null;

  function dismiss() {
    document.cookie = "concept_unlock_note_dismissed=1; path=/; SameSite=Lax; Max-Age=31536000";
    setVisible(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 mb-3 rounded-xl bg-[#155e63]/[0.06] px-4 py-2.5">
      <p className="text-xs text-[#155e63]">
        All modules are now open. Your concept is the starting point for everything else.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-[#155e63] hover:text-[#0e4448] flex-shrink-0 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
