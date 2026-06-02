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
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-xl bg-teal/5 border border-teal/20 text-[10px] font-medium text-teal leading-none ${className}`}
    >
      Synced from {source}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center text-teal/60 hover:text-teal disabled:opacity-40 transition-colors"
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
