"use client";

// TIM-2782 (Phase 6): v2 Hiring workspace — card-per-role mobile layout.
// Mirrors EquipmentMobileV2/SuppliesMobileV2 pattern, adapted for OrgRole fields.
// Renders below md when ui_revamp_v2 is on; desktop keeps the org chart + role
// table above md.

import { useMemo, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { OrgRole, HiringRoleStatus } from "@/lib/hiring";
import { formatMinor } from "@/lib/formatters";

const STATUS_LABELS: Record<HiringRoleStatus, string> = {
  planned: "Planned",
  posted: "Posted",
  interviewing: "Interviewing",
  hired: "Hired",
};

interface Props {
  roles: OrgRole[];
  currencyCode: string;
}

export function HiringMobileV2({ roles, currencyCode }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const rolesById = useMemo(() => {
    const map = new Map<string, OrgRole>();
    for (const r of roles) map.set(r.id, r);
    return map;
  }, [roles]);

  const totalMonthlyCents = useMemo(
    () =>
      roles.reduce(
        (sum, r) =>
          sum + (r.monthly_cost_cents ?? 0) * Math.max(1, r.headcount),
        0
      ),
    [roles]
  );

  const openRole = openId ? rolesById.get(openId) ?? null : null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Hiring Overview
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {roles.length} role{roles.length === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {totalMonthlyCents > 0
            ? `${formatMinor(totalMonthlyCents, currencyCode)}/mo total`
            : "No monthly costs set"}
        </p>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No roles yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {roles.map((role) => {
            const monthlyCents = (role.monthly_cost_cents ?? 0) * Math.max(1, role.headcount);
            return (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(role.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${role.role_title || "Unnamed Role"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {role.role_title || "Unnamed Role"}
                      </p>
                      <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                        {monthlyCents > 0
                          ? `${formatMinor(monthlyCents, currencyCode)}/mo`
                          : <span className="text-[var(--muted-foreground)] font-normal">No cost set</span>}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
                      {STATUS_LABELS[role.status] ?? role.status}
                      {role.headcount > 1 ? ` · ${role.headcount} headcount` : ""}
                      {role.start_date ? ` · Start ${role.start_date}` : ""}
                    </p>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openRole && (
        <RoleDetailSheet
          role={openRole}
          parentTitle={
            openRole.parent_role_id
              ? rolesById.get(openRole.parent_role_id)?.role_title ?? null
              : null
          }
          currencyCode={currencyCode}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function RoleDetailSheet({
  role,
  parentTitle,
  currencyCode,
  onClose,
}: {
  role: OrgRole;
  parentTitle: string | null;
  currencyCode: string;
  onClose: () => void;
}) {
  const monthlyCents = (role.monthly_cost_cents ?? 0) * Math.max(1, role.headcount);

  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Status", value: STATUS_LABELS[role.status] ?? role.status },
    { label: "Headcount", value: String(role.headcount) },
    {
      label: "Monthly Cost",
      value:
        role.monthly_cost_cents !== null
          ? formatMinor(role.monthly_cost_cents, currencyCode)
          : null,
    },
    {
      label: "Total Monthly",
      value: monthlyCents > 0 ? `${formatMinor(monthlyCents, currencyCode)}/mo` : null,
    },
    { label: "Start Date", value: role.start_date },
    { label: "Reports To", value: parentTitle },
    { label: "Notes", value: role.notes },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hiring-role-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="hiring-role-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {role.role_title || "Unnamed Role"}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {STATUS_LABELS[role.status] ?? role.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <dl className="divide-y divide-[var(--border)] px-5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start justify-between gap-3 py-3"
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {row.label}
              </dt>
              <dd className="max-w-[60%] text-right text-sm text-[var(--foreground)]">
                {row.value && row.value.trim() ? (
                  row.value
                ) : (
                  <span className="text-[var(--muted-foreground)]">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            Edits are available on the desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
