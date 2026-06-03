"use client";

// TIM-1942: Read-only audit log view.

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { AdminSubNav } from "../_components/AdminSubNav";
import { formatDate } from "../_components/MoneyAndDates";
import type { AdminAuditRow } from "@/types/admin";

export default function AdminAuditLogPage() {
  const [rows, setRows] = useState<AdminAuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/audit-log");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminAuditRow[];
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <WorkspaceHeader
        Icon={History}
        title="Audit log"
        description="Every state-changing admin action is recorded here. Read-only — entries cannot be edited or deleted."
      />
      <AdminSubNav active="audit" />

      {error && <p className={`${TABLE_CELL_TEXT} text-[var(--error)] mb-3`}>{error}</p>}

      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <table className={`w-full ${TABLE_CELL_TEXT}`}>
          <thead>
            <tr className="bg-[var(--background)] border-b border-[var(--neutral-cool-150)]">
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>When</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Actor</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Action</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Target</th>
              <th className="px-3 py-2 w-20" />
            </tr>
          </thead>
          <tbody>
            {rows == null && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--dark-grey)]">Loading...</td>
              </tr>
            )}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--dark-grey)]">
                  No admin actions yet.
                </td>
              </tr>
            )}
            {(rows ?? []).map((row) => {
              const open = expanded === row.id;
              return (
                <tr
                  key={row.id}
                  className="border-b border-[var(--neutral-cool-150)] last:border-b-0 hover:bg-[var(--background)]"
                >
                  <td className="px-3 py-2 text-[var(--muted-foreground)] align-top">{formatDate(row.created_at)}</td>
                  <td className="px-3 py-2 align-top">{row.actor_email}</td>
                  <td className="px-3 py-2 align-top">
                    <span className="capitalize">{row.action.replace(/_/g, " ")}</span>
                    {open && (
                      <pre className="mt-2 text-[10px] bg-[var(--background)] rounded p-2 whitespace-pre-wrap break-all">
{JSON.stringify({ before: row.before_state, after: row.after_state, metadata: row.metadata }, null, 2)}
                      </pre>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted-foreground)] align-top">{row.target_email ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : row.id)}
                      className="text-xs text-[var(--teal)] hover:underline"
                    >
                      {open ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
