"use client";

// TIM-2434: Settings → Documents table.
//
// Equipment-canon table styles (TABLE_CELL_TEXT, TABLE_HEADER_TEXT). Off-white
// outline-only empty state per TIM-1579. Voice: sentence case body, Title Case
// headings, no em dashes.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText, MoreHorizontal } from "lucide-react";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
} from "@/lib/workspace-table";

interface SessionRow {
  id: string;
  label: string | null;
  status: string;
  source: string;
  estimated_credits: number;
  credits_charged: number;
  created_at: string;
  file_count: number;
  suites: string[];
}

const SUITE_LABEL: Record<string, string> = {
  business_plan: "BP",
  financials: "FIN",
  concept_brand: "C&B",
};

function StatusChip({ status }: { status: string }) {
  let label: string;
  let cls: string;
  switch (status) {
    case "applied":
      label = "Applied";
      cls = "bg-[var(--sage)]/15 text-[var(--sage)]";
      break;
    case "ready":
      label = "Ready for review";
      cls = "bg-[var(--teal)]/10 text-[var(--teal)]";
      break;
    case "extracting":
      label = "Extracting";
      cls = "bg-amber-100 text-amber-700";
      break;
    case "estimated":
      label = "Awaiting confirm";
      cls = "bg-neutral-200 text-neutral-600";
      break;
    case "error":
      label = "Error";
      cls = "bg-red-50 text-[var(--destructive)]";
      break;
    case "archived":
      label = "Archived";
      cls = "bg-neutral-200 text-neutral-500";
      break;
    case "cancelled":
      label = "Cancelled";
      cls = "bg-neutral-200 text-neutral-500";
      break;
    default:
      label = "Queued";
      cls = "bg-neutral-200 text-neutral-600";
  }
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function EmptyState() {
  // TIM-1579: off-white outline-only illustration. Single stroke on the brand
  // dark-green; no fills, no gold, no shadows.
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-12 text-center">
      <svg
        viewBox="0 0 140 140"
        width="140"
        height="140"
        className="mx-auto"
        aria-hidden
      >
        <rect
          x="32"
          y="28"
          width="60"
          height="80"
          rx="4"
          fill="none"
          stroke="#0e4448"
          strokeWidth="2"
        />
        <line x1="42" y1="48" x2="82" y2="48" stroke="#0e4448" strokeWidth="2" />
        <line x1="42" y1="62" x2="82" y2="62" stroke="#0e4448" strokeWidth="2" />
        <line x1="42" y1="76" x2="74" y2="76" stroke="#0e4448" strokeWidth="2" />
        <path
          d="M100 72 L100 58 L108 66 M100 58 L92 66"
          fill="none"
          stroke="#0e4448"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2 className="text-xl font-bold text-[var(--foreground)]">
        No documents imported yet
      </h2>
      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-[340px] text-center mx-auto mt-2">
        Upload your business plan, financial statements, or branding materials.
        We&apos;ll read them and suggest how to fill in your planning suites.
      </p>
      <Link
        href="/dashboard?openImport=1"
        className="inline-block mt-5 bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold"
      >
        Import your first document
      </Link>
    </div>
  );
}

export function DocumentsTable({ planId }: { planId: string }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/document-import/sessions?planId=${encodeURIComponent(planId)}`,
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load imports.");
      return;
    }
    setSessions(data.sessions ?? []);
  }, [planId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (sessions === null) {
    return (
      <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>
    );
  }
  if (error) {
    return <div className="text-sm text-[var(--destructive)]">{error}</div>;
  }
  if (sessions.length === 0) return <EmptyState />;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-[var(--background)] border-b border-[var(--border)]">
            <th
              className={`${TABLE_HEADER_TEXT} text-left text-[var(--muted-foreground)] px-4 py-2`}
            >
              File
            </th>
            <th
              className={`${TABLE_HEADER_TEXT} text-left text-[var(--muted-foreground)] px-4 py-2`}
            >
              Imported
            </th>
            <th
              className={`${TABLE_HEADER_TEXT} text-left text-[var(--muted-foreground)] px-4 py-2`}
            >
              Status
            </th>
            <th
              className={`${TABLE_HEADER_TEXT} text-left text-[var(--muted-foreground)] px-4 py-2`}
            >
              Suites
            </th>
            <th
              className={`${TABLE_HEADER_TEXT} text-left text-[var(--muted-foreground)] px-4 py-2`}
            >
              Credits
            </th>
            <th
              className={`${TABLE_HEADER_TEXT} text-right text-[var(--muted-foreground)] px-4 py-2`}
            >
              {/* three-dot actions header */}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {sessions.map((s) => (
            <tr
              key={s.id}
              className={`${TABLE_CELL_TEXT} text-[var(--foreground)]`}
              data-testid="document-import-row"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText
                    className="w-4 h-4 text-[var(--muted-foreground)]"
                    aria-hidden
                  />
                  <span className="truncate">
                    {s.label || `${s.file_count} file${s.file_count === 1 ? "" : "s"}`}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {new Date(s.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-3">
                <StatusChip status={s.status} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {s.suites.map((sk) => (
                    <span
                      key={sk}
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--background)] text-[var(--muted-foreground)] border border-[var(--border)]"
                    >
                      {SUITE_LABEL[sk] ?? sk}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--muted-foreground)]">
                {s.credits_charged || s.estimated_credits}
              </td>
              <td className="px-4 py-3 text-right">
                <DocActions sessionId={s.id} onChanged={load} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocActions({
  sessionId,
  onChanged,
}: {
  sessionId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const remove = useCallback(async () => {
    if (!confirm("Remove this import? Uploaded files will be deleted.")) return;
    await fetch(`/api/document-import/sessions/${sessionId}`, {
      method: "DELETE",
    });
    onChanged();
  }, [sessionId, onChanged]);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label="Actions"
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded hover:bg-[var(--background)] border border-transparent hover:border-[var(--border)]"
      >
        <MoreHorizontal className="w-4 h-4 text-[var(--muted-foreground)]" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-[var(--border)] rounded-xl shadow-lg z-10 py-1">
          <button
            type="button"
            onClick={remove}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--background)] text-[var(--destructive)]"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
