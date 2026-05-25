"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SectionOption = { key: string; label: string };

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

export function SectionToggle({
  sections,
  excluded,
}: {
  sections: SectionOption[];
  excluded: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sections.filter((s) => !excluded.includes(s.key)).map((s) => s.key)),
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function applySelection() {
    const excludedNow = sections.filter((s) => !selected.has(s.key)).map((s) => s.key);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (excludedNow.length === 0) {
      params.delete("exclude");
    } else {
      params.set("exclude", excludedNow.join(","));
    }
    const query = params.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
    setOpen(false);
  }

  function selectAll() {
    setSelected(new Set(sections.map((s) => s.key)));
  }

  const includedCount = selected.size;
  const totalCount = sections.length;
  const label =
    includedCount === totalCount
      ? "Choose sections"
      : `${includedCount} of ${totalCount} sections`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 border border-[#d8d8d8] text-[#1a1a1a] text-sm font-medium px-4 py-2 rounded-lg hover:border-[#155e63] hover:text-[#155e63] transition-colors"
      >
        {label}
        <span aria-hidden="true" className="text-xs">▾</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose sections to include"
          className="absolute right-0 mt-2 w-72 bg-white border border-[#e5e5e5] rounded-lg shadow-lg z-20 p-3"
        >
          <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-[#efefef]">
            <p className="text-xs font-semibold tracking-wide uppercase text-[#6b6b6b]">
              Include sections
            </p>
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-[#155e63] font-medium hover:underline"
            >
              Select all
            </button>
          </div>
          <ul className="max-h-72 overflow-y-auto space-y-1">
            {sections.map((s) => {
              const checked = selected.has(s.key);
              return (
                <li key={s.key}>
                  <label className="flex items-center gap-2.5 px-1.5 py-1.5 rounded hover:bg-[#f6f6f6] cursor-pointer text-sm text-[#1a1a1a]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.key)}
                      className="h-4 w-4 accent-[#155e63]"
                    />
                    <span>{s.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-[#efefef]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-[#6b6b6b] font-medium px-3 py-1.5 rounded hover:text-[#1a1a1a]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applySelection}
              disabled={selected.size === 0}
              className="text-sm bg-[#155e63] text-white font-semibold px-3 py-1.5 rounded hover:bg-[#0e4448] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
