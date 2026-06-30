"use client";

// TIM-1225: "Cover & Branding" panel for the Business Plan workspace.
// TIM-1314: v2 cohesion — new default accent, body font picker, RGB/CMYK entry, platform-aligned styles.

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { COVER_TEMPLATES, type CoverTemplateId } from "@/lib/pdf/business-plan/covers";
import { broadcastBpBrandColor } from "@/lib/bp-brand-channel";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CoverSettings {
  template_id: CoverTemplateId;
  accent_color: string | null;
  color_pack_id: string | null;
  logo_path: string | null;
  tagline: string | null;
  prepared_for: string | null;
  author_name: string | null;
  body_font: string | null;
}

interface Props {
  initialSettings: CoverSettings;
  logoPublicUrl: string | null;
  shopName: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

// TIM-3458: dropped off-palette `#2563EB` (blue) and `#7C3AED` (purple) per
// TIM-1537 Style Guide ("off-palette, do not use in product UI"). Brand teal
// `#155E63` is the canonical Groundwork accent — confirmed by board on TIM-3458.
const PRESET_SWATCHES = ["#155E63", "#1F7A80", "#EF4444"];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

// TIM-3507: Template-picker chips render with a fixed brand-teal demo accent so
// the thumbnails communicate "template = layout" rather than "= your saved color."
// Previously the chips reused `accentColor`, which made all three thumbnails look
// identical in color when a user had picked a non-brand hue (board screenshot
// showed all-purple thumbnails). Live preview + saved PDF still use accentColor.
const TEMPLATE_PREVIEW_ACCENT = "#155E63";

// Each pack: [primary, secondary, supporting, neutral]
const COLOR_PACKS = [
  { id: "coastal",    label: "Coastal",    colors: ["#1F7A80", "#155E63", "#5EADB3", "#E8F4F5"] as const, description: "Teal ocean tones, professional" },
  { id: "espresso",   label: "Espresso",   colors: ["#3C1A0E", "#6B2D0F", "#C2794A", "#FBF4EE"] as const, description: "Deep brown warmth, inviting" },
  { id: "slate",      label: "Slate",      colors: ["#334155", "#1E293B", "#64748B", "#F8FAFC"] as const, description: "Blue-gray neutral, refined" },
  { id: "ember",      label: "Ember",      colors: ["#C2410C", "#7C2D12", "#F97316", "#FFF7ED"] as const, description: "Warm orange energy" },
  { id: "sage",       label: "Sage",       colors: ["#4A7C59", "#2D5A3D", "#86EFAC", "#F0F7F4"] as const, description: "Natural green, organic" },
  { id: "midnight",   label: "Midnight",   colors: ["#1E3A5F", "#0F2240", "#4A90C4", "#EEF4FF"] as const, description: "Deep navy, sophisticated" },
  { id: "berry",      label: "Berry",      colors: ["#6D28D9", "#4C1D95", "#C084FC", "#F5F3FF"] as const, description: "Bold purple, creative" },
  { id: "terracotta", label: "Terracotta", colors: ["#B45309", "#78350F", "#FBBF24", "#FFFBEB"] as const, description: "Golden earth tones" },
  { id: "steel",      label: "Steel",      colors: ["#0369A1", "#0C4A6E", "#38BDF8", "#F0F9FF"] as const, description: "Sky blue, modern tech" },
  { id: "mauve",      label: "Mauve",      colors: ["#9D174D", "#701A3D", "#F9A8D4", "#FDF2F8"] as const, description: "Rose, classic and refined" },
] as const;

type ColorPackId = typeof COLOR_PACKS[number]["id"];

// ── Color conversion helpers ───────────────────────────────────────────────────

type ColorMode = "hex" | "rgb" | "cmyk";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!HEX_RE.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const k = 1 - Math.max(rf, gf, bf);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const d = 1 - k;
  return {
    c: Math.round(((1 - rf - k) / d) * 100),
    m: Math.round(((1 - gf - k) / d) * 100),
    y: Math.round(((1 - bf - k) / d) * 100),
    k: Math.round(k * 100),
  };
}

function cmykToRgb(c: number, m: number, y: number, k: number): { r: number; g: number; b: number } {
  const kf = k / 100;
  return {
    r: Math.round(255 * (1 - c / 100) * (1 - kf)),
    g: Math.round(255 * (1 - m / 100) * (1 - kf)),
    b: Math.round(255 * (1 - y / 100) * (1 - kf)),
  };
}

const BODY_FONTS = [
  { id: "inter", label: "Inter", description: "Clean and easy to read" },
  { id: "dm-sans", label: "DM Sans", description: "Modern, startup feel" },
  { id: "lato", label: "Lato", description: "Warm and approachable" },
  { id: "source-serif-4", label: "Source Serif 4", description: "Editorial, investor-ready" },
  { id: "libre-baskerville", label: "Libre Baskerville", description: "Classic, established feel" },
  { id: "nunito", label: "Nunito", description: "Friendly, community feel" },
] as const;

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

export function CoverBrandingPanel({ initialSettings, logoPublicUrl: initialLogoUrl, shopName }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [template, setTemplate] = useState<CoverTemplateId>(initialSettings.template_id);
  const initialHex = initialSettings.accent_color ?? "#155E63";
  const [accentColor, setAccentColor] = useState(initialHex);
  const [hexInput, setHexInput] = useState(initialHex);
  const [hexError, setHexError] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>("hex");
  const _initRgb = hexToRgb(initialHex) ?? { r: 21, g: 94, b: 99 };
  const [rgbInputs, setRgbInputs] = useState(_initRgb);
  const [cmykInputs, setCmykInputs] = useState(rgbToCmyk(_initRgb.r, _initRgb.g, _initRgb.b));

  const [colorPackId, setColorPackId] = useState<ColorPackId | null>(
    (initialSettings.color_pack_id as ColorPackId | null) ?? null
  );

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

  // Derived display values for cover template chips
  const shopNameUpper = shopName.toUpperCase();
  const shopWords = shopNameUpper.split(/\s+/).filter(Boolean);
  const shopMonogram = shopWords.length >= 2
    ? (shopWords[0][0] + shopWords[1][0])
    : shopNameUpper.slice(0, 2);
  const shopLine1 = shopWords[0] ?? shopNameUpper.slice(0, 6);
  const shopLine2 = shopWords.slice(1).join(" ") || null;

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
    const rgb = hexToRgb(hex);
    if (rgb) {
      setRgbInputs(rgb);
      setCmykInputs(rgbToCmyk(rgb.r, rgb.g, rgb.b));
    }
  }, []);

  const applyColor = useCallback(async (hex: string) => {
    if (!HEX_RE.test(hex)) { setHexError(true); return; }
    setHexError(false);
    setAccentColor(hex);
    setColorPackId(null);
    syncDerivedInputs(hex);
    broadcastBpBrandColor(hex);
    await save({ accent_color: hex, color_pack_id: null });
  }, [save, syncDerivedInputs]);

  const applyColorPack = useCallback(async (pack: typeof COLOR_PACKS[number]) => {
    const primary = pack.colors[0];
    setAccentColor(primary);
    setColorPackId(pack.id as ColorPackId);
    syncDerivedInputs(primary);
    setHexError(false);
    broadcastBpBrandColor(primary);
    await save({ accent_color: primary, color_pack_id: pack.id });
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
                    {/* Pure-CSS chip — no placeholder images, per-template layout */}
                    <div className="w-full pointer-events-none select-none" style={{ aspectRatio: "3/4", position: "relative", overflow: "hidden" }}>
                      {t.id === "editorial" ? (
                        /* Editorial: full-bleed colored header (~55%) + white body */
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
                          <div style={{ flex: "0 0 55%", backgroundColor: TEMPLATE_PREVIEW_ACCENT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 5px", gap: 2 }}>
                            {/* Shop monogram badge */}
                            <div style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2, flexShrink: 0 }}>
                              <span style={{ color: "white", fontSize: 7, fontWeight: 700, letterSpacing: "-0.2px" }}>{shopMonogram}</span>
                            </div>
                            <p style={{ color: "white", fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.15, margin: 0 }}>{shopLine1}</p>
                            {shopLine2 && <p style={{ color: "white", fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.15, margin: 0, marginBottom: 1 }}>{shopLine2}</p>}
                            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 7.5, textAlign: "center", lineHeight: 1.2, margin: 0, letterSpacing: "0.5px" }}>BUSINESS PLAN</p>
                          </div>
                          {/* White body with faint content lines */}
                          <div style={{ flex: 1, backgroundColor: "#fff", padding: "5px 7px" }}>
                            <div style={{ height: 1.5, backgroundColor: "#e5e7eb", borderRadius: 1, marginBottom: 3 }} />
                            <div style={{ height: 1.5, backgroundColor: "#e5e7eb", borderRadius: 1, marginBottom: 3, width: "78%" }} />
                            <div style={{ height: 1.5, backgroundColor: "#e5e7eb", borderRadius: 1, width: "55%" }} />
                          </div>
                        </div>
                      ) : t.id === "classic" ? (
                        /* Classic: white page, centered serif — logo + name centered, bottom bar */
                        <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6px" }}>
                          {/* Circle shop monogram */}
                          <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${TEMPLATE_PREVIEW_ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 5, flexShrink: 0 }}>
                            <span style={{ color: TEMPLATE_PREVIEW_ACCENT, fontSize: 7, fontWeight: 700, letterSpacing: "-0.2px" }}>{shopMonogram}</span>
                          </div>
                          <p style={{ color: TEMPLATE_PREVIEW_ACCENT, fontSize: 12, fontWeight: 700, textAlign: "center", lineHeight: 1.15, margin: 0 }}>{shopLine1}</p>
                          {shopLine2 && <p style={{ color: TEMPLATE_PREVIEW_ACCENT, fontSize: 10, fontWeight: 600, textAlign: "center", lineHeight: 1.15, margin: 0, marginBottom: 4 }}>{shopLine2}</p>}
                          {/* Accent rule */}
                          <div style={{ width: 28, height: 1.5, backgroundColor: TEMPLATE_PREVIEW_ACCENT, marginBottom: 4 }} />
                          <p style={{ color: "#6b7280", fontSize: 8, textAlign: "center", margin: 0 }}>Business Plan</p>
                          {/* Bottom accent bar */}
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, backgroundColor: TEMPLATE_PREVIEW_ACCENT }} />
                        </div>
                      ) : (
                        /* Modern: white with left accent stripe, flush-left title block */
                        <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", display: "flex", flexDirection: "row" }}>
                          {/* Left stripe */}
                          <div style={{ width: 4, backgroundColor: TEMPLATE_PREVIEW_ACCENT, flexShrink: 0 }} />
                          <div style={{ flex: 1, padding: "9px 6px", display: "flex", flexDirection: "column" }}>
                            <p style={{ color: TEMPLATE_PREVIEW_ACCENT, fontSize: 12, fontWeight: 700, lineHeight: 1.15, margin: 0 }}>{shopLine1}</p>
                            {shopLine2 && <p style={{ color: TEMPLATE_PREVIEW_ACCENT, fontSize: 10, fontWeight: 600, lineHeight: 1.15, margin: 0, marginBottom: 3 }}>{shopLine2}</p>}
                            <p style={{ color: "#9ca3af", fontSize: 8, margin: 0, marginBottom: 4 }}>Business Plan</p>
                            <div style={{ width: "100%", height: 1.5, backgroundColor: TEMPLATE_PREVIEW_ACCENT }} />
                            <div style={{ flex: 1 }} />
                            {/* Shop monogram badge bottom-left */}
                            <div style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: TEMPLATE_PREVIEW_ACCENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ color: "white", fontSize: 7, fontWeight: 700, letterSpacing: "-0.2px" }}>{shopMonogram}</span>
                            </div>
                          </div>
                        </div>
                      )}
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

            {/* Color packs — 10 palettes, 2 rows of 5 */}
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
                    title={pack.description}
                  >
                    {/* 4-color horizontal strip */}
                    <div className="flex gap-[2px] flex-shrink-0">
                      {pack.colors.map((c) => (
                        <span
                          key={c}
                          className="w-[10px] h-[10px] rounded-[2px] flex-shrink-0"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <span className={`text-[8px] leading-tight truncate w-full text-center ${packActive ? "text-[var(--success)] font-semibold" : "text-[var(--gray-slate)]"}`}>
                      {pack.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-[var(--gray-medium)] mb-2">Or enter a custom color</p>

            {/* Preset swatches — de-emphasized */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {PRESET_SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => handleSwatchClick(hex)}
                  style={{ backgroundColor: hex }}
                  className={`w-5 h-5 rounded flex-shrink-0 transition-all ring-1 ring-[#efefef] ${
                    accentColor.toLowerCase() === hex.toLowerCase()
                      ? "ring-2 ring-offset-1 ring-[var(--gray-slate-2)]"
                      : "opacity-70 hover:opacity-100"
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
                  className={`w-5 h-5 rounded border border-dashed border-[#d0d0d0] flex-shrink-0 ring-1 ring-[#efefef] ${
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
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 mb-2">
              {(["hex", "rgb", "cmyk"] as ColorMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setColorMode(mode)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide transition-colors ${
                    colorMode === mode
                      ? "bg-[var(--teal)] text-white"
                      : "text-[var(--gray-medium)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Hex entry */}
            {colorMode === "hex" && (
              <input
                type="text"
                value={hexInput}
                onChange={(e) => { setHexInput(e.target.value); setHexError(false); }}
                onBlur={handleHexBlur}
                maxLength={7}
                className={`w-24 h-8 rounded-md border text-[12px] px-2 font-mono ${
                  hexError ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[var(--success)]"
                } focus-visible:outline-none focus:border-2`}
                placeholder="#155E63"
              />
            )}

            {/* RGB entry */}
            {colorMode === "rgb" && (
              <div className="flex gap-1.5 items-end">
                {(["r", "g", "b"] as const).map((ch) => (
                  <div key={ch} className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] text-[var(--gray-medium)] uppercase">{ch}</span>
                    <input
                      type="number"
                      min={0}
                      max={255}
                      value={rgbInputs[ch]}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(255, parseInt(e.target.value) || 0));
                        const next = { ...rgbInputs, [ch]: val };
                        setRgbInputs(next);
                        const hex = rgbToHex(next.r, next.g, next.b);
                        setHexInput(hex);
                        setAccentColor(hex);
                        setCmykInputs(rgbToCmyk(next.r, next.g, next.b));
                      }}
                      onBlur={() => applyColor(rgbToHex(rgbInputs.r, rgbInputs.g, rgbInputs.b))}
                      className="w-14 h-8 rounded-md border border-gray-200 text-[11px] px-1 text-center focus-visible:outline-none focus:border-2 focus:border-[var(--success)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* CMYK entry */}
            {colorMode === "cmyk" && (
              <div className="flex gap-1.5 items-end">
                {(["c", "m", "y", "k"] as const).map((ch) => (
                  <div key={ch} className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] text-[var(--gray-medium)] uppercase">{ch}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={cmykInputs[ch]}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                        const next = { ...cmykInputs, [ch]: val };
                        setCmykInputs(next);
                        const rgb = cmykToRgb(next.c, next.m, next.y, next.k);
                        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
                        setHexInput(hex);
                        setAccentColor(hex);
                        setRgbInputs(rgb);
                      }}
                      onBlur={() => {
                        const rgb = cmykToRgb(cmykInputs.c, cmykInputs.m, cmykInputs.y, cmykInputs.k);
                        applyColor(rgbToHex(rgb.r, rgb.g, rgb.b));
                      }}
                      className="w-12 h-8 rounded-md border border-gray-200 text-[11px] px-1 text-center focus-visible:outline-none focus:border-2 focus:border-[var(--success)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {hexError && (
              <p className="text-[11px] text-[var(--error-secondary)] mt-1">Enter a valid hex color</p>
            )}
          </div>

          {/* Body font picker */}
          <div>
            <p className="text-xs text-[var(--gray-medium)] mb-2">Body Font</p>
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
                        ? "border-[var(--success)] bg-[var(--teal-bg-faint)]"
                        : "border-[var(--gray-slate-4)] hover:border-[var(--neutral-cool-350)]"
                    }`}
                  >
                    <p className={`text-[12px] font-medium ${active ? "text-[var(--success)]" : "text-[var(--foreground)]"}`}>
                      {font.label}
                    </p>
                    <p className="text-[11px] text-[var(--gray-medium)] mt-0.5">{font.description}</p>
                  </button>
                );
              })}
            </div>
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
                    logoState === "error" ? "border-red-300" : "border-[#d0d0d0]"
                  } flex items-center justify-center bg-[#fafafa]`}
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
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-[12px] text-[var(--gray-slate-2)] placeholder:text-[var(--gray-slate-3)] focus-visible:outline-none focus:border-2 focus:border-[var(--success)]"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
