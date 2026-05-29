"use client";

// TIM-1225: "Cover & Branding" panel for the Business Plan workspace.
// TIM-1314: v2 cohesion — new default accent, body font picker, RGB/CMYK entry, platform-aligned styles.

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
  body_font: string | null;
}

interface Props {
  initialSettings: CoverSettings;
  logoPublicUrl: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_ACCENT = "#1F7A80";
const PRESET_SWATCHES = ["#1F7A80", "#155e63", "#2563EB", "#DC2626", "#E8C24A"];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const BODY_FONTS = [
  { id: "inter", label: "Inter", description: "Clean and easy to read" },
  { id: "dm-sans", label: "DM Sans", description: "Modern, startup feel" },
  { id: "lato", label: "Lato", description: "Warm and approachable" },
  { id: "source-serif-4", label: "Source Serif 4", description: "Editorial, investor-ready" },
  { id: "libre-baskerville", label: "Libre Baskerville", description: "Classic, established feel" },
  { id: "nunito", label: "Nunito", description: "Friendly, community feel" },
] as const;

type ColorMode = "hex" | "rgb" | "cmyk";

// ── Color converters ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");
}

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255;
  const k = 1 - Math.max(r1, g1, b1);
  if (k >= 1) return [0, 0, 0, 100];
  const inv = 1 - k;
  return [
    Math.round(((1 - r1 - k) / inv) * 100),
    Math.round(((1 - g1 - k) / inv) * 100),
    Math.round(((1 - b1 - k) / inv) * 100),
    Math.round(k * 100),
  ];
}

function cmykToHex(c: number, m: number, y: number, k: number): string {
  const r = 255 * (1 - c / 100) * (1 - k / 100);
  const g = 255 * (1 - m / 100) * (1 - k / 100);
  const b = 255 * (1 - y / 100) * (1 - k / 100);
  return rgbToHex(r, g, b);
}

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
  const [accentColor, setAccentColor] = useState(initialSettings.accent_color ?? DEFAULT_ACCENT);
  const [hexInput, setHexInput] = useState(initialSettings.accent_color ?? DEFAULT_ACCENT);
  const [hexError, setHexError] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("hex");
  const [rgbInputs, setRgbInputs] = useState<[string, string, string]>(() => {
    const [r, g, b] = hexToRgb(initialSettings.accent_color ?? DEFAULT_ACCENT);
    return [String(r), String(g), String(b)];
  });
  const [cmykInputs, setCmykInputs] = useState<[string, string, string, string]>(() => {
    const [r, g, b] = hexToRgb(initialSettings.accent_color ?? DEFAULT_ACCENT);
    const [c, m, y, k] = rgbToCmyk(r, g, b);
    return [String(c), String(m), String(y), String(k)];
  });

  const [bodyFont, setBodyFont] = useState(initialSettings.body_font ?? "inter");
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

  // ── Save helper ────────────────────────────────────────────────────────────

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

  // ── Debounced text saves ───────────────────────────────────────────────────

  const debouncedTagline = useDebounce(tagline, 300);
  const debouncedPreparedFor = useDebounce(preparedFor, 300);
  const debouncedAuthorName = useDebounce(authorName, 300);
  const lastSavedRef = useRef({ tagline, preparedFor, authorName });

  useEffect(() => {
    const prev = lastSavedRef.current;
    const patch: Record<string, unknown> = {};
    if (debouncedTagline !== prev.tagline) patch.tagline = debouncedTagline || null;
    if (debouncedPreparedFor !== prev.preparedFor) patch.prepared_for = debouncedPreparedFor || null;
    if (debouncedAuthorName !== prev.authorName) patch.author_name = debouncedAuthorName || null;
    if (Object.keys(patch).length > 0) {
      lastSavedRef.current = { tagline: debouncedTagline, preparedFor: debouncedPreparedFor, authorName: debouncedAuthorName };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void save(patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTagline, debouncedPreparedFor, debouncedAuthorName]);

  // ── Template select ────────────────────────────────────────────────────────

  const handleTemplateSelect = useCallback(async (id: CoverTemplateId) => {
    setTemplate(id);
    await save({ template_id: id });
  }, [save]);

  // ── Accent color ───────────────────────────────────────────────────────────

  const syncDerivedInputs = useCallback((hex: string) => {
    setHexInput(hex);
    const [r, g, b] = hexToRgb(hex);
    setRgbInputs([String(r), String(g), String(b)]);
    setCmykInputs(rgbToCmyk(r, g, b).map(String) as [string, string, string, string]);
  }, []);

  const applyColor = useCallback(async (hex: string) => {
    if (!HEX_RE.test(hex)) { setHexError(true); return; }
    setHexError(false);
    setAccentColor(hex);
    syncDerivedInputs(hex);
    await save({ accent_color: hex });
  }, [save, syncDerivedInputs]);

  const handleSwatchClick = useCallback((hex: string) => {
    applyColor(hex);
  }, [applyColor]);

  const handleHexBlur = useCallback(() => {
    applyColor(hexInput);
  }, [hexInput, applyColor]);

  const handleColorPickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setAccentColor(hex);
    syncDerivedInputs(hex);
  }, [syncDerivedInputs]);

  const handleColorPickerBlur = useCallback(() => {
    applyColor(accentColor);
  }, [accentColor, applyColor]);

  const handleRgbBlur = useCallback(() => {
    const r = Math.max(0, Math.min(255, parseInt(rgbInputs[0]) || 0));
    const g = Math.max(0, Math.min(255, parseInt(rgbInputs[1]) || 0));
    const b = Math.max(0, Math.min(255, parseInt(rgbInputs[2]) || 0));
    setRgbInputs([String(r), String(g), String(b)]);
    applyColor(rgbToHex(r, g, b));
  }, [rgbInputs, applyColor]);

  const handleCmykBlur = useCallback(() => {
    const c = Math.max(0, Math.min(100, parseInt(cmykInputs[0]) || 0));
    const m = Math.max(0, Math.min(100, parseInt(cmykInputs[1]) || 0));
    const y = Math.max(0, Math.min(100, parseInt(cmykInputs[2]) || 0));
    const k = Math.max(0, Math.min(100, parseInt(cmykInputs[3]) || 0));
    setCmykInputs([String(c), String(m), String(y), String(k)]);
    applyColor(cmykToHex(c, m, y, k));
  }, [cmykInputs, applyColor]);

  // ── Body font ──────────────────────────────────────────────────────────────

  const handleBodyFontSelect = useCallback(async (id: string) => {
    setBodyFont(id);
    await save({ body_font: id });
  }, [save]);

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
    <div className="rounded-xl border border-[#efefef] bg-white mb-6">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 h-12 hover:bg-[#fafafa] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[#1a1a1a]">Cover &amp; Branding</span>
          {saveStatus === "saved" && (
            <span className="text-[11px] text-[#155e63]">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-[11px] text-red-500">Changes could not be saved</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-[#6b6b6b]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#6b6b6b]" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#efefef] px-5 py-4 space-y-5">
          {/* Template picker */}
          <div>
            <p className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">Template</p>
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
                        ? "border-2 border-[#155e63]"
                        : "border border-[#efefef] hover:border-[#6b9e7e] hover:shadow-sm"
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
                        active ? "text-[#155e63] font-semibold" : "text-[#374151]"
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
            <p className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">Accent color</p>

            {/* Preset swatches (de-emphasized) */}
            <div className="flex items-center gap-1.5 mb-3">
              {PRESET_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handleSwatchClick(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-8 h-8 rounded-md flex-shrink-0 transition-all ring-1 ring-[#efefef] ${
                    accentColor.toLowerCase() === hex.toLowerCase()
                      ? "ring-2 ring-[#155e63]"
                      : "hover:ring-2 hover:ring-[#d0d0d0]"
                  }`}
                  aria-label={`Select color ${hex}`}
                />
              ))}

              {/* Native color picker trigger */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => colorPickerRef.current?.click()}
                  style={{ backgroundColor: accentColor }}
                  className={`w-8 h-8 rounded-md border-2 border-dashed border-[#d0d0d0] flex-shrink-0 ring-1 ring-[#efefef] ${
                    !PRESET_SWATCHES.some((h) => h.toLowerCase() === accentColor.toLowerCase())
                      ? "ring-2 ring-[#155e63]"
                      : "hover:ring-2 hover:ring-[#d0d0d0]"
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
            </div>

            {/* Color entry mode switcher */}
            <div className="flex items-center gap-0 mb-2 border border-[#efefef] rounded-md w-fit">
              {(["hex", "rgb", "cmyk"] as ColorMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setColorMode(mode)}
                  className={`px-3 py-1 text-[11px] font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                    colorMode === mode
                      ? "bg-[#155e63] text-white"
                      : "text-[#6b6b6b] hover:text-[#1a1a1a]"
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Entry inputs by mode */}
            {colorMode === "hex" && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => { setHexInput(e.target.value); setHexError(false); }}
                  onBlur={handleHexBlur}
                  maxLength={7}
                  className={`w-24 h-8 rounded-md border text-[11px] px-2 font-mono tabular-nums text-[#1a1a1a] ${
                    hexError ? "border-red-300 focus:border-red-400" : "border-[#d8d8d8] focus:border-[#155e63]"
                  } focus:outline-none focus:border-2`}
                  placeholder={DEFAULT_ACCENT}
                />
                {hexError && (
                  <span className="text-[11px] text-red-500">Enter a valid hex color</span>
                )}
              </div>
            )}

            {colorMode === "rgb" && (
              <div className="flex items-center gap-1.5">
                {(["R", "G", "B"] as const).map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={rgbInputs[i]}
                      onChange={(e) => {
                        const next = [...rgbInputs] as [string, string, string];
                        next[i] = e.target.value;
                        setRgbInputs(next);
                      }}
                      onBlur={handleRgbBlur}
                      className="w-14 h-8 rounded-md border border-[#d8d8d8] text-[11px] px-2 font-mono tabular-nums text-[#1a1a1a] focus:outline-none focus:border-2 focus:border-[#155e63]"
                    />
                    <span className="text-[10px] text-[#6b6b6b]">{label}</span>
                  </div>
                ))}
              </div>
            )}

            {colorMode === "cmyk" && (
              <div className="flex items-center gap-1.5">
                {(["C", "M", "Y", "K"] as const).map((label, i) => (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={cmykInputs[i]}
                      onChange={(e) => {
                        const next = [...cmykInputs] as [string, string, string, string];
                        next[i] = e.target.value;
                        setCmykInputs(next);
                      }}
                      onBlur={handleCmykBlur}
                      className="w-12 h-8 rounded-md border border-[#d8d8d8] text-[11px] px-2 font-mono tabular-nums text-[#1a1a1a] focus:outline-none focus:border-2 focus:border-[#155e63]"
                    />
                    <span className="text-[10px] text-[#6b6b6b]">{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Body font picker */}
          <div>
            <p className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">Body Font</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BODY_FONTS.map((font) => {
                const active = bodyFont === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => handleBodyFontSelect(font.id)}
                    className={`text-left px-3 py-2 rounded-lg border transition-all ${
                      active
                        ? "border-[#155e63] bg-[#f0faf9]"
                        : "border-[#efefef] hover:border-[#d0d0d0]"
                    }`}
                  >
                    <p className={`text-[12px] font-medium ${active ? "text-[#155e63]" : "text-[#1a1a1a]"}`}>
                      {font.label}
                    </p>
                    <p className="text-[11px] text-[#6b6b6b] mt-0.5">{font.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Logo upload */}
          <div>
            <p className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-2">Logo</p>

            {logoState === "uploading" ? (
              <div className="w-full h-20 rounded-lg bg-[#fafafa] flex items-center justify-center relative overflow-hidden border border-dashed border-[#d0d0d0]">
                <span className="text-[12px] text-[#6b6b6b]">Uploading...</span>
                <div className="absolute bottom-0 left-0 h-1 bg-[#155e63] animate-pulse w-full" />
              </div>
            ) : logoUrl ? (
              <>
                <div
                  className={`w-full h-20 rounded-lg border border-dashed ${
                    logoState === "error" ? "border-red-300" : "border-[#d0d0d0]"
                  } flex items-center justify-center bg-[#fafafa]`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo preview" className="max-h-[60px] object-contain" />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-[#6b6b6b] truncate max-w-[80%]">
                    {logoFileName ?? "logo"}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="text-[11px] text-[#EF4444] hover:underline ml-2"
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
                    : "border-[#d0d0d0] hover:border-[#155e63] hover:bg-[#fafafa]"
                }`}
              >
                <span className="text-[12px] text-[#9CA3AF]">Upload logo</span>
                <span className="text-[10px] text-[#9CA3AF]">PNG, JPEG, SVG — max 2 MB</span>
              </button>
            )}

            {logoError && (
              <p className="text-[11px] text-[#EF4444] mt-1">{logoError}</p>
            )}

            {showEditorialWarning && (
              <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 px-3">
                <p className="text-[11px] text-[#92400E]">
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
                <label className="block text-xs font-semibold text-[#6b6b6b] uppercase tracking-wide mb-1">{field.label}</label>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full h-9 rounded-xl border border-[#d8d8d8] px-3 text-sm text-[#1a1a1a] placeholder:text-[#afafaf] focus:outline-none focus:ring-1 focus:ring-[#155e63]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
