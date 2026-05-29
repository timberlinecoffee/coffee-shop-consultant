"use client";

// TIM-1259: Salaries <-> Hiring & Onboarding org-structure sync panel. Rendered
// above the personnel editor on the Salaries tab. The link is opt-in: off by
// default, the two modules stay independent. When on, the owner can pull org
// roles into Salaries and push salary figures back, reviewing each change first
// (nothing is overwritten silently).

import { useEffect, useState } from "react";
import { Link2, Link2Off, ArrowLeftRight, Check, RefreshCw, AlertTriangle } from "lucide-react";
import type { PersonnelLine } from "@/lib/financial-projection";
import { fmt } from "@/lib/financial-projection";
import {
  computeOrgSyncDiff,
  applyOrgToSalaries,
  applySalariesToOrg,
  relinkAfterPush,
  type OrgRole,
} from "@/lib/org-sync";

interface Props {
  personnel: PersonnelLine[];
  enabled: boolean;
  canEdit: boolean;
  currencyCode: string;
  onToggle: (enabled: boolean) => void;
  onPersonnelChange: (next: PersonnelLine[]) => void;
}

const STATUS_LABEL: Record<string, string> = {
  linked_in_sync: "In Sync",
  linked_diff: "Differs",
  org_only: "Org Only",
  salaries_only: "Salaries Only",
};

export function OrgSyncPanel({
  personnel,
  enabled,
  canEdit,
  currencyCode,
  onToggle,
  onPersonnelChange,
}: Props) {
  const [roles, setRoles] = useState<OrgRole[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Lazy-load the org roles the first time the link is on (and on retry). State
  // is only set after the await so the effect never updates state synchronously.
  useEffect(() => {
    if (!enabled || roles !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/workspaces/financials/org-sync");
        if (!res.ok) throw new Error(`load failed (${res.status})`);
        const data = (await res.json()) as { roles: OrgRole[] };
        if (!cancelled) {
          setRoles(data.roles ?? []);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, roles, reloadKey]);

  function retry() {
    setError(false);
    setReloadKey((k) => k + 1);
  }

  const loading = enabled && roles === null && !error;

  // Pull org -> salaries for one role (or all org roles when roleIds omitted).
  function pull(roleIds?: string[]) {
    if (!canEdit || !roles) return;
    const { personnel: next, added, updated } = applyOrgToSalaries(personnel, roles, { roleIds });
    onPersonnelChange(next);
    setMessage(`Pulled from Org Structure: ${added} added, ${updated} updated in Salaries.`);
  }

  // Push salaries -> org for one line (or all lines when lineIds omitted).
  async function push(lineIds?: string[]) {
    if (!canEdit || !roles) return;
    const { upserts } = applySalariesToOrg(personnel, roles, { lineIds });
    if (upserts.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/workspaces/financials/org-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upserts }),
      });
      if (res.status === 402) {
        setMessage("Subscription paused. Reactivate to push changes to the org chart.");
        return;
      }
      if (!res.ok) throw new Error(`push failed (${res.status})`);
      const data = (await res.json()) as { roles: OrgRole[] };
      setRoles(data.roles ?? []);
      // Re-establish org_role_id links for newly created roles so the next sync
      // matches by id, then persist via the model autosave.
      const relinked = relinkAfterPush(personnel, data.roles ?? []);
      onPersonnelChange(relinked);
      setMessage(`Pushed to Org Structure: ${upserts.length} role${upserts.length === 1 ? "" : "s"} updated.`);
    } catch {
      setMessage("Could not push to the org chart. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const diff = enabled && roles ? computeOrgSyncDiff(personnel, roles) : null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {enabled ? (
            <Link2 size={15} className="text-[var(--teal)] mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <Link2Off size={15} className="text-[var(--dark-grey)] mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--teal)]">
              Org Structure Link
            </p>
            <p className="text-[10px] text-[var(--dark-grey)] mt-0.5 max-w-md">
              Connect Salaries with the roles in your Hiring &amp; Onboarding suite. When on, you can
              pull role and headcount changes from the org chart into Salaries, and push salary
              figures back. Changes are reviewed first, never applied silently.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0">
          <span className="text-xs font-medium text-[var(--foreground)]">{enabled ? "Linked" : "Off"}</span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-4 h-4 accent-[var(--teal)]"
            aria-label="Link Salaries with the Hiring and Onboarding org structure"
          />
        </label>
      </div>

      {enabled && (
        <div className="mt-4">
          {loading && (
            <p className="text-xs text-[var(--dark-grey)] py-2">Loading org structure…</p>
          )}
          {error && (
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--error)] bg-[var(--error-bg-4)] rounded-lg px-3 py-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={13} /> Could not load the org structure.
              </span>
              <button
                type="button"
                onClick={retry}
                className="flex items-center gap-1 font-medium text-[var(--teal)]"
              >
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          )}

          {roles && diff && (
            <>
              {diff.rows.length === 0 ? (
                <p className="text-xs text-[var(--dark-grey)] italic py-2">
                  No roles in either module yet. Add roles in Salaries or in the Hiring &amp;
                  Onboarding suite, then sync them here.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      {diff.counts.linked} linked ({diff.counts.diff} differ), {diff.counts.orgOnly} org
                      only, {diff.counts.salariesOnly} salaries only.
                    </p>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => pull()}
                          disabled={busy}
                          className="text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-md disabled:opacity-50"
                          title="Apply every org role to Salaries (name and headcount)"
                        >
                          Pull All From Org
                        </button>
                        <button
                          type="button"
                          onClick={() => void push()}
                          disabled={busy}
                          className="text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2 py-1 rounded-md disabled:opacity-50"
                          title="Write every salary line back to the org chart (headcount and loaded cost)"
                        >
                          Push All To Org
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-[var(--dark-grey)] text-left">
                          <th className="py-1.5 pr-2 font-semibold">Status</th>
                          <th className="py-1.5 pr-2 font-semibold">Org Role</th>
                          <th className="py-1.5 pr-2 font-semibold">Salaries Role</th>
                          <th className="py-1.5 pr-2 font-semibold text-right">Org HC</th>
                          <th className="py-1.5 pr-2 font-semibold text-right">Sal HC</th>
                          <th className="py-1.5 pr-2 font-semibold text-right">Org Cost</th>
                          <th className="py-1.5 pr-2 font-semibold text-right">Loaded Cost</th>
                          <th className="py-1.5 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.rows.map((row) => (
                          <tr key={row.key} className="border-t border-[var(--neutral-cool-100)] align-middle">
                            <td className="py-1.5 pr-2">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  row.status === "linked_in_sync"
                                    ? "bg-[var(--teal-tint-100)] text-[var(--teal)]"
                                    : row.status === "linked_diff"
                                    ? "bg-[var(--warning-bg-11)] text-[var(--warning-text-10)]"
                                    : "bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)]"
                                }`}
                              >
                                {row.status === "linked_in_sync" && <Check size={10} />}
                                {STATUS_LABEL[row.status]}
                              </span>
                            </td>
                            <td className={`py-1.5 pr-2 ${row.nameDiffers ? "font-semibold" : ""}`}>
                              {row.orgName ?? <span className="text-[var(--gray-850)]">-</span>}
                            </td>
                            <td className={`py-1.5 pr-2 ${row.nameDiffers ? "font-semibold" : ""}`}>
                              {row.salariesName ?? <span className="text-[var(--gray-850)]">-</span>}
                            </td>
                            <td
                              className={`py-1.5 pr-2 text-right ${
                                row.headcountDiffers ? "font-semibold text-[var(--warning-text-10)]" : ""
                              }`}
                            >
                              {row.orgHeadcount ?? "-"}
                            </td>
                            <td
                              className={`py-1.5 pr-2 text-right ${
                                row.headcountDiffers ? "font-semibold text-[var(--warning-text-10)]" : ""
                              }`}
                            >
                              {row.salariesHeadcount ?? "-"}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-[var(--muted-foreground)]">
                              {row.orgMonthlyCostCents != null
                                ? fmt(row.orgMonthlyCostCents, currencyCode)
                                : "-"}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-[var(--muted-foreground)]">
                              {row.salariesLoadedMonthlyCents != null
                                ? fmt(row.salariesLoadedMonthlyCents, currencyCode)
                                : "-"}
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              {canEdit && row.status !== "linked_in_sync" && (
                                <span className="inline-flex items-center gap-1">
                                  {(row.status === "org_only" || row.status === "linked_diff") &&
                                    row.roleId && (
                                      <button
                                        type="button"
                                        onClick={() => pull([row.roleId as string])}
                                        disabled={busy}
                                        className="px-1.5 py-0.5 rounded text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:opacity-50"
                                        title="Pull this role into Salaries"
                                      >
                                        Pull
                                      </button>
                                    )}
                                  {(row.status === "salaries_only" || row.status === "linked_diff") &&
                                    row.personnelId && (
                                      <button
                                        type="button"
                                        onClick={() => void push([row.personnelId as string])}
                                        disabled={busy}
                                        className="px-1.5 py-0.5 rounded text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:opacity-50"
                                        title="Push this salary line to the org chart"
                                      >
                                        Push
                                      </button>
                                    )}
                                  {row.status === "linked_diff" && (
                                    <ArrowLeftRight size={11} className="text-[var(--gray-850)]" aria-hidden="true" />
                                  )}
                                </span>
                              )}
                              {row.status === "linked_in_sync" && (
                                <span className="text-[var(--gray-850)]">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {message && <p className="text-[10px] text-[var(--teal)] mt-2">{message}</p>}
              <p className="text-[10px] text-[var(--dark-grey)] mt-2">
                Pulling updates role name and headcount in Salaries (and seeds pay only when a line
                has none). It never changes your benefits, hire month, or pay basis. Pushing writes
                the loaded monthly cost and headcount back to the org chart.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
