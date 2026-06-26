"use client";

// TIM-3152: inline-editable account owner name field.
// Style-guide refs:
//   Cards → Profile card (SettingsShell AccountTabContent)
//   Input fields (LocalizationSettingsCard FIELD_CLASS pattern)
//   Buttons → Primary (bg-[var(--teal)] text-white)
// Visual reference: src/components/account/LocalizationSettingsCard.tsx (save/status pattern)

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";

interface ProfileNameEditorProps {
  initialName: string | null;
}

export function ProfileNameEditor({ initialName }: ProfileNameEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "validation">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setValue(initialName ?? "");
    setStatus("idle");
    setEditing(true);
    // Defer focus until the input is rendered
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancel() {
    setEditing(false);
    setStatus("idle");
  }

  async function save() {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setErrorMsg("Name cannot be empty");
      setStatus("validation");
      return;
    }
    if (trimmed.length > 80) {
      setErrorMsg("Name must be 80 characters or fewer");
      setStatus("validation");
      return;
    }

    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: trimmed }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMsg(json.error ?? "Could not save name");
        setStatus("error");
        return;
      }
      setEditing(false);
      setStatus("saved");
      router.refresh();
    } catch {
      setErrorMsg("Could not save name. Try again.");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setStatus("idle"); }}
            onKeyDown={handleKeyDown}
            maxLength={80}
            aria-label="Account owner name"
            className="flex-1 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-sm font-medium bg-[var(--teal)] text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={cancel}
            aria-label="Cancel editing name"
            className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors p-1"
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {(status === "validation" || status === "error") && (
          <span className="text-xs text-[var(--error)]">{errorMsg}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--foreground)]">
        {initialName ?? "—"}
      </span>
      <button
        onClick={startEditing}
        aria-label="Edit account owner name"
        className="text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors p-0.5"
      >
        <Pencil size={13} strokeWidth={1.75} aria-hidden />
      </button>
      {status === "saved" && (
        <span className="text-xs text-[var(--teal)]">Saved</span>
      )}
    </div>
  );
}
