"use client";

// TIM-2596 (Phase 5.8): v2 Personnel/Org mobile surface — card-per-role layout.
// Renders at <md viewports when ui_revamp_v2 is on; v1 expandable RoleRow keeps
// rendering at md+. Tap a card → slide-up detail sheet with full role detail +
// inline editable role_title, headcount, status, notes.
//
// Supports tap-to-edit per acceptance criteria.

import { useState } from "react";
import { ChevronRight, X } from "lucide-react";
import type { OrgRole, HiringRoleStatus } from "@/lib/hiring";
import { ROLE_STATUS_CONFIG } from "@/lib/hiring";
import { formatMinor } from "@/lib/formatters";

interface Props {
  roles: OrgRole[];
  canEdit: boolean;
  currencyCode: string;
  onUpdate: (id: string, patch: Partial<OrgRole>) => void;
}

export function PersonnelMobileV2({ roles, canEdit, currencyCode, onUpdate }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openRole = openId ? roles.find((r) => r.id === openId) ?? null : null;

  const activeRoles = roles.filter((r) => !r.parent_role_id);
  const childMap = new Map<string, OrgRole[]>();
  for (const r of roles) {
    if (r.parent_role_id) {
      const arr = childMap.get(r.parent_role_id) ?? [];
      arr.push(r);
      childMap.set(r.parent_role_id, arr);
    }
  }

  // Flatten in tree order: root → children depth-first
  const ordered: OrgRole[] = [];
  const visited = new Set<string>();
  function walk(r: OrgRole) {
    if (visited.has(r.id)) return;
    visited.add(r.id);
    ordered.push(r);
    for (const c of childMap.get(r.id) ?? []) walk(c);
  }
  for (const r of activeRoles) walk(r);
  for (const r of roles) if (!visited.has(r.id)) ordered.push(r);

  const totalHeadcount = roles.reduce((s, r) => s + (r.headcount ?? 0), 0);
  const totalMonthlyCents = roles.reduce((s, r) => s + (r.monthly_cost_cents ?? 0), 0);
  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal-tint-100)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">
          Team Overview
        </p>
        <p className="mt-1 text-xl font-semibold text-[var(--foreground)]">
          {totalHeadcount} headcount
        </p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          {roles.length} role{roles.length === 1 ? "" : "s"}
          {totalMonthlyCents > 0
            ? ` · ${formatMinor(totalMonthlyCents, currencyCode)}/mo`
            : ""}
        </p>
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No roles yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((role) => {
            const statusCfg = ROLE_STATUS_CONFIG[role.status];
            const parentTitle = role.parent_role_id
              ? roleById.get(role.parent_role_id)?.role_title ?? null
              : null;
            return (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(role.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left transition-colors hover:border-[var(--teal-tint)] hover:bg-[var(--teal-tint-50)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)] focus-visible:ring-offset-1"
                  aria-label={`Open details for ${role.role_title || "Unnamed role"}`}
                  style={{ paddingLeft: role.parent_role_id ? "1.5rem" : undefined }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {role.role_title || "Unnamed role"}
                      </p>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusCfg.className}`}
                      >
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {role.headcount > 1
                        ? `${role.headcount} people`
                        : "1 person"}
                      {role.monthly_cost_cents != null && role.monthly_cost_cents > 0
                        ? ` · ${formatMinor(role.monthly_cost_cents, currencyCode)}/mo`
                        : ""}
                      {parentTitle ? ` · Reports to: ${parentTitle}` : ""}
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
              ? roleById.get(openRole.parent_role_id)?.role_title ?? null
              : null
          }
          canEdit={canEdit}
          currencyCode={currencyCode}
          onUpdate={(patch) => onUpdate(openRole.id, patch)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

function RoleDetailSheet({
  role,
  parentTitle,
  canEdit,
  currencyCode,
  onUpdate,
  onClose,
}: {
  role: OrgRole;
  parentTitle: string | null;
  canEdit: boolean;
  currencyCode: string;
  onUpdate: (patch: Partial<OrgRole>) => void;
  onClose: () => void;
}) {
  const inputCls =
    "w-full rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <p
              id="role-detail-title"
              className="truncate text-base font-semibold text-[var(--foreground)]"
            >
              {role.role_title || "Unnamed role"}
            </p>
            {parentTitle && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                Reports to: {parentTitle}
              </p>
            )}
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

        <div className="divide-y divide-[var(--border)] px-5 py-2">
          {/* Role title */}
          <div className="py-3">
            <label
              htmlFor="role-title"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Role Title
            </label>
            <input
              id="role-title"
              type="text"
              className={inputCls}
              value={role.role_title ?? ""}
              disabled={!canEdit}
              onChange={(e) => onUpdate({ role_title: e.target.value })}
              placeholder="e.g. Barista, Manager"
            />
          </div>

          {/* Headcount */}
          <div className="py-3">
            <label
              htmlFor="role-headcount"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Headcount
            </label>
            <input
              id="role-headcount"
              type="number"
              min={1}
              className={inputCls}
              value={role.headcount}
              disabled={!canEdit}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n >= 1) onUpdate({ headcount: n });
              }}
            />
          </div>

          {/* Status selector */}
          <div className="py-3">
            <label className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {(["planned", "posted", "interviewing", "hired"] as HiringRoleStatus[]).map(
                (s) => {
                  const cfg = ROLE_STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => onUpdate({ status: s })}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        role.status === s
                          ? cfg.className + " font-semibold"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--teal-tint)] hover:text-[var(--foreground)]"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {cfg.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* Monthly cost (read-only) */}
          {role.monthly_cost_cents != null && role.monthly_cost_cents > 0 && (
            <div className="flex items-start justify-between gap-3 py-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Monthly Cost
              </dt>
              <dd className="text-sm text-[var(--foreground)]">
                {formatMinor(role.monthly_cost_cents, currencyCode)}
              </dd>
            </div>
          )}

          {/* Notes */}
          <div className="py-3">
            <label
              htmlFor="role-notes"
              className="block text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)] mb-1.5"
            >
              Notes
            </label>
            <textarea
              id="role-notes"
              className={inputCls + " resize-none"}
              rows={3}
              value={role.notes ?? ""}
              disabled={!canEdit}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="Notes about this role"
            />
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            Job descriptions, scorecards, and the org chart are on the desktop view.
          </p>
        </div>
      </div>
    </div>
  );
}
