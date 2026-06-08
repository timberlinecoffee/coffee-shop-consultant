"use client";

// TIM-1942: Admin member detail. Surfaces the 3 board-mandated actions:
// change subscription, manually cancel, trigger password reset. Every action
// goes through /api/admin/members/[id]/* which writes to admin_audit_log.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronLeft, KeyRound, XCircle, ArrowLeftRight } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { WorkspaceActionButton, WORKSPACE_ACTION_ICON_SIZE } from "@/components/workspace/WorkspaceActionButton";
import { TABLE_CELL_TEXT, TABLE_HEADER_TEXT } from "@/lib/workspace-table";
import { AdminSubNav } from "../../_components/AdminSubNav";
import { formatDate, formatUsdCents } from "../../_components/MoneyAndDates";
import type { AdminMemberDetail } from "@/types/admin";

type Toast = { kind: "ok" | "err"; text: string } | null;

export default function AdminMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [member, setMember] = useState<AdminMemberDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [openAction, setOpenAction] = useState<"plan" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/members/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AdminMemberDetail;
        if (!cancelled) setMember(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refreshTick]);

  const reload = () => setRefreshTick((t) => t + 1);

  async function changePlan(tier: "starter" | "pro", interval: "monthly" | "annual", proration: "create_prorations" | "none") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/change-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, interval, proration }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; subscriptionId?: string };
      if (!res.ok) {
        setToast({ kind: "err", text: body.error ?? `HTTP ${res.status}` });
      } else {
        setToast({ kind: "ok", text: `Plan changed to ${tier} ${interval}.` });
        setOpenAction(null);
        reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelAccount(when: "immediate" | "period_end") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ when }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setToast({ kind: "err", text: body.error ?? `HTTP ${res.status}` });
      } else {
        setToast({
          kind: "ok",
          text: when === "immediate" ? "Subscription cancelled immediately." : "Cancel scheduled at period end.",
        });
        setOpenAction(null);
        reload();
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendPasswordReset() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${id}/password-reset`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; sentTo?: string };
      if (!res.ok) {
        setToast({ kind: "err", text: body.error ?? `HTTP ${res.status}` });
      } else {
        setToast({ kind: "ok", text: `Reset link sent to ${body.sentTo}.` });
      }
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <>
        <AdminSubNav active="members" />
        <p className={`${TABLE_CELL_TEXT} text-[var(--error)]`}>{error}</p>
      </>
    );
  }
  if (!member) {
    return (
      <>
        <AdminSubNav active="members" />
        <p className={`${TABLE_CELL_TEXT} text-[var(--muted-foreground)]`}>Loading...</p>
      </>
    );
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/admin/members" className={`${TABLE_CELL_TEXT} text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1`}>
          <ChevronLeft size={13} />
          All members
        </Link>
      </div>
      <WorkspaceHeader
        Icon={Users}
        title={member.full_name ?? member.email}
        description={
          <>
            <span>{member.email}</span> · <span className="capitalize">{member.subscription_status.replace(/_/g, " ")}</span> · <span className="capitalize">{member.subscription_tier}</span>
          </>
        }
        actions={
          <>
            <WorkspaceActionButton variant="secondary" type="button" onClick={() => setOpenAction("plan")} disabled={busy}>
              <ArrowLeftRight size={WORKSPACE_ACTION_ICON_SIZE} />
              Change plan
            </WorkspaceActionButton>
            <WorkspaceActionButton variant="secondary" type="button" onClick={() => setOpenAction("cancel")} disabled={busy}>
              <XCircle size={WORKSPACE_ACTION_ICON_SIZE} />
              Cancel account
            </WorkspaceActionButton>
            <WorkspaceActionButton variant="primary" type="button" onClick={() => void sendPasswordReset()} disabled={busy}>
              <KeyRound size={WORKSPACE_ACTION_ICON_SIZE} />
              Send password reset
            </WorkspaceActionButton>
          </>
        }
      />
      <AdminSubNav active="members" />

      {toast ? (
        <div
          role="status"
          className={`${TABLE_CELL_TEXT} mb-4 rounded-lg px-3 py-2 ${
            toast.kind === "ok"
              ? "bg-[var(--teal)]/10 text-[var(--teal-deep)] border border-[var(--teal)]/30"
              : "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/30"
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <DetailCard label="Plan">
          <p className="capitalize text-[var(--foreground)] font-semibold">{member.subscription_tier}</p>
          <p className="text-[var(--muted-foreground)] capitalize">{member.subscription_status.replace(/_/g, " ")}</p>
          {member.trial_ends_at ? (
            <p className="text-[var(--muted-foreground)] mt-1">Trial ends {formatDate(member.trial_ends_at)}</p>
          ) : null}
        </DetailCard>
        <DetailCard label="Monthly recurring">
          <p className="text-[var(--foreground)] font-semibold">{member.mrr_cents > 0 ? formatUsdCents(member.mrr_cents) : "—"}</p>
          {member.subscription?.current_period_end ? (
            <p className="text-[var(--muted-foreground)]">Renews {formatDate(member.subscription.current_period_end)}</p>
          ) : null}
        </DetailCard>
        <DetailCard label="Usage">
          <p className="text-[var(--foreground)] font-semibold">{member.ai_credits_remaining} credits</p>
          <p className="text-[var(--muted-foreground)]">{member.total_credits_used} used (lifetime)</p>
        </DetailCard>
        <DetailCard label="Signed up">
          <p className="text-[var(--foreground)] font-semibold">{formatDate(member.created_at)}</p>
          {member.signup_source ? (
            <p className="text-[var(--muted-foreground)]">via {member.signup_source}</p>
          ) : null}
        </DetailCard>
        <DetailCard label="Last sign in">
          <p className="text-[var(--foreground)] font-semibold">{formatDate(member.last_sign_in_at)}</p>
        </DetailCard>
        <DetailCard label="Stripe">
          <p className="text-[var(--muted-foreground)] break-all">{member.subscription?.stripe_subscription_id ?? "No subscription"}</p>
        </DetailCard>
      </div>

      {openAction === "plan" && (
        <ChangePlanModal busy={busy} onClose={() => setOpenAction(null)} onSubmit={changePlan} />
      )}
      {openAction === "cancel" && (
        <CancelModal busy={busy} onClose={() => setOpenAction(null)} onSubmit={cancelAccount} />
      )}

      <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden">
        <p className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] px-3 pt-3`}>Recent activity</p>
        <table className={`w-full ${TABLE_CELL_TEXT}`}>
          <thead>
            <tr className="border-b border-[var(--neutral-cool-150)]">
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>When</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Kind</th>
              <th className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] text-left px-3 py-2`}>Description</th>
            </tr>
          </thead>
          <tbody>
            {member.recent_activity.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-[var(--dark-grey)]">
                  No activity yet.
                </td>
              </tr>
            )}
            {member.recent_activity.map((row, idx) => (
              <tr key={idx} className="border-b border-[var(--neutral-cool-150)] last:border-b-0">
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{formatDate(row.at)}</td>
                <td className="px-3 py-2 capitalize">{row.kind.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 text-[var(--muted-foreground)]">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DetailCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-xl p-4">
      <p className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] mb-1`}>{label}</p>
      <div className={TABLE_CELL_TEXT}>{children}</div>
    </div>
  );
}

function ChangePlanModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (tier: "starter" | "pro", interval: "monthly" | "annual", proration: "create_prorations" | "none") => Promise<void>;
}) {
  const [tier, setTier] = useState<"starter" | "pro">("pro");
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [proration, setProration] = useState<"create_prorations" | "none">("create_prorations");
  return (
    <ModalShell title="Change subscription plan" onClose={onClose}>
      <Field label="Tier">
        <select className={selectCls} value={tier} onChange={(e) => setTier(e.target.value as "starter" | "pro")}>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
        </select>
      </Field>
      <Field label="Interval">
        <select className={selectCls} value={interval} onChange={(e) => setInterval(e.target.value as "monthly" | "annual")}>
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
        </select>
      </Field>
      <Field label="Proration">
        <select className={selectCls} value={proration} onChange={(e) => setProration(e.target.value as "create_prorations" | "none")}>
          <option value="create_prorations">Create prorations (default)</option>
          <option value="none">No proration</option>
        </select>
      </Field>
      <ModalActions>
        <WorkspaceActionButton variant="secondary" type="button" onClick={onClose} disabled={busy}>
          Cancel
        </WorkspaceActionButton>
        <WorkspaceActionButton variant="primary" type="button" onClick={() => void onSubmit(tier, interval, proration)} disabled={busy}>
          {busy ? "Updating..." : "Apply change"}
        </WorkspaceActionButton>
      </ModalActions>
    </ModalShell>
  );
}

function CancelModal({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (when: "immediate" | "period_end") => Promise<void>;
}) {
  const [when, setWhen] = useState<"immediate" | "period_end">("period_end");
  return (
    <ModalShell title="Cancel subscription" onClose={onClose}>
      <p className={`${TABLE_CELL_TEXT} text-[var(--muted-foreground)]`}>
        Period-end keeps the member on their current plan until the paid-through date. Immediate ends access right away with no refund.
      </p>
      <Field label="When">
        <select className={selectCls} value={when} onChange={(e) => setWhen(e.target.value as "immediate" | "period_end")}>
          <option value="period_end">At period end (recommended)</option>
          <option value="immediate">Immediate (no refund)</option>
        </select>
      </Field>
      <ModalActions>
        <WorkspaceActionButton variant="secondary" type="button" onClick={onClose} disabled={busy}>
          Keep subscription
        </WorkspaceActionButton>
        <WorkspaceActionButton variant="primary" type="button" onClick={() => void onSubmit(when)} disabled={busy}>
          {busy ? "Cancelling..." : "Confirm cancel"}
        </WorkspaceActionButton>
      </ModalActions>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl border border-[var(--border)] w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={`${TABLE_HEADER_TEXT} text-[var(--muted-foreground)] block mb-1`}>{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 pt-2">{children}</div>;
}

const selectCls = "text-xs border border-[var(--neutral-cool-200)] rounded-lg px-3 py-1.5 outline-none focus:border-[var(--teal)] w-full bg-white";
