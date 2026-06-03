"use client";

// TIM-1942: Admin members list. Equipment-table typography (workspace-table
// canon) — text-xs body, text-[10px] uppercase header. Client-side search and
// sort over up to ~hundreds of rows.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Users, Download } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { AdminSubNav } from "../_components/AdminSubNav";
import { formatDate, formatUsdCents } from "../_components/MoneyAndDates";
import type { AdminMemberSummary } from "@/types/admin";

type SortKey = "created_at" | "subscription_tier" | "subscription_status" | "email" | "mrr_cents";

export default function AdminMembersPage() {
  const [rows, setRows] = useState<AdminMemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/members");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminMemberSummary[];
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (r) =>
            r.email.toLowerCase().includes(q) ||
            (r.full_name ?? "").toLowerCase().includes(q) ||
            (r.signup_source ?? "").toLowerCase().includes(q),
        )
      : [...rows];
    list.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort];
      const bv = (b as Record<string, unknown>)[sort];
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return dir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [rows, query, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(key);
      setDir(key === "email" ? "asc" : "desc");
    }
  }

  return (
    <>
      <WorkspaceHeader
        Icon={Users}
        title="Members"
        description={`${rows?.length ?? "—"} accounts. Search by email, name, or signup source.`}
        actions={
          <a href="/api/admin/members/export" download>
            <WorkspaceActionButton variant="secondary" type="button">
              <Download size={WORKSPACE_ACTION_ICON_SIZE} />
              Export CSV
            </WorkspaceActionButton>
          </a>
        }
      />
      <AdminSubNav active="members" />

      {error && <p className={`${TABLE_CELL_TEXT} text-[var(--error)] mb-3`}>{error}</p>}

      <div className="mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members..."
          className={`${TABLE_CELL_TEXT} border border-[var(--neutral-cool-200)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--teal)] w-full max-w-md bg-white`}
        />
      </div>

      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <table className={`w-full ${TABLE_CELL_TEXT}`}>
          <thead>
            <tr className="bg-[var(--background)] border-b border-[var(--neutral-cool-150)]">
              <SortHeader label="Email" k="email" sort={sort} dir={dir} onClick={toggleSort} />
              <SortHeader label="Plan" k="subscription_tier" sort={sort} dir={dir} onClick={toggleSort} />
              <SortHeader label="Status" k="subscription_status" sort={sort} dir={dir} onClick={toggleSort} />
              <SortHeader label="MRR" k="mrr_cents" sort={sort} dir={dir} onClick={toggleSort} className="text-right" />
              <SortHeader label="Signup" k="created_at" sort={sort} dir={dir} onClick={toggleSort} />
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Last sign in</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Credits</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[var(--dark-grey)]">
                  {rows == null ? "Loading..." : query ? "No matches." : "No members yet."}
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-[var(--neutral-cool-150)] last:border-b-0 hover:bg-[var(--background)]">
                <td className="px-3 py-2">
                  <Link href={`/admin/members/${m.id}`} className="text-[var(--teal)] hover:underline font-medium">
                    {m.email}
                  </Link>
                  {m.full_name ? <span className="text-[var(--muted-foreground)] ml-2">{m.full_name}</span> : null}
                </td>
                <td className="px-3 py-2 capitalize">{m.subscription_tier}</td>
                <td className="px-3 py-2 capitalize text-[var(--muted-foreground)]">{m.subscription_status.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-right">{m.mrr_cents > 0 ? formatUsdCents(m.mrr_cents) : "—"}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatDate(m.created_at)}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatDate(m.last_sign_in_at)}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{m.ai_credits_remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortHeader({
  label,
  k,
  sort,
  dir,
  onClick,
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort === k;
  return (
    <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] px-3 py-2 ${className ?? "text-left"}`}>
      <button
        type="button"
        className={`${active ? "text-[var(--foreground)]" : ""} hover:text-[var(--foreground)] inline-flex items-center gap-1`}
        onClick={() => onClick(k)}
      >
        {label}
        {active ? <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
