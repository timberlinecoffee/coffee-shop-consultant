"use client";

import { RefreshCw } from "lucide-react";

type SyncSource = "Menu" | "Equipment and Supplies";

interface SyncedFromBadgeProps {
  source: SyncSource;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

export function SyncedFromBadge({
  source,
  onRefresh,
  isRefreshing = false,
  className = "",
}: SyncedFromBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xl bg-[var(--teal)]/5 border border-[var(--teal)]/20 text-[10px] font-medium text-[var(--teal)] leading-none shrink-0 ${className}`}
    >
      Synced from {source}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center text-[var(--teal)] opacity-60 hover:opacity-100 disabled:opacity-30 transition-opacity"
          aria-label={`Refresh from ${source}`}
          title={`Refresh from ${source}`}
        >
          <RefreshCw
            size={9}
            className={isRefreshing ? "animate-spin" : ""}
            strokeWidth={2.5}
          />
        </button>
      )}
    </span>
  );
}
