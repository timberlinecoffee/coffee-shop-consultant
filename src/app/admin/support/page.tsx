"use client";

// TIM-1942: Admin support inbox. Reads TIM-1941's support_messages table.

import { Fragment, useEffect, useState } from "react";
import { MessageSquare, Mail, RefreshCw } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { AdminSubNav } from "../_components/AdminSubNav";
import { formatRelative } from "../_components/MoneyAndDates";
import type { AdminSupportMessage } from "@/types/admin";

const TABS: Array<{ key: AdminSupportMessage["status"] | "all"; label: string }> = [
  { key: "new", label: "New" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "spam", label: "Spam" },
  { key: "all", label: "All" },
];

export default function AdminSupportPage() {
  const [rows, setRows] = useState<AdminSupportMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminSupportMessage["status"] | "all">("new");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelledFlag = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/support-messages");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminSupportMessage[];
        if (!cancelledFlag) setRows(data);
      } catch (e) {
        if (!cancelledFlag) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelledFlag = true;
    };
  }, [refreshTick]);

  const reload = () => setRefreshTick((t) => t + 1);

  async function setStatus(id: string, status: AdminSupportMessage["status"]) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/support-messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = (await res.json()) as AdminSupportMessage;
        setRows((prev) => (prev ?? []).map((r) => (r.id === id ? updated : r)));
      }
    } finally {
      setBusy(null);
    }
  }

  const filtered = (rows ?? []).filter((r) => tab === "all" || r.status === tab);
  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] = (rows ?? []).filter((r) => t.key === "all" || r.status === t.key).length;
    return acc;
  }, {});

  return (
    <>
      <WorkspaceHeader
        Icon={MessageSquare}
        title="Support inbox"
        description="Messages submitted from the public help center. Mark each as open while you reply, then closed."
        actions={
          <WorkspaceActionButton variant="secondary" type="button" onClick={reload}>
            <RefreshCw size={WORKSPACE_ACTION_ICON_SIZE} />
            Refresh
          </WorkspaceActionButton>
        }
      />
      <AdminSubNav active="support" />

      {error && <p className={`${TABLE_CELL_TEXT} text-[var(--error)] mb-3`}>{error}</p>}

      <div className="mb-3 flex items-center gap-1 bg-white border border-[var(--border)] rounded-xl p-1 w-fit">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                active ? "bg-[var(--teal)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {t.label}
              <span className="ml-1 text-[10px] opacity-70">({counts[t.key] ?? 0})</span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <table className={`w-full ${TABLE_CELL_TEXT}`}>
          <thead>
            <tr className="bg-[var(--background)] border-b border-[var(--neutral-cool-150)]">
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>From</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Subject</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Received</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Status</th>
              <th className="px-3 py-2 w-32" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--dark-grey)]">
                  {rows == null ? "Loading..." : "Nothing in this view."}
                </td>
              </tr>
            )}
            {filtered.map((m) => {
              const open = expanded === m.id;
              return (
                <Fragment key={m.id}>
                  <tr
                    className={`border-b border-[var(--neutral-cool-150)] cursor-pointer ${m.status === "new" ? "font-semibold" : ""}`}
                    onClick={() => setExpanded(open ? null : m.id)}
                  >
                    <td className="px-3 py-2">
                      <p className="text-[var(--foreground)]">{m.name}</p>
                      <p className="text-[var(--muted-foreground)]">{m.email}</p>
                    </td>
                    <td className="px-3 py-2 text-[var(--foreground)]">{m.subject}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatRelative(m.created_at)}</td>
                    <td className="px-3 py-2 capitalize text-[var(--muted-foreground)]">{m.status}</td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={`mailto:${m.email}?subject=Re: ${encodeURIComponent(m.subject)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[var(--teal)] hover:underline"
                      >
                        <Mail size={11} />
                        Reply
                      </a>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-[var(--neutral-cool-150)] bg-[var(--background)]">
                      <td colSpan={5} className="px-3 py-4">
                        <pre className="whitespace-pre-wrap font-sans text-[var(--foreground)] mb-3">{m.message}</pre>
                        {m.page_url && (
                          <p className="text-[var(--muted-foreground)] mb-3">From page: {m.page_url}</p>
                        )}
                        <div className="flex items-center gap-2">
                          {m.status !== "open" && (
                            <button
                              type="button"
                              disabled={busy === m.id}
                              onClick={() => void setStatus(m.id, "open")}
                              className="text-xs font-semibold text-[var(--teal)] border border-[var(--teal)]/30 rounded-lg px-3 py-1.5 hover:bg-[var(--teal)]/5 disabled:opacity-50"
                            >
                              Mark open
                            </button>
                          )}
                          {m.status !== "closed" && (
                            <button
                              type="button"
                              disabled={busy === m.id}
                              onClick={() => void setStatus(m.id, "closed")}
                              className="text-xs font-semibold text-[var(--teal)] border border-[var(--teal)]/30 rounded-lg px-3 py-1.5 hover:bg-[var(--teal)]/5 disabled:opacity-50"
                            >
                              Mark closed
                            </button>
                          )}
                          {m.status !== "spam" && (
                            <button
                              type="button"
                              disabled={busy === m.id}
                              onClick={() => void setStatus(m.id, "spam")}
                              className="text-xs font-semibold text-[var(--muted-foreground)] border border-[var(--neutral-cool-200)] rounded-lg px-3 py-1.5 hover:bg-[var(--surface-warm-100)] disabled:opacity-50"
                            >
                              Spam
                            </button>
                          )}
                          {m.status !== "new" && (
                            <button
                              type="button"
                              disabled={busy === m.id}
                              onClick={() => void setStatus(m.id, "new")}
                              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
                            >
                              Reopen as new
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
