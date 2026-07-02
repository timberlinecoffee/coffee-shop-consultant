"use client";

// TIM-3576: Cover configuration modal — shown before print/export so users
// configure the cover page without needing to scroll past it in the editing view.

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { COVER_TEMPLATES, type CoverTemplateId } from "@/lib/pdf/business-plan/covers";
import { broadcastBpBrandColor } from "@/lib/bp-brand-channel";
import type { CoverSettings } from "./cover-branding-panel";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const PRESET_SWATCHES = ["#155E63", "#1F7A80", "#2563EB", "#EF4444", "#7C3AED"];

const COLOR_PACKS = [
  { id: "coastal",    label: "Coastal",    colors: ["#1F7A80", "#155E63", "#5EADB3", "#E8F4F5"] as const },
  { id: "espresso",   label: "Espresso",   colors: ["#3C1A0E", "#6B2D0F", "#C2794A", "#FBF4EE"] as const },
  { id: "slate",      label: "Slate",      colors: ["#334155", "#1E293B", "#64748B", "#F8FAFC"] as const },
  { id: "ember",      label: "Ember",      colors: ["#C2410C", "#7C2D12", "#F97316", "#FFF7ED"] as const },
  { id: "sage",       label: "Sage",       colors: ["#4A7C59", "#2D5A3D", "#86EFAC", "#F0F7F4"] as const },
  { id: "midnight",   label: "Midnight",   colors: ["#1E3A5F", "#0F2240", "#4A90C4", "#EEF4FF"] as const },
  { id: "berry",      label: "Berry",      colors: ["#6D28D9", "#4C1D95", "#C084FC", "#F5F3FF"] as const },
  { id: "terracotta", label: "Terracotta", colors: ["#B45309", "#78350F", "#FBBF24", "#FFFBEB"] as const },
  { id: "steel",      label: "Steel",      colors: ["#0369A1", "#0C4A6E", "#38BDF8", "#F0F9FF"] as const },
  { id: "mauve",      label: "Mauve",      colors: ["#9D174D", "#701A3D", "#F9A8D4", "#FDF2F8"] as const },
] as const;

const BODY_FONTS = [
  { id: "inter", label: "Inter" },
  { id: "dm-sans", label: "DM Sans" },
  { id: "lato", label: "Lato" },
  { id: "source-serif-4", label: "Source Serif 4" },
  { id: "libre-baskerville", label: "Libre Baskerville" },
  { id: "nunito", label: "Nunito" },
] as const;

type ColorPackId = typeof COLOR_PACKS[number]["id"];

interface Props {
  initialSettings: CoverSettings;
  logoPublicUrl: string | null;
  shopName: string;
  authorFullName: string | null;
  action: "export" | "print";
  onConfirm: () => void;
  onCancel: () => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

export function CoverConfigModal({
  initialSettings,
  logoPublicUrl: initialLogoUrl,
  shopName,
  authorFullName,
  action,
  onConfirm,
  onCancel,
}: Props) {
  const [template, setTemplate] = useState<CoverTemplateId>(initialSettings.template_id);
  const initHex = initialSettings.accent_color ?? "#155E63";
  const [accentColor, setAccentColor] = useState(initHex);
  const [hexInput, setHexInput] = useState(initHex);
  const [hexError, setHexError] = useState(false);
  const [colorPackId, setColorPackId] = useState<ColorPackId | null>(
    (initialSettings.color_pack_id as ColorPackId | null) ?? null,
  );
  const [bodyFont, setBodyFont] = useState(initialSettings.body_font ?? "inter");
  const [tagline, setTagline] = useState(initialSettings.tagline ?? "");
  const [preparedFor, setPreparedFor] = useState(initialSettings.prepared_for ?? "");
  // Pre-populate author_name from Business Profile (full_name) if not already set
  const [authorName, setAuthorName] = useState(
    initialSettings.author_name ?? authorFullName ?? "",
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorPickerRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/business-plan/cover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveStatus("saved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, []);

  // Debounced text saves
  const dTagline = useDebounce(tagline, 300);
  const dPreparedFor = useDebounce(preparedFor, 300);
  const dAuthorName = useDebounce(authorName, 300);
  const lastSavedRef = useRef({ tagline, preparedFor, authorName });
  useEffect(() => {
    const prev = lastSavedRef.current;
    const patch: Record<string, unknown> = {};
    if (dTagline !== prev.tagline) patch.tagline = dTagline || null;
    if (dPreparedFor !== prev.preparedFor) patch.prepared_for = dPreparedFor || null;
    if (dAuthorName !== prev.authorName) patch.author_name = dAuthorName || null;
    if (Object.keys(patch).length > 0) {
      lastSavedRef.current = { tagline: dTagline, preparedFor: dPreparedFor, authorName: dAuthorName };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void save(patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dTagline, dPreparedFor, dAuthorName]);

  const handleTemplateSelect = useCallback(async (id: CoverTemplateId) => {
    setTemplate(id);
    await save({ template_id: id });
  }, [save]);

  const applyColor = useCallback(async (hex: string) => {
    if (!HEX_RE.test(hex)) { setHexError(true); return; }
    setHexError(false);
    setAccentColor(hex);
    setHexInput(hex);
    broadcastBpBrandColor(hex);
    await save({ accent_color: hex, color_pack_id: null });
  }, [save]);

  const applyColorPack = useCallback(async (pack: typeof COLOR_PACKS[number]) => {
    const primary = pack.colors[0];
    setAccentColor(primary);
    setColorPackId(pack.id as ColorPackId);
    setHexInput(primary);
    setHexError(false);
    broadcastBpBrandColor(primary);
    await save({ accent_color: primary, color_pack_id: pack.id });
  }, [save]);

  const handleBodyFontSelect = useCallback(async (id: string) => {
    setBodyFont(id);
    await save({ body_font: id });
  }, [save]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setLogoState("error");
      setLogoError("File too large — max 2 MB");
      return;
    }
    const accepted = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!accepted.includes(file.type)) {
      setLogoState("error");
      setLogoError("Unsupported format — use PNG, JPEG, or SVG");
      return;
    }
    setLogoState("uploading");
    setLogoError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/business-plan/cover/logo", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((j.error as string) ?? "Upload failed. Try again.");
      }
      const preview = URL.createObjectURL(file);
      setLogoUrl(preview);
      setLogoFileName(file.name);
      setLogoState("idle");
      setSaveStatus("saved");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err: unknown) {
      setLogoState("error");
      setLogoError(err instanceof Error ? err.message : "Upload failed. Try again.");
    }
    e.target.value = "";
  }, []);

  const handleLogoRemove = useCallback(async () => {
    try {
      await fetch("/api/business-plan/cover/logo", { method: "DELETE" });
      setLogoUrl(null);
      setLogoFileName(null);
      setLogoState("idle");
      setLogoError(null);
    } catch {
      setLogoState("error");
      setLogoError("Remove failed. Try again.");
    }
  }, []);

  // Derived monogram for template chips
  const shopWords = shopName.toUpperCase().split(/\s+/).filter(Boolean);
  const monogram = shopWords.length >= 2 ? shopWords[0][0] + shopWords[1][0] : shopName.toUpperCase().slice(0, 2);
  const line1 = shopWords[0] ?? shopName.toUpperCase().slice(0, 6);
  const line2 = shopWords.slice(1).join(" ") || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cover-config-title"
    >
      <div className="w-full max-w-xl rounded-xl bg-white shadow-xl border border-[var(--border)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--neutral-cool-150)] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="cover-config-title" className="text-sm font-semibold text-[var(--foreground)]">
              Configure Cover Page
            </h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              Settings are saved automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saved" && (
              <span className="text-[11px] text-[var(--success)]">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-[11px] text-red-500">Could not save</span>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="p-1.5 rounded-lg text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Business name (read-only — comes from plan/concept) */}
          <div>
            <label className="block text-xs text-[var(--gray-medium)] mb-1">Business name</label>
            <div className="w-full h-9 rounded-lg border border-gray-200 bg-[var(--neutral-cool-50)] px-3 text-[12px] text-[var(--muted-foreground)] flex items-center">
              {shopName || "Your Coffee Shop"}
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">From your plan name</p>
          </div>

          {/* Template */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Template</p>
            <div className="grid grid-cols-3 gap-2">
              {COVER_TEMPLATES.map((t) => {
                const active = template === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleTemplateSelect(t.id as CoverTemplateId)}
                    className={`flex flex-col items-center rounded-lg overflow-hidden transition-all ${
                      active
                        ? "border-2 border-[var(--success)]"
                        : "border border-[var(--gray-slate-4)] hover:border-[var(--sage-tint)] hover:shadow-sm"
                    }`}
                  >
                    <div className="w-full pointer-events-none select-none" style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden" }}>
                      {t.id === "editorial" ? (
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
                          <div style={{ flex: "0 0 55%", backgroundColor: accentColor, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 5px", gap: 2 }}>
                            <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2, flexShrink: 0 }}>
                              <span style={{ color: "white", fontSize: 6, fontWeight: 700 }}>{monogram}</span>
                            </div>
                            <p style={{ color: "white", fontSize: 10, fontWeight: 700, textAlign: "center", lineHeight: 1.15, margin: 0 }}>{line1}</p>
                            {line2 && <p style={{ color: "white", fontSize: 8, fontWeight: 600, textAlign: "center", lineHeight: 1.15, margin: 0 }}>{line2}</p>}
                            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 7, textAlign: "center", margin: 0 }}>BUSINESS PLAN</p>
                          </div>
                          <div style={{ flex: 1, backgroundColor: "#fff", padding: "5px 7px" }}>
                            {[1, 2, 3].map((i) => <div key={i} style={{ height: 1.5, backgroundColor: "#e5e7eb", borderRadius: 1, marginBottom: 3, width: i === 3 ? "55%" : i === 2 ? "78%" : "100%" }} />)}
                          </div>
                        </div>
                      ) : t.id === "classic" ? (
                        <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6px" }}>
                          <div style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${accentColor}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4, flexShrink: 0 }}>
                            <span style={{ color: accentColor, fontSize: 6, fontWeight: 700 }}>{monogram}</span>
                          </div>
                          <p style={{ color: accentColor, fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.15, margin: 0 }}>{line1}</p>
                          {line2 && <p style={{ color: accentColor, fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.15, margin: 0, marginBottom: 3 }}>{line2}</p>}
                          <div style={{ width: 24, height: 1.5, backgroundColor: accentColor, marginBottom: 3 }} />
                          <p style={{ color: "#6b7280", fontSize: 7, textAlign: "center", margin: 0 }}>Business Plan</p>
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: accentColor }} />
                        </div>
                      ) : (
                        <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", display: "flex", flexDirection: "row" }}>
                          <div style={{ width: 4, backgroundColor: accentColor, flexShrink: 0 }} />
                          <div style={{ flex: 1, padding: "8px 5px", display: "flex", flexDirection: "column" }}>
                            <p style={{ color: accentColor, fontSize: 11, fontWeight: 700, lineHeight: 1.15, margin: 0 }}>{line1}</p>
                            {line2 && <p style={{ color: accentColor, fontSize: 9, fontWeight: 600, lineHeight: 1.15, margin: 0, marginBottom: 3 }}>{line2}</p>}
                            <p style={{ color: "#9ca3af", fontSize: 7, margin: 0, marginBottom: 3 }}>Business Plan</p>
                            <div style={{ width: "100%", height: 1.5, backgroundColor: accentColor }} />
                            <div style={{ flex: 1 }} />
                            <div style={{ width: 14, height: 14, borderRadius: 2, backgroundColor: accentColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ color: "white", fontSize: 6, fontWeight: 700 }}>{monogram}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <span className={`text-[11px] py-1 ${active ? "text-[var(--success)] font-semibold" : "text-[var(--gray-slate)]"}`}>
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent color */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Accent color</p>
            <div className="grid grid-cols-5 gap-1 mb-3">
              {COLOR_PACKS.map((pack) => {
                const packActive = colorPackId === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => applyColorPack(pack)}
                    className={`flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg border transition-all ${
                      packActive
                        ? "border-[var(--success)] bg-[var(--teal-bg-faint)]"
                        : "border-[var(--gray-slate-4)] hover:border-[var(--neutral-cool-350)]"
                    }`}
                    title={pack.label}
                  >
                    <div className="flex gap-[2px] flex-shrink-0">
                      {pack.colors.map((c) => (
                        <span key={c} className="w-[8px] h-[8px] rounded-[2px] flex-shrink-0" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <span className={`text-[8px] leading-tight truncate w-full text-center ${packActive ? "text-[var(--success)] font-semibold" : "text-[var(--gray-slate)]"}`}>
                      {pack.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-[var(--gray-medium)] mb-1.5">Or custom</p>
            <div className="flex items-center gap-2">
              {PRESET_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => applyColor(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-5 h-5 rounded flex-shrink-0 transition-all ring-1 ring-[#efefef] ${
                    accentColor.toLowerCase() === hex.toLowerCase()
                      ? "ring-2 ring-offset-1 ring-[var(--gray-slate-2)]"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`Select color ${hex}`}
                />
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => colorPickerRef.current?.click()}
                  style={{ backgroundColor: accentColor }}
                  className="w-5 h-5 rounded border border-dashed border-[#d0d0d0] flex-shrink-0"
                  title="Custom color"
                />
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={accentColor}
                  onChange={(e) => { setAccentColor(e.target.value); setHexInput(e.target.value); }}
                  onBlur={() => applyColor(accentColor)}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                />
              </div>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => { setHexInput(e.target.value); setHexError(false); }}
                onBlur={() => applyColor(hexInput)}
                maxLength={7}
                className={`w-20 h-7 rounded-md border text-[11px] px-2 font-mono ${
                  hexError ? "border-red-300" : "border-gray-200 focus:border-[var(--success)]"
                } focus-visible:outline-none focus:border-2`}
                placeholder="#155E63"
              />
            </div>
            {hexError && <p className="text-[11px] text-[var(--error-secondary)] mt-1">Enter a valid hex color</p>}
          </div>

          {/* Body font */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Body font</p>
            <select
              value={bodyFont}
              onChange={(e) => handleBodyFontSelect(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[12px] text-[var(--gray-slate-2)] focus-visible:outline-none focus:border-2 focus:border-[var(--success)] bg-white"
            >
              {BODY_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Logo */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Logo</p>
            {logoState === "uploading" ? (
              <div className="w-full h-16 rounded-lg bg-gray-50 flex items-center justify-center border border-dashed border-gray-300">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
              </div>
            ) : logoUrl ? (
              <>
                <div className="w-full h-16 rounded-lg border border-dashed border-[#d0d0d0] flex items-center justify-center bg-[#fafafa]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo preview" className="max-h-[48px] object-contain" />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-[var(--gray-medium)] truncate max-w-[80%]">
                    {logoFileName ?? "logo"}
                  </span>
                  <button type="button" onClick={handleLogoRemove} className="text-[11px] text-[var(--error-secondary)] hover:underline ml-2">
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 hover:border-[var(--success)] hover:bg-gray-50 transition-colors"
              >
                <span className="text-[12px] text-[var(--gray-slate-3)]">Upload logo</span>
                <span className="text-[10px] text-[var(--gray-slate-3)]">PNG, JPEG, SVG — max 2 MB</span>
              </button>
            )}
            {logoError && <p className="text-[11px] text-[var(--error-secondary)] mt-1">{logoError}</p>}
            <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={handleFileChange} className="hidden" />
          </div>

          {/* Text fields */}
          <div className="space-y-3">
            {([
              { label: "Tagline", placeholder: "A short description of your business", value: tagline, onChange: setTagline },
              { label: "Prepared for", placeholder: "Investor or bank name (optional)", value: preparedFor, onChange: setPreparedFor },
              { label: "Prepared by", placeholder: "Your name", value: authorName, onChange: setAuthorName, hint: !initialSettings.author_name && authorFullName ? `Pre-filled from your profile` : undefined },
            ] as { label: string; placeholder: string; value: string; onChange: (v: string) => void; hint?: string }[]).map((field) => (
              <div key={field.label}>
                <label className="block text-xs text-[var(--gray-medium)] mb-1">{field.label}</label>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[12px] text-[var(--gray-slate-2)] placeholder:text-[var(--gray-slate-3)] focus-visible:outline-none focus:border-2 focus:border-[var(--success)]"
                />
                {field.hint && (
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{field.hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* TODO TIM-3575: when section archive lands, filter active-only sections on export. */}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--neutral-cool-150)] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-[var(--neutral-cool-300)] text-sm text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-850)] transition-colors"
          >
            {action === "print" ? "Continue to Print" : "Continue to Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
