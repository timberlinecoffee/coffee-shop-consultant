// TIM-1941: docs index table for the Help & Support center.
// Locked to the canonical Equipment-table typography + control sizing
// (src/lib/workspace-table.ts) — body text-xs, header text-[10px] uppercase,
// icons 13px. The row action button uses WorkspaceActionButton so the size /
// appearance matches every other workspace.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HELP_DOCS } from "../docs";
import {
  TABLE_CELL_TEXT,
  TABLE_HEADER_TEXT,
  TABLE_ACTION_ICON_SIZE,
} from "@/lib/workspace-table";

export function DocsTable() {
  const cellCls =
    `px-3 py-2.5 ${TABLE_CELL_TEXT} text-[var(--foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 align-top`;
  const headerCellCls =
    `px-3 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] border-r border-[var(--neutral-cool-150)] last:border-r-0 bg-[var(--background)] select-none`;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-white relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-white to-transparent sm:hidden"
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--neutral-cool-150)]">
              <th className={headerCellCls} style={{ width: "32%" }}>
                Article
              </th>
              <th className={headerCellCls}>Summary</th>
              <th className={headerCellCls} style={{ width: "18%" }}>
                Category
              </th>
              <th className={headerCellCls} style={{ width: "9%" }}>
                Read
              </th>
              <th className={headerCellCls} style={{ width: "10%" }} />
            </tr>
          </thead>
          <tbody>
            {HELP_DOCS.map((doc) => (
              <tr
                key={doc.slug}
                className="border-b border-[var(--neutral-cool-100)] last:border-b-0 bg-white hover:bg-[var(--background)] transition-colors"
              >
                <td className={cellCls}>
                  <Link
                    href={`/help/${doc.slug}`}
                    className="font-semibold text-[var(--foreground)] hover:text-[var(--teal)] transition-colors"
                  >
                    {doc.title}
                  </Link>
                </td>
                <td className={`${cellCls} text-[var(--muted-foreground)]`}>
                  {doc.blurb}
                </td>
                <td className={`${cellCls} text-[var(--muted-foreground)]`}>
                  {doc.category}
                </td>
                <td className={`${cellCls} text-[var(--muted-foreground)]`}>
                  {doc.readMinutes} min
                </td>
                <td className={`${cellCls} text-right`}>
                  <Link
                    href={`/help/${doc.slug}`}
                    className="inline-flex items-center gap-1 text-[var(--teal)] hover:text-[var(--teal-deep)] font-semibold"
                    aria-label={`Open ${doc.title}`}
                  >
                    Open
                    <ArrowRight
                      size={TABLE_ACTION_ICON_SIZE}
                      aria-hidden="true"
                    />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
