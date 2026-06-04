"use client";

// TIM-2254: Account Settings "Download my data" + "Delete my account" controls.
//
// Style-guide consulted: Cards · Destructive variant; Buttons · Primary +
// Outline (TIM-1537 style guide). Voice Mandate copy (no em dashes / banned
// adjectives).
// Visual reference: src/components/account/LocalizationSettingsCard.tsx
// (Account Settings card pattern: bg-white rounded-2xl border --border p-6
// with the same heading + body type tokens used by the existing Subscription
// and Delete Account cards on src/app/account/page.tsx).
//
// Both controls call server routes that:
//   1. re-check JWT and rate-limit per Standing Rule §4.
//   2. on success show a confirmation toast and (delete) redirect to /login.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userEmail: string;
  variant?: "stacked-card" | "tab";
};

export function AccountDataControls({ userEmail, variant = "stacked-card" }: Props) {
  const router = useRouter();
  const [exportPending, setExportPending] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "ok" | "err">("idle");
  const [exportMessage, setExportMessage] = useState<string>("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");

  async function handleExport() {
    setExportPending(true);
    setExportStatus("idle");
    setExportMessage("");
    try {
      const res = await fetch("/api/account/export-request", { method: "POST" });
      if (res.status === 202) {
        setExportStatus("ok");
        setExportMessage(`We will email a download link to ${userEmail}.`);
      } else if (res.status === 429) {
        setExportStatus("err");
        setExportMessage("You have requested too many exports. Try again tomorrow.");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setExportStatus("err");
        setExportMessage(data?.error ?? "Could not start your export.");
      }
    } catch {
      setExportStatus("err");
      setExportMessage("Network error. Try again.");
    } finally {
      setExportPending(false);
    }
  }

  async function handleDelete() {
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      if (res.status === 204) {
        router.push("/login?account_deleted=1");
        return;
      }
      if (res.status === 429) {
        setDeleteError("Too many attempts. Try again tomorrow.");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDeleteError(data?.error ?? "Could not delete your account.");
      }
    } catch {
      setDeleteError("Network error. Try again.");
    } finally {
      setDeletePending(false);
    }
  }

  // Card / heading tokens match the existing Account Settings cards so both
  // variants (stacked page + tabbed shell) share the same visual chrome.
  const cardCls =
    variant === "stacked-card"
      ? "bg-white rounded-2xl border border-[var(--border)] p-6"
      : "bg-white rounded-2xl border border-[var(--border)] p-6";

  return (
    <>
      <div className={cardCls} data-testid="account-data-card">
        <h2 className="font-semibold text-[var(--foreground)] mb-4">Your Data</h2>
        <p className="text-sm text-[var(--dark-grey)] mb-4">
          Download a copy of your Groundwork data, or permanently delete your account.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exportPending}
            className="text-sm text-[var(--foreground)] border border-[var(--border)] px-4 py-2 rounded-xl hover:bg-[var(--muted)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="download-data-button"
          >
            {exportPending ? "Preparing export..." : "Download my data"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteOpen(true);
              setDeleteError(null);
              setConfirmation("");
            }}
            className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors"
            data-testid="delete-account-button"
          >
            Delete my account
          </button>
        </div>
        {exportStatus !== "idle" && exportMessage ? (
          <p
            className={`mt-3 text-xs ${
              exportStatus === "ok" ? "text-[var(--dark-grey)]" : "text-red-600"
            }`}
            role="status"
          >
            {exportMessage}
          </p>
        ) : null}
      </div>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="bg-white rounded-2xl border border-[var(--border)] p-6 w-full max-w-md">
            <h3
              id="delete-account-title"
              className="font-semibold text-[var(--foreground)] mb-2"
            >
              Delete your account
            </h3>
            <p className="text-sm text-[var(--dark-grey)] mb-4">
              This removes your plan content, AI conversations, and uploaded files.
              Past invoices are kept for seven years to meet legal requirements.
              This cannot be undone.
            </p>
            <label className="block mb-4">
              <span className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Type <span className="font-mono">{userEmail}</span> to confirm
              </span>
              <input
                type="email"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={userEmail}
                className="w-full border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-neutral-950 placeholder:text-neutral-300 focus-visible:outline-none focus:border-teal transition-colors"
                data-testid="delete-confirmation-input"
              />
            </label>
            {deleteError ? (
              <p className="text-xs text-red-600 mb-3" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deletePending}
                className="text-sm text-[var(--foreground)] border border-[var(--border)] px-4 py-2 rounded-xl hover:bg-[var(--muted)] transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  deletePending ||
                  confirmation.trim().toLowerCase() !== userEmail.trim().toLowerCase()
                }
                className="text-sm text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                data-testid="delete-confirm-button"
              >
                {deletePending ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
