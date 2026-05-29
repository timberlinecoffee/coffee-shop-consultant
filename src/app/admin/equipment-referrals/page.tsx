"use client";

// TIM-1179: Admin UI — equipment referrals CRUD table.
// Accessible only to APP_ADMIN_EMAIL user; the API enforces this too.

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save, X, ExternalLink, ToggleLeft, ToggleRight } from "lucide-react";
import type { EquipmentReferral } from "@/types/referral";

const EMPTY: Omit<EquipmentReferral, "id" | "created_at" | "updated_at"> = {
  brand: "",
  model: "",
  category: "",
  station: "",
  referral_url: "",
  partner_name: "",
  notes: "",
  active_flag: true,
};

type EditState = typeof EMPTY;

export default function EquipmentReferralsAdminPage() {
  const [rows, setRows] = useState<EquipmentReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<EditState>({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/equipment-referrals");
      if (res.status === 401 || res.status === 403) {
        setError("Access denied. This page is for admins only.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((await res.json()) as EquipmentReferral[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function startNew() {
    setDraft({ ...EMPTY });
    setEditingId("new");
    setSaveError(null);
  }

  function startEdit(row: EquipmentReferral) {
    setDraft({
      brand: row.brand,
      model: row.model,
      category: row.category,
      station: row.station,
      referral_url: row.referral_url,
      partner_name: row.partner_name,
      notes: row.notes,
      active_flag: row.active_flag,
    });
    setEditingId(row.id);
    setSaveError(null);
  }

  async function saveRow() {
    setSaving(true);
    setSaveError(null);
    try {
      const isNew = editingId === "new";
      const url = isNew ? "/api/admin/equipment-referrals" : `/api/admin/equipment-referrals/${editingId}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setSaveError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const saved = (await res.json()) as EquipmentReferral;
      if (isNew) {
        setRows((prev) => [...prev, saved].sort((a, b) => a.brand.localeCompare(b.brand)));
      } else {
        setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      }
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Delete this referral? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/equipment-referrals/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) setEditingId(null);
    }
  }

  async function toggleActive(row: EquipmentReferral) {
    const res = await fetch(`/api/admin/equipment-referrals/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_flag: !row.active_flag }),
    });
    if (res.ok) {
      const updated = (await res.json()) as EquipmentReferral;
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
  }

  const fieldCls = "text-xs border border-[var(--neutral-cool-200)] rounded px-2 py-1.5 outline-none focus:border-[var(--teal)] w-full bg-white";

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <p className="text-sm text-[var(--error)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-20">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Equipment Referrals</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Manage affiliate/referral links. Active entries are matched to AI recommendations.
          </p>
        </header>

        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={startNew}
            disabled={editingId === "new"}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--teal)] text-white px-4 py-2 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
          >
            <Plus size={13} />
            Add referral
          </button>
          <span className="text-xs text-[var(--dark-grey)]">{rows.length} referral{rows.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Inline form for new entry */}
        {editingId === "new" && (
          <div className="mb-4 border border-[var(--teal-tint)] rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-[var(--teal)] mb-3">New referral</p>
            <ReferralForm
              draft={draft}
              onChange={setDraft}
              onSave={() => void saveRow()}
              onCancel={() => setEditingId(null)}
              saving={saving}
              error={saveError}
              fieldCls={fieldCls}
            />
          </div>
        )}

        <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[var(--background)] border-b border-[var(--neutral-cool-150)]">
                <th className="px-3 py-2 text-left font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Brand</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Model</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Station</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Partner</th>
                <th className="px-3 py-2 text-left font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Link</th>
                <th className="px-3 py-2 text-center font-semibold text-[var(--muted-foreground)] uppercase tracking-wide text-[10px]">Active</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[var(--dark-grey)] text-xs">
                    No referrals yet. Add one above.
                  </td>
                </tr>
              )}
              {rows.map((row) =>
                editingId === row.id ? (
                  <tr key={row.id} className="border-b border-[var(--neutral-cool-150)] bg-[var(--teal-tint-500)]">
                    <td colSpan={7} className="p-4">
                      <ReferralForm
                        draft={draft}
                        onChange={setDraft}
                        onSave={() => void saveRow()}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                        error={saveError}
                        fieldCls={fieldCls}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={row.id}
                    className={`border-b border-[var(--neutral-cool-150)] hover:bg-[var(--background)] cursor-pointer ${!row.active_flag ? "opacity-50" : ""}`}
                    onClick={() => startEdit(row)}
                  >
                    <td className="px-3 py-2 font-medium text-[var(--foreground)]">{row.brand}</td>
                    <td className="px-3 py-2 text-[var(--foreground)]">{row.model}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{row.station || row.category || "—"}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">{row.partner_name || "—"}</td>
                    <td className="px-3 py-2">
                      <a
                        href={row.referral_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[var(--teal)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={11} />
                        Link
                      </a>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void toggleActive(row); }}
                        className="text-[var(--muted-foreground)] hover:text-[var(--teal)] transition-colors"
                        aria-label={row.active_flag ? "Deactivate" : "Activate"}
                      >
                        {row.active_flag ? <ToggleRight size={16} className="text-[var(--teal)]" /> : <ToggleLeft size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void deleteRow(row.id); }}
                        className="text-[var(--neutral-cool-400)] hover:text-[var(--error)] transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReferralForm({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  fieldCls,
}: {
  draft: EditState;
  onChange: (v: EditState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  fieldCls: string;
}) {
  function set(key: keyof EditState, value: string | boolean) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Brand *</label>
          <input className={fieldCls} value={draft.brand} onChange={(e) => set("brand", e.target.value)} placeholder="e.g. La Marzocco" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Model *</label>
          <input className={fieldCls} value={draft.model} onChange={(e) => set("model", e.target.value)} placeholder="e.g. Linea Mini" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Station</label>
          <input className={fieldCls} value={draft.station} onChange={(e) => set("station", e.target.value)} placeholder="e.g. Espresso Bar" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Partner name</label>
          <input className={fieldCls} value={draft.partner_name} onChange={(e) => set("partner_name", e.target.value)} placeholder="e.g. Whole Latte Love" />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Referral URL *</label>
          <input className={fieldCls} type="url" value={draft.referral_url} onChange={(e) => set("referral_url", e.target.value)} placeholder="https://..." />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">Notes</label>
          <input className={fieldCls} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes" />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active_flag"
            checked={draft.active_flag}
            onChange={(e) => set("active_flag", e.target.checked)}
            className="accent-[var(--teal)]"
          />
          <label htmlFor="active_flag" className="text-xs text-[var(--foreground)] cursor-pointer">Active</label>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !draft.brand.trim() || !draft.model.trim() || !draft.referral_url.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--teal)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-50"
        >
          <Save size={11} />
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] border border-[var(--neutral-cool-200)] px-3 py-1.5 rounded-lg hover:bg-[var(--surface-warm-100)] transition-colors"
        >
          <X size={11} />
          Cancel
        </button>
      </div>
    </div>
  );
}
