"use client";

// TIM-1225: "Cover & Branding" panel for the Business Plan workspace.
// Design spec: TIM-1224. Placed above the section list.

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import { COVER_TEMPLATES, type CoverTemplateId } from "@/lib/pdf/business-plan/covers";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CoverSettings {
  template_id: CoverTemplateId;
  accent_color: string | null;
  logo_path: string | null;
  tagline: string | null;
  prepared_for: string | null;
  author_name: string | null;
}

interface Props {
  initialSettings: CoverSettings;
  logoPublicUrl: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRESET_SWATCHES = ["var(--warning-amber)", "var(--success)", "var(--blue)", "var(--destructive)", "var(--purple)"];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// ── Helpers ────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export function CoverBrandingPanel({ initialSettings, logoPublicUrl: initialLogoUrl }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [template, setTemplate] = useState<CoverTemplateId>(initialSettings.template_id);
  const [accentColor, setAccentColor] = useState(initialSettings.accent_color ?? "var(--warning-amber)");
  const [hexInput, setHexInput] = useState(initialSettings.accent_color ?? "var(--warning-amber)");
  const [hexError, setHexError] = useState(false);
  const [tagline, setTagline] = useState(initialSettings.tagline ?? "");
  const [preparedFor, setPreparedFor] = useState(initialSettings.prepared_for ?? "");
  const [authorName, setAuthorName] = useState(initialSettings.author_name ?? "");

  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colorPickerRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-save on field blur ────────────────────────────────────────────────

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

  // Debounced save for text inputs
  const debouncedTagline = useDebounce(tagline, 300);
  const debouncedPreparedFor = useDebounce(preparedFor, 300);
  const debouncedAuthorName = useDebounce(authorName, 300);

  const lastSavedRef = useRef({ tagline: tagline, preparedFor: preparedFor, authorName: authorName });

  useEffect(() => {
    const prev = lastSavedRef.current;
    const patch: Record<string, unknown> = {};
    if (debouncedTagline !== prev.tagline) patch.tagline = debouncedTagline || null;
    if (debouncedPreparedFor !== prev.preparedFor) patch.prepared_for = debouncedPreparedFor || null;
    if (debouncedAuthorName !== prev.authorName) patch.author_name = debouncedAuthorName || null;
    if (Object.keys(patch).length > 0) {
      lastSavedRef.current = { tagline: debouncedTagline, preparedFor: debouncedPreparedFor, authorName: debouncedAuthorName };
      save(patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTagline, debouncedPreparedFor, debouncedAuthorName]);

  // ── Template select ────────────────────────────────────────────────────────

  const handleTemplateSelect = useCallback(async (id: CoverTemplateId) => {
    setTemplate(id);
    await save({ template_id: id });
  }, [save]);

  // ── Accent color ───────────────────────────────────────────────────────────

  const applyColor = useCallback(async (hex: string) => {
    if (!HEX_RE.test(hex)) { setHexError(true); return; }
    setHexError(false);
    setAccentColor(hex);
    setHexInput(hex);
    await save({ accent_color: hex });
  }, [save]);

  const handleSwatchClick = useCallback((hex: string) => {
    applyColor(hex);
  }, [applyColor]);

  const handleHexBlur = useCallback(() => {
    applyColor(hexInput);
  }, [hexInput, applyColor]);

  const handleColorPickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setAccentColor(hex);
    setHexInput(hex);
  }, []);

  const handleColorPickerBlur = useCallback(() => {
    applyColor(accentColor);
  }, [accentColor, applyColor]);

  // ── Logo upload ────────────────────────────────────────────────────────────

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

    // Reset input so same file can be re-selected after removal.
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
      setLogoError("Upload failed. Try again.");
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const showEditorialWarning = template === "editorial" && !!logoUrl;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm mb-6">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 h-12 hover:bg-gray-50 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--gray-slate-2)]">Cover &amp; Branding</span>
          {saveStatus === "saved" && (
            <span className="text-[11px] text-[var(--success)]">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-[11px] text-red-500">Changes could not be saved</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--gray-medium)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--gray-medium)]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[var(--gray-slate-5)] px-5 py-4 space-y-5">
          {/* Template picker */}
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
                    <div className="w-full" style={{ aspectRatio: "3/4", position: "relative" }}>
                      <Image
                        src={`/images/business-plan-covers/thumbnail-${t.id}.png`}
                        alt={t.label}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <span
                      className={`text-[11px] py-1 ${
                        active ? "text-[var(--success)] font-semibold" : "text-[var(--gray-slate)]"
                      }`}
                    >
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
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handleSwatchClick(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-7 h-7 rounded-full flex-shrink-0 transition-all ${
                    accentColor.toLowerCase() === hex.toLowerCase()
                      ? "ring-2 ring-offset-1 ring-[var(--gray-slate-2)]"
                      : ""
                  }`}
                  aria-label={`Select color ${hex}`}
                />
              ))}

              {/* Custom color swatch */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => colorPickerRef.current?.click()}
                  style={{ backgroundColor: accentColor }}
                  className={`w-7 h-7 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0 ${
                    !PRESET_SWATCHES.some((h) => h.toLowerCase() === accentColor.toLowerCase())
                      ? "ring-2 ring-offset-1 ring-[var(--gray-slate-2)]"
                      : ""
                  }`}
                  title="Custom color"
                />
                <input
                  ref={colorPickerRef}
                  type="color"
                  value={accentColor}
                  onChange={handleColorPickerChange}
                  onBlur={handleColorPickerBlur}
                  className="absolute opacity-0 w-0 h-0 pointer-events-none"
                />
              </div>

              {/* Hex input */}
              <input
                type="text"
                value={hexInput}
                onChange={(e) => { setHexInput(e.target.value); setHexError(false); }}
                onBlur={handleHexBlur}
                maxLength={7}
                className={`w-20 h-8 rounded-md border text-[12px] px-2 font-mono ${
                  hexError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[var(--success)]"
                } focus:outline-none focus:border-2`}
                placeholder="var(--warning-amber)"
              />
            </div>
            {hexError && (
              <p className="text-[11px] text-[var(--error-secondary)] mt-1">Enter a valid hex color</p>
            )}
          </div>

          {/* Logo upload */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Logo</p>

            {logoState === "uploading" ? (
              <div className="w-full h-20 rounded-lg bg-gray-50 flex items-center justify-center relative overflow-hidden border border-dashed border-gray-300">
                <span className="text-[12px] text-[var(--gray-medium)]">Uploading...</span>
                <div className="absolute bottom-0 left-0 h-1 bg-[var(--success)] animate-pulse w-full" />
              </div>
            ) : logoUrl ? (
              <>
                <div
                  className={`w-full h-20 rounded-lg border border-dashed ${
                    logoState === "error" ? "border-red-300" : "border-gray-300"
                  } flex items-center justify-center bg-gray-50`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo preview" className="max-h-[60px] object-contain" />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-[var(--gray-medium)] truncate max-w-[80%]">
                    {logoFileName ?? "logo"}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="text-[11px] text-[var(--error-secondary)] hover:underline ml-2"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                  logoState === "error"
                    ? "border-red-300"
                    : "border-gray-300 hover:border-[var(--success)] hover:bg-gray-50"
                }`}
              >
                <span className="text-[12px] text-[var(--gray-slate-3)]">Upload logo</span>
                <span className="text-[10px] text-[var(--gray-slate-3)]">PNG, JPEG, SVG — max 2 MB</span>
              </button>
            )}

            {logoError && (
              <p className="text-[11px] text-[var(--error-secondary)] mt-1">{logoError}</p>
            )}

            {showEditorialWarning && (
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 px-3">
                <p className="text-[11px] text-[var(--warning-darker)]">
                  This template places your logo on a dark background. For best results, use a PNG with a transparent background.
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Optional fields */}
          <div className="space-y-3">
            {(
              [
                { label: "Tagline", placeholder: "A short description of your business", value: tagline, onChange: setTagline },
                { label: "Prepared for", placeholder: "Investor or bank name (optional)", value: preparedFor, onChange: setPreparedFor },
                { label: "Your name", placeholder: "Your name (optional)", value: authorName, onChange: setAuthorName },
              ] as { label: string; placeholder: string; value: string; onChange: (v: string) => void }[]
            ).map((field) => (
              <div key={field.label}>
                <label className="block text-xs text-[var(--gray-medium)] mb-1">{field.label}</label>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[12px] text-[var(--gray-slate-2)] placeholder:text-[var(--gray-slate-3)] focus:outline-none focus:border-2 focus:border-[var(--success)]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
