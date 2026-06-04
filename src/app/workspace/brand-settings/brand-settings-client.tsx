"use client";

// TIM-2253: Brand Settings client — shop name (debounced auto-save),
// logo upload/remove, and brand colors (explicit save).
//
// Style-guide sections consulted: Cards (Standard workspace card),
// Forms (Text Input, Form Label + Helper), Buttons (Primary, Ghost),
// Status Indicators (SaveIndicator).
//
// Visual reference: cover-branding-panel.tsx (logo upload, color picker),
// LocalizationSettingsCard.tsx (settings card layout, save + status feedback).

import { useState, useRef, useCallback, useEffect } from "react";
import { Palette, Upload, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SaveIndicator } from "@/components/ui/save-indicator";

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]);

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function normalizeHex(input: string): string | null {
  let v = input.trim();
  if (!v.startsWith("#")) v = "#" + v;
  return HEX_RE.test(v) ? v.toUpperCase() : null;
}

interface Props {
  initialShopName: string;
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialAccentColor: string;
  logoPublicUrl: string | null;
}

export function BrandSettingsClient({
  initialShopName,
  initialPrimaryColor,
  initialSecondaryColor,
  initialAccentColor,
  logoPublicUrl,
}: Props) {
  // ── Shop Name ──────────────────────────────────────────────────────────────

  const [shopName, setShopName] = useState(initialShopName);
  const [shopNameSaving, setShopNameSaving] = useState(false);
  const [shopNameSavedAt, setShopNameSavedAt] = useState<string | null>(null);
  const [shopNameError, setShopNameError] = useState<string | null>(null);
  const lastSavedShopName = useRef(initialShopName);
  const debouncedShopName = useDebounce(shopName, 300);

  useEffect(() => {
    if (debouncedShopName === lastSavedShopName.current) return;
    lastSavedShopName.current = debouncedShopName;
    setShopNameSaving(true);
    setShopNameError(null);
    fetch("/api/brand-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopName: debouncedShopName }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("save failed");
        setShopNameSavedAt(new Date().toISOString());
      })
      .catch(() => setShopNameError("Save failed. Try again."))
      .finally(() => setShopNameSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedShopName]);

  // ── Logo ───────────────────────────────────────────────────────────────────

  const [logoUrl, setLogoUrl] = useState<string | null>(logoPublicUrl);
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "error">("idle");
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_BYTES || !ACCEPTED_TYPES.has(file.type)) {
      setLogoState("error");
      setLogoError("Upload failed. Make sure the file is a PNG, JPG, or SVG under 2 MB.");
      e.target.value = "";
      return;
    }

    setLogoState("uploading");
    setLogoError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/brand/logo", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const preview = URL.createObjectURL(file);
      setLogoUrl(preview);
      setLogoState("idle");
    } catch {
      setLogoState("error");
      setLogoError("Upload failed. Make sure the file is a PNG, JPG, or SVG under 2 MB.");
    }

    e.target.value = "";
  }, []);

  const handleLogoRemove = useCallback(async () => {
    try {
      await fetch("/api/brand/logo", { method: "DELETE" });
      setLogoUrl(null);
      setLogoState("idle");
      setLogoError(null);
    } catch {
      setLogoState("error");
      setLogoError("Upload failed. Make sure the file is a PNG, JPG, or SVG under 2 MB.");
    }
  }, []);

  // ── Brand Colors ───────────────────────────────────────────────────────────

  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor.toUpperCase());
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor.toUpperCase());
  const [accentColor, setAccentColor] = useState(initialAccentColor.toUpperCase());

  const [primaryInput, setPrimaryInput] = useState(initialPrimaryColor.toUpperCase());
  const [secondaryInput, setSecondaryInput] = useState(initialSecondaryColor.toUpperCase());
  const [accentInput, setAccentInput] = useState(initialAccentColor.toUpperCase());

  const [primaryError, setPrimaryError] = useState(false);
  const [secondaryError, setSecondaryError] = useState(false);
  const [accentError, setAccentError] = useState(false);

  const [colorsSaving, setColorsSaving] = useState(false);
  const [colorsSavedAt, setColorsSavedAt] = useState<string | null>(null);
  const [colorsError, setColorsError] = useState<string | null>(null);

  const primaryPickerRef = useRef<HTMLInputElement>(null);
  const secondaryPickerRef = useRef<HTMLInputElement>(null);
  const accentPickerRef = useRef<HTMLInputElement>(null);

  const handleHexInputChange = useCallback(
    (
      raw: string,
      setInput: (v: string) => void,
      setError: (v: boolean) => void,
    ) => {
      setInput(raw.toUpperCase());
      setError(false);
    },
    [],
  );

  const handleHexBlur = useCallback(
    (
      input: string,
      setColor: (v: string) => void,
      setInput: (v: string) => void,
      setError: (v: boolean) => void,
    ) => {
      const hex = normalizeHex(input);
      if (hex) {
        setError(false);
        setColor(hex);
        setInput(hex);
      } else {
        setError(true);
      }
    },
    [],
  );

  const handlePickerChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      setColor: (v: string) => void,
      setInput: (v: string) => void,
    ) => {
      const val = e.target.value.toUpperCase();
      setColor(val);
      setInput(val);
    },
    [],
  );

  const saveColors = useCallback(async () => {
    let anyError = false;
    if (!HEX_RE.test(primaryColor)) { setPrimaryError(true); anyError = true; }
    if (!HEX_RE.test(secondaryColor)) { setSecondaryError(true); anyError = true; }
    if (!HEX_RE.test(accentColor)) { setAccentError(true); anyError = true; }
    if (anyError) return;

    setColorsSaving(true);
    setColorsError(null);
    try {
      const res = await fetch("/api/brand-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryColor, secondaryColor, accentColor }),
      });
      if (!res.ok) throw new Error("save failed");
      setColorsSavedAt(new Date().toISOString());
    } catch {
      setColorsError("Save failed. Try again.");
    } finally {
      setColorsSaving(false);
    }
  }, [primaryColor, secondaryColor, accentColor]);

  // ── Preview ────────────────────────────────────────────────────────────────

  const [previewExpanded, setPreviewExpanded] = useState(false);

  // ── Color rows config ──────────────────────────────────────────────────────

  const colorRows = [
    {
      label: "Primary Color",
      helper: "Used for the header bar and main headings.",
      placeholder: "#155E63",
      color: primaryColor,
      input: primaryInput,
      error: primaryError,
      pickerRef: primaryPickerRef,
      setColor: setPrimaryColor,
      setInput: setPrimaryInput,
      setError: setPrimaryError,
    },
    {
      label: "Secondary Color",
      helper: "Used for subheadings and section accents.",
      placeholder: "#76B39D",
      color: secondaryColor,
      input: secondaryInput,
      error: secondaryError,
      pickerRef: secondaryPickerRef,
      setColor: setSecondaryColor,
      setInput: setSecondaryInput,
      setError: setSecondaryError,
    },
    {
      label: "Accent Color",
      helper: "Used for highlights and call-out elements.",
      placeholder: "#F59E0B",
      color: accentColor,
      input: accentInput,
      error: accentError,
      pickerRef: accentPickerRef,
      setColor: setAccentColor,
      setInput: setAccentInput,
      setError: setAccentError,
    },
  ] as const;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-2xl mx-auto px-6 pt-8 pb-12">
        <WorkspaceHeader
          Icon={Palette}
          title="Brand Settings"
          description="Your logo, name, and colors appear on every PDF export."
        />

        {/* Card 1 — Shop Name */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-6 mt-6">
          <h2 className="text-xl font-bold text-neutral-950 mb-1">Shop Name</h2>
          <p className="text-xs text-neutral-500 mb-4">
            Defaults to your plan name. 80 characters max.
          </p>
          <div className="flex items-center gap-3">
            <Input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. Blue Stone Coffee"
              maxLength={80}
              className="flex-1"
            />
            <SaveIndicator
              saving={shopNameSaving}
              savedAt={shopNameSavedAt}
              error={shopNameError}
              className="flex-shrink-0"
            />
          </div>
        </div>

        {/* Card 2 — Shop Logo */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-6 mt-6">
          <h2 className="text-xl font-bold text-neutral-950 mb-1">Shop Logo</h2>
          <p className="text-xs text-neutral-500 mb-4">
            PNG, JPG, or SVG. Max 2 MB. Recommended: at least 400 &times; 200 px.
          </p>

          {logoState === "uploading" ? (
            <div className="border-2 border-dashed border-neutral-300 rounded-xl p-8 flex flex-col items-center gap-3">
              <Loader2 size={20} className="text-neutral-400 animate-spin" />
              <span className="text-xs text-neutral-500">Uploading...</span>
            </div>
          ) : logoUrl ? (
            <div className="border border-[var(--border)] rounded-xl p-4 bg-[var(--muted)] flex items-center justify-between">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Shop logo"
                className="max-h-16 w-auto object-contain"
              />
              <div className="flex flex-col gap-2 items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace Logo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleLogoRemove}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-neutral-300 rounded-xl p-8 flex flex-col items-center gap-3">
              <Upload size={20} className="text-neutral-400" />
              <Button
                variant="default"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload Logo
              </Button>
              <span className="text-xs text-neutral-500">or drag and drop</span>
            </div>
          )}

          {logoError && (
            <p className="text-xs text-destructive mt-2">{logoError}</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Card 3 — Brand Colors */}
        <div className="bg-white rounded-2xl border border-[var(--border)] p-6 mt-6">
          <h2 className="text-xl font-bold text-neutral-950 mb-1">Brand Colors</h2>
          <p className="text-xs text-neutral-500 mb-4">
            These colors appear in export headers and cover pages.
          </p>

          <div className="flex flex-col gap-6">
            {colorRows.map((row) => (
              <div key={row.label} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-neutral-950">
                  {row.label}
                </label>
                <p className="text-xs text-neutral-500">{row.helper}</p>
                <div className="flex items-center gap-3">
                  {/* Color swatch — triggers native picker */}
                  <div
                    className="w-10 h-10 rounded-xl border border-[var(--border)] cursor-pointer flex-shrink-0"
                    style={{ backgroundColor: row.color }}
                    onClick={() => row.pickerRef.current?.click()}
                    role="button"
                    aria-label={`Open color picker for ${row.label}`}
                  />
                  {/* Hex text input */}
                  <div className="relative">
                    <Input
                      value={row.input}
                      onChange={(e) =>
                        handleHexInputChange(e.target.value, row.setInput, row.setError)
                      }
                      onBlur={() =>
                        handleHexBlur(row.input, row.setColor, row.setInput, row.setError)
                      }
                      placeholder={row.placeholder}
                      maxLength={7}
                      className="w-32 font-mono uppercase"
                    />
                    {/* Hidden native color picker */}
                    <input
                      ref={row.pickerRef}
                      type="color"
                      value={row.color}
                      onChange={(e) =>
                        handlePickerChange(e, row.setColor, row.setInput)
                      }
                      className="absolute opacity-0 w-0 h-0 pointer-events-none"
                    />
                  </div>
                </div>
                {row.error && (
                  <p className="text-xs text-destructive mt-0.5">
                    Enter a 6-digit hex color like #1a5f63.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Save Colors row */}
          <div className="flex items-center gap-3 mt-6 pt-6 border-t border-[var(--border)]">
            <Button
              variant="default"
              onClick={saveColors}
              disabled={colorsSaving}
            >
              Save Colors
            </Button>
            <SaveIndicator
              saving={colorsSaving}
              savedAt={colorsSavedAt}
              error={colorsError}
            />
          </div>

          {/* Optional: Preview Export Header */}
          <div className="mt-6">
            <button
              type="button"
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setPreviewExpanded((v) => !v)}
            >
              {previewExpanded ? (
                <ChevronDown size={14} className="text-neutral-500" />
              ) : (
                <ChevronRight size={14} className="text-neutral-500" />
              )}
              <span className="text-sm font-medium text-neutral-500">
                Preview Export Header
              </span>
            </button>

            {previewExpanded && (
              <div className="mt-4">
                <div className="h-20 rounded-xl border border-[var(--border)] overflow-hidden flex items-center px-6 gap-4">
                  <div
                    className="w-2 self-stretch flex-shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  />
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="max-h-10 object-contain"
                    />
                  ) : (
                    <div className="w-16 h-8 rounded bg-neutral-200 flex-shrink-0" />
                  )}
                  <span
                    className="text-sm font-bold truncate"
                    style={{ color: primaryColor }}
                  >
                    {shopName || "Your Shop Name"}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-2 text-center">
                  This is how your shop name and logo will appear in PDF exports.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
