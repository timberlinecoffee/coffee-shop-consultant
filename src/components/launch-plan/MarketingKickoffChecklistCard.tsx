"use client";

import { useState } from "react";
import { useLaunchPlanRows } from "./useLaunchPlanRows";
import type { LaunchItemStatus } from "@/types/supabase";

type MarketingItem = {
  id: string;
  plan_id: string;
  channel: string;
  asset: string;
  launch_date: string | null;
  status: LaunchItemStatus;
  responsible: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: LaunchItemStatus[] = ["pending", "in_progress", "done", "at_risk"];

const STATUS_LABELS: Record<LaunchItemStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  at_risk: "At risk",
};

const STATUS_PILL: Record<LaunchItemStatus, string> = {
  pending: "bg-[var(--neutral-cool-150)] text-[var(--muted-foreground)]",
  in_progress: "bg-[var(--teal-tint-200)] text-[var(--teal)]",
  done: "bg-[var(--success-bg-2)] text-[var(--success-medium)]",
  at_risk: "bg-[var(--error-bg-8)] text-[var(--error-light)]",
};

export function MarketingKickoffChecklistCard() {
  const { loading, items, error, paywall, addItem, updateItem, removeItem } =
    useLaunchPlanRows<MarketingItem>("/api/launch-plan/marketing-kickoff");

  const [channelFilter, setChannelFilter] = useState<string>("");

  const channels = Array.from(new Set(items.map((r) => r.channel))).sort();
  const visible = channelFilter ? items.filter((r) => r.channel === channelFilter) : items;

  const handleAdd = () => {
    addItem({
      channel: channelFilter || "Social",
      asset: "New asset",
      launch_date: null,
      status: "pending",
      responsible: null,
      notes: null,
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-[var(--border)] p-6">
      <header className="flex items-start justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg text-[var(--foreground)]">Marketing Kickoff</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Channel assets, launch dates, and ownership across your pre-opening campaign.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md bg-[var(--teal)] text-white hover:bg-[var(--teal-darker)] disabled:opacity-50 shrink-0"
        >
          + Add item
        </button>
      </header>

      {channels.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setChannelFilter("")}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              channelFilter === ""
                ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                : "border-[var(--neutral-cool-300)] text-[var(--muted-foreground)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
            }`}
          >
            All
          </button>
          {channels.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch === channelFilter ? "" : ch)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                channelFilter === ch
                  ? "bg-[var(--teal)] text-white border-[var(--teal)]"
                  : "border-[var(--neutral-cool-300)] text-[var(--muted-foreground)] hover:border-[var(--teal)] hover:text-[var(--teal)]"
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] italic">
          {items.length === 0
            ? "No items yet. Add one to start planning your marketing."
            : "No items match this filter."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-lg border border-[var(--border)] p-3"
            >
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-2">
                <span className="block mb-1">Channel</span>
                <input
                  type="text"
                  defaultValue={row.channel}
                  onBlur={(e) =>
                    e.target.value !== row.channel &&
                    updateItem(row.id, { channel: e.target.value || "Other" })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  placeholder="Instagram"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-3">
                <span className="block mb-1">Asset</span>
                <input
                  type="text"
                  defaultValue={row.asset}
                  onBlur={(e) =>
                    e.target.value !== row.asset &&
                    updateItem(row.id, { asset: e.target.value })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  placeholder="Grand opening reel"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-2">
                <span className="block mb-1">Launch date</span>
                <input
                  type="date"
                  defaultValue={row.launch_date ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { launch_date: e.target.value || null })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-2">
                <span className="block mb-1">Status</span>
                <div className="flex items-center gap-1">
                  <select
                    value={row.status}
                    onChange={(e) =>
                      updateItem(row.id, { status: e.target.value as LaunchItemStatus })
                    }
                    className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-1">
                <span className="block mb-1">Who</span>
                <input
                  type="text"
                  defaultValue={row.responsible ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { responsible: e.target.value || null })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                  placeholder="Name"
                />
              </label>
              <label className="text-xs text-[var(--muted-foreground)] md:col-span-1">
                <span className="block mb-1">Notes</span>
                <input
                  type="text"
                  defaultValue={row.notes ?? ""}
                  onBlur={(e) =>
                    updateItem(row.id, { notes: e.target.value || null })
                  }
                  className="w-full border border-[var(--neutral-cool-300)] rounded px-2 py-1 text-sm text-[var(--foreground)]"
                />
              </label>
              <div className="md:col-span-1 flex flex-col items-end justify-between gap-1">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_PILL[row.status]}`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(row.id)}
                  className="text-xs text-[var(--error-light)] hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(error || paywall) && (
        <div className="mt-3 text-xs">
          {paywall ? (
            <a href="/pricing" className="text-[var(--teal)] underline">Upgrade to save</a>
          ) : (
            <span className="text-[var(--error-light)]" role="alert">{error}</span>
          )}
        </div>
      )}
    </section>
  );
}
