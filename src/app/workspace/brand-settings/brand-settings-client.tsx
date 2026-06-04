"use client"

// TIM-2253: Brand Settings client — Shop Name, Logo, and Brand Colors cards.
// Reference: cover-branding-panel.tsx (logo upload), LocalizationSettingsCard.tsx (settings form).

import { useState, useRef, useEffect, useCallback } from "react"
import { Palette } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SaveIndicator } from "@/components/ui/save-indicator"
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader"

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

interface Props {
  initialShopName: string
  initialPrimaryColor: string
  initialSecondaryColor: string
  initialAccentColor: string
  initialLogoUrl: string | null
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function BrandSettingsClient({
  initialShopName,
  initialPrimaryColor,
  initialSecondaryColor,
  initialAccentColor,
  initialLogoUrl,
}: Props) {
  // ── Shop Name ────────────────────────────────────────────────────────────────
  const [shopName, setShopName] = useState(initialShopName)
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSavedAt, setNameSavedAt] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const lastSavedName = useRef(initialShopName)
  const debouncedName = useDebounce(shopName, 300)

  useEffect(() => {
    if (debouncedName === lastSavedName.current) return
    lastSavedName.current = debouncedName
    setNameSaving(true)
    setNameError(null)
    fetch("/api/brand-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shop_name: debouncedName }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("save failed")
        setNameSavedAt(new Date().toISOString())
      })
      .catch(() => setNameError("Save failed"))
      .finally(() => setNameSaving(false))
  }, [debouncedName])

  // ── Logo ─────────────────────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "removing">("idle")
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File too large (max 2 MB)")
      e.target.value = ""
      return
    }
    const accepted = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"]
    if (!accepted.includes(file.type)) {
      setLogoError("Unsupported format. Use PNG, JPEG, or SVG.")
      e.target.value = ""
      return
    }

    setLogoState("uploading")
    setLogoError(null)

    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch("/api/brand/logo", { method: "POST", body: form })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error((j.error as string) ?? "Upload failed. Try again.")
      }
      setLogoUrl(URL.createObjectURL(file))
      setLogoError(null)
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : "Upload failed. Try again.")
    } finally {
      setLogoState("idle")
      e.target.value = ""
    }
  }, [])

  const handleLogoRemove = useCallback(async () => {
    setLogoState("removing")
    setLogoError(null)
    try {
      const res = await fetch("/api/brand/logo", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setLogoUrl(null)
    } catch {
      setLogoError("Could not remove logo. Try again.")
    } finally {
      setLogoState("idle")
    }
  }, [])

  // ── Brand Colors ─────────────────────────────────────────────────────────────
  const [primaryHex, setPrimaryHex] = useState(initialPrimaryColor)
  const [secondaryHex, setSecondaryHex] = useState(initialSecondaryColor)
  const [accentHex, setAccentHex] = useState(initialAccentColor)
  const [primaryError, setPrimaryError] = useState(false)
  const [secondaryError, setSecondaryError] = useState(false)
  const [accentError, setAccentError] = useState(false)
  const [colorSaving, setColorSaving] = useState(false)
  const [colorSavedAt, setColorSavedAt] = useState<string | null>(null)
  const [colorSaveError, setColorSaveError] = useState<string | null>(null)

  const primaryPickerRef = useRef<HTMLInputElement>(null)
  const secondaryPickerRef = useRef<HTMLInputElement>(null)
  const accentPickerRef = useRef<HTMLInputElement>(null)

  const handleSaveColors = useCallback(async () => {
    let hasError = false
    if (!HEX_RE.test(primaryHex)) { setPrimaryError(true); hasError = true }
    if (!HEX_RE.test(secondaryHex)) { setSecondaryError(true); hasError = true }
    if (!HEX_RE.test(accentHex)) { setAccentError(true); hasError = true }
    if (hasError) return

    setColorSaving(true)
    setColorSaveError(null)
    try {
      const res = await fetch("/api/brand-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_color: primaryHex,
          secondary_color: secondaryHex,
          accent_color: accentHex,
        }),
      })
      if (!res.ok) throw new Error("save failed")
      setColorSavedAt(new Date().toISOString())
    } catch {
      setColorSaveError("Save failed")
    } finally {
      setColorSaving(false)
    }
  }, [primaryHex, secondaryHex, accentHex])

  // ── Color field helpers ──────────────────────────────────────────────────────
  const colors = [
    {
      label: "Primary",
      value: primaryHex,
      set: setPrimaryHex,
      error: primaryError,
      setError: setPrimaryError,
      pickerRef: primaryPickerRef,
    },
    {
      label: "Secondary",
      value: secondaryHex,
      set: setSecondaryHex,
      error: secondaryError,
      setError: setSecondaryError,
      pickerRef: secondaryPickerRef,
    },
    {
      label: "Accent",
      value: accentHex,
      set: setAccentHex,
      error: accentError,
      setError: setAccentError,
      pickerRef: accentPickerRef,
    },
  ]

  return (
    <div className="bg-[var(--background)] min-h-full">
      <div className="max-w-2xl mx-auto px-6 pt-8 pb-16">
        <WorkspaceHeader
          Icon={Palette}
          title="Brand Settings"
          description="Set your shop name, logo, and colors. These appear on every export."
        />

        {/* Shop Name */}
        <section className="rounded-xl border border-[var(--border)] bg-white mb-5">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Shop Name</h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Appears on every document and PDF export.
                </p>
              </div>
              <SaveIndicator
                saving={nameSaving}
                savedAt={nameSavedAt}
                error={nameError}
                className="mt-0.5 shrink-0"
              />
            </div>
            <Input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Your Coffee Shop"
              aria-label="Shop name"
            />
          </div>
        </section>

        {/* Shop Logo */}
        <section className="rounded-xl border border-[var(--border)] bg-white mb-5">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1">Shop Logo</h2>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">
              PNG, JPEG, or SVG, max 2 MB. Shows on PDF cover pages.
            </p>

            {logoState === "uploading" ? (
              <div className="w-full h-24 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-warm-100)] flex items-center justify-center">
                <span className="text-sm text-[var(--muted-foreground)]">Uploading...</span>
              </div>
            ) : logoUrl ? (
              <>
                <div className="w-full h-24 rounded-xl border border-[var(--border)] bg-[var(--surface-warm-100)] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo preview" className="max-h-16 object-contain" />
                </div>
                <div className="flex gap-3 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoState === "removing"}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogoRemove}
                    disabled={logoState === "removing"}
                    className="text-[var(--error)] hover:text-[var(--error)] hover:bg-[var(--destructive)]/10"
                  >
                    {logoState === "removing" ? "Removing..." : "Remove"}
                  </Button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-[var(--border)] flex flex-col items-center justify-center gap-1 transition-colors hover:border-[var(--teal)] hover:bg-[var(--teal)]/[0.03]"
              >
                <span className="text-sm text-[var(--muted-foreground)]">Upload logo</span>
                <span className="text-xs text-[var(--neutral-cool-400)]">PNG, JPEG, or SVG (max 2 MB)</span>
              </button>
            )}

            {logoError && (
              <p className="text-xs text-[var(--error)] mt-2">{logoError}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />
          </div>
        </section>

        {/* Brand Colors */}
        <section className="rounded-xl border border-[var(--border)] bg-white mb-5">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Brand Colors</h2>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Used in PDF exports and on-screen previews.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0 mt-0.5">
                <SaveIndicator
                  saving={colorSaving}
                  savedAt={colorSavedAt}
                  error={colorSaveError}
                />
                <Button size="sm" onClick={handleSaveColors} disabled={colorSaving}>
                  Save Colors
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {colors.map(({ label, value, set, error, setError, pickerRef }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                    {label}
                  </label>
                  <div className="flex items-center gap-2">
                    {/* Swatch — clicking opens native picker */}
                    <button
                      type="button"
                      onClick={() => pickerRef.current?.click()}
                      className="h-9 w-9 flex-shrink-0 rounded-lg border border-[var(--border-medium)] transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50"
                      style={{ backgroundColor: HEX_RE.test(value) ? value : "#ffffff" }}
                      aria-label={`Pick ${label.toLowerCase()} color`}
                    />
                    <input
                      ref={pickerRef}
                      type="color"
                      value={HEX_RE.test(value) ? value : "#000000"}
                      onChange={(e) => {
                        set(e.target.value)
                        setError(false)
                      }}
                      className="absolute opacity-0 w-0 h-0 pointer-events-none"
                      aria-hidden="true"
                    />
                    {/* Hex text input */}
                    <Input
                      value={value}
                      onChange={(e) => {
                        set(e.target.value)
                        setError(false)
                      }}
                      maxLength={7}
                      placeholder="#155e63"
                      aria-label={`${label} color hex value`}
                      className={error ? "border-[var(--error)] focus:border-[var(--error)]" : ""}
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-[var(--error)] mt-1">Enter a valid hex color (e.g. #155e63)</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
