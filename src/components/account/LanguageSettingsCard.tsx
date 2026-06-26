"use client";

// TIM-3076: Language preference card — sets preferred_language on the user's
// account. Only AI-generated prose (business plan, copilot, draft generators)
// is rendered in the chosen language. Field names and UI labels stay in English.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUPPORTED_LANGUAGES, type AccountSettings } from "@/lib/account-settings";

const FIELD_CLASS =
  "w-full border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-neutral-950 placeholder:text-neutral-300 focus-visible:outline-none focus:border-teal transition-colors";

export function LanguageSettingsCard({ initial }: { initial: AccountSettings }) {
  const router = useRouter();
  const [lang, setLang] = useState(initial.preferredLanguage ?? "en");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredLanguage: lang }),
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
      <h2 className="font-semibold text-[var(--foreground)] mb-1">AI Output Language</h2>
      <p className="text-sm text-[var(--dark-grey)] mb-4">
        Choose the language for AI-generated content such as your business plan and coaching
        replies. Field names and labels stay in English.
      </p>

      <label className="block">
        <span className="block text-sm font-medium text-neutral-950 mb-1">Language</span>
        <select
          className={FIELD_CLASS}
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

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
          <span className="text-sm text-[var(--error)]">Could not save. Try again.</span>
        ) : null}
      </div>
    </div>
  );
}
