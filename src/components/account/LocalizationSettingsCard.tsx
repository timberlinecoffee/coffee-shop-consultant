"use client";

// TIM-1741: Localization settings card (currency + date/number/timezone/
// fiscal-year). Lives on the existing Account Settings page and matches its
// card pattern (bg-white rounded-xl border p-6, --foreground / --dark-grey
// tokens). Currency is the live headline control; saving updates the
// platform-wide account setting and refreshes server data so every money
// surface re-formats.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CURRENCIES } from "@/lib/currency";
import {
  DATE_FORMATS,
  NUMBER_FORMATS,
  type AccountSettings,
} from "@/lib/account-settings";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FIELD_CLASS =
  "flex h-9 w-full rounded-md border border-[var(--border-medium)] bg-white px-3 py-1 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-[var(--dark-grey)] mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--dark-grey)] mt-1">{hint}</span> : null}
    </label>
  );
}

export function LocalizationSettingsCard({ initial }: { initial: AccountSettings }) {
  const router = useRouter();
  const [currencyCode, setCurrencyCode] = useState(initial.currencyCode);
  const [dateFormat, setDateFormat] = useState(initial.localization.dateFormat);
  const [numberFormat, setNumberFormat] = useState(initial.localization.numberFormat);
  const [timezone, setTimezone] = useState(initial.localization.timezone);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(
    initial.localization.fiscalYearStartMonth
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  const currencyOptions = useMemo(
    () => CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` })),
    []
  );

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currencyCode,
          localization: { dateFormat, numberFormat, timezone, fiscalYearStartMonth },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-6">
      <h2 className="font-semibold text-[var(--foreground)] mb-1">Localization</h2>
      <p className="text-sm text-[var(--dark-grey)] mb-4">
        Set the currency and formats used across your plan, financials, and documents.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Currency" hint="Symbol and number formatting apply everywhere money is shown.">
          <select
            className={FIELD_CLASS}
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            {currencyOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Date format">
          <select
            className={FIELD_CLASS}
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Field>

        <Field label="Number format">
          <select
            className={FIELD_CLASS}
            value={numberFormat}
            onChange={(e) => setNumberFormat(e.target.value as typeof numberFormat)}
          >
            {NUMBER_FORMATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Field>

        <Field label="Fiscal year starts">
          <select
            className={FIELD_CLASS}
            value={fiscalYearStartMonth}
            onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </Field>

        <Field label="Timezone" hint="IANA name, e.g. America/Los_Angeles. Leave blank for system default.">
          <input
            className={FIELD_CLASS}
            value={timezone}
            placeholder="America/Los_Angeles"
            onChange={(e) => setTimezone(e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="text-sm font-medium bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" ? (
          <span className="text-sm text-[var(--teal)]">Saved</span>
        ) : null}
        {status === "error" ? (
          <span className="text-sm text-red-600">Could not save. Try again.</span>
        ) : null}
      </div>
    </div>
  );
}
