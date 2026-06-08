"use client";

// TIM-1942: Admin portal home.
// Shows totals + "recently signed up" and "recently cancelled" — the two
// dashboards the board asked for on top of the action surfaces.

import { useEffect, useState } from "react";
import { LayoutDashboard } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { AdminSubNav } from "./_components/AdminSubNav";
import { formatDate, formatUsdCents } from "./_components/MoneyAndDates";
import type { AdminMemberSummary } from "@/types/admin";

export default function AdminHomePage() {
  const [members, setMembers] = useState<AdminMemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/members");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminMemberSummary[];
        if (!cancelled) setMembers(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <>
        <AdminSubNav active="overview" />
        <p className={`${TABLE_CELL_TEXT} text-[var(--error)]`}>{error}</p>
      </>
    );
  }
  if (!members) {
    return (
      <>
        <AdminSubNav active="overview" />
        <p className={`${TABLE_CELL_TEXT} text-[var(--muted-foreground)]`}>Loading...</p>
      </>
    );
  }

  const totalMembers = members.length;
  const trialing = members.filter((m) => m.subscription_status === "free_trial").length;
  const active = members.filter((m) => m.subscription_status === "active").length;
  const totalMrrCents = members
    .filter((m) => m.subscription_status === "active")
    .reduce((sum, m) => sum + m.mrr_cents, 0);

  const recentSignups = [...members]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const recentCancels = members
    .filter((m) => m.subscription_status === "cancelled")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  return (
    <>
      <WorkspaceHeader
        Icon={LayoutDashboard}
        title="Admin"
        description="Member and subscription management for Groundwork. Every state-changing action writes to the audit log."
      />
      <AdminSubNav active="overview" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total members" value={String(totalMembers)} />
        <StatCard label="Trialing" value={String(trialing)} />
        <StatCard label="Active" value={String(active)} />
        <StatCard label="Monthly recurring" value={formatUsdCents(totalMrrCents)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RecentTable title="Recently signed up" rows={recentSignups} dateKey="created_at" />
        <RecentTable title="Recently cancelled" rows={recentCancels} dateKey="updated_at" emptyLabel="No cancellations." />
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-4">
      <p className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] mb-1`}>{label}</p>
      <p className="text-2xl font-bold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function RecentTable({
  title,
  rows,
  dateKey,
  emptyLabel,
}: {
  title: string;
  rows: AdminMemberSummary[];
  dateKey: "created_at" | "updated_at";
  emptyLabel?: string;
}) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
      <p className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] px-3 pt-3`}>{title}</p>
      <table className={`w-full ${TABLE_CELL_TEXT}`}>
        <thead>
          <tr className="border-b border-[var(--neutral-cool-150)]">
            <th className={`px-3 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)]`}>Email</th>
            <th className={`px-3 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)]`}>Tier</th>
            <th className={`px-3 py-2 text-left ${TABLE_HEADER_TEXT} text-[var(--muted-foreground)]`}>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-[var(--dark-grey)]">
                {emptyLabel ?? "Nothing here yet."}
              </td>
            </tr>
          )}
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-[var(--neutral-cool-150)] last:border-b-0">
              <td className="px-3 py-2">
                <a className="text-[var(--teal)] hover:underline" href={`/admin/members/${m.id}`}>
                  {m.email}
                </a>
              </td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{m.subscription_tier}</td>
              <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatDate(m[dateKey])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
