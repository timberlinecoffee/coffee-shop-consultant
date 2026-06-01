import { Font } from "@react-pdf/renderer"
import path from "path"

export const BRAND = {
  colors: {
    ink: "#0F1B11",
    paper: "#FFFFFF",
    primary: "#1A6E3B",
    accent: "#E8C24A",
    muted: "#6B7B70",
    rule: "#D9DEDA",
  },
  fonts: {
    sans: "Inter",
    serif: "Source Serif Pro",
  },
  spacing: { gutter: 24, blockGap: 16 },
  page: { size: "A4" as const, margin: 40 },
} as const

export type BrandTokens = typeof BRAND

// ── White-label brand config (TIM-1686) ──────────────────────────────────────
// Exports must show ONLY the shop owner's brand — never Groundwork/Timberline.
// Per-shop config (name, logo, colors) is merged over neutral defaults; the
// full config model + UI lands in follow-up work. These helpers are the single
// source of truth for the brand strings that appear in every export.

export type BrandConfig = {
  shopName: string | null
  logo: string | null
  colors?: Partial<typeof BRAND.colors>
}

export type ResolvedBrand = BrandTokens & { shopName: string | null; logo: string | null }

export function resolveBrand(config?: Partial<BrandConfig>): ResolvedBrand {
  return {
    ...BRAND,
    colors: { ...BRAND.colors, ...(config?.colors ?? {}) },
    shopName: config?.shopName?.trim() || null,
    logo: config?.logo ?? null,
  }
}

// PDF document metadata. Never emit "Timberline Coffee School" — use the shop
// name when known, otherwise leave the field empty (neutral, no Groundwork).
export function pdfDocMeta(shopName: string | null | undefined) {
  const name = (shopName ?? "").trim()
  return {
    title: name || undefined,
    author: name || undefined,
    creator: name || undefined,
    producer: name || undefined,
  }
}

// Filename prefix derived from the shop name. Falls back to a neutral,
// non-Groundwork slug so downloads never carry the Groundwork brand.
export function brandFilePrefix(shopName: string | null | undefined): string {
  const slug = (shopName ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "coffee-shop"
}

let fontsRegistered = false

export function registerFonts() {
  if (fontsRegistered) return
  fontsRegistered = true

  const fontsDir = path.join(process.cwd(), "public", "fonts")

  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontsDir, "inter-regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "inter-italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: path.join(fontsDir, "inter-semibold.ttf"), fontWeight: 600 },
      { src: path.join(fontsDir, "inter-bold.ttf"), fontWeight: 700 },
    ],
  })

  Font.register({
    family: "Source Serif Pro",
    fonts: [
      { src: path.join(fontsDir, "source-serif-pro-regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "source-serif-pro-semibold.ttf"), fontWeight: 600 },
    ],
  })
}
