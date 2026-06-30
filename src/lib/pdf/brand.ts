import { Font } from "@react-pdf/renderer"
import path from "path"

export const BRAND = {
  colors: {
    ink: "#0F1B11",
    paper: "#FFFFFF",
    primary: "#1A6E3B",
    accent: "#155E63",
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

// Explicit interface so resolveBrand() can return mutable/per-shop values.
export type BrandTokens = {
  colors: {
    ink: string
    paper: string
    primary: string
    accent: string
    muted: string
    rule: string
  }
  fonts: {
    sans: string
    serif: string
  }
  spacing: {
    gutter: number
    blockGap: number
  }
  page: {
    size: "A4"
    margin: number
  }
  /** Pre-fetched logo bytes for react-pdf image rendering. Null = use text shop name. */
  logoBytes?: { data: Buffer; format: "png" | "jpg" } | null
}

/** Per-plan brand overrides loaded from brand_config table. */
export type BrandConfig = {
  shopName?: string | null
  logoBytes?: { data: Buffer; format: "png" | "jpg" } | null
  colors?: {
    primary?: string
    accent?: string
    ink?: string
    paper?: string
    muted?: string
    rule?: string
  }
}

/** Merge per-plan BrandConfig overrides onto the default BRAND tokens. */
export function resolveBrand(config: BrandConfig): BrandTokens {
  return {
    ...BRAND,
    colors: {
      ...BRAND.colors,
      ...(config.colors ?? {}),
    },
    logoBytes: config.logoBytes ?? null,
  }
}

// ── White-label brand config (TIM-1686) ──────────────────────────────────────
// Exports must show ONLY the shop owner's brand — never Groundwork/Timberline.
// Per-shop config (name, logo, colors) is merged over neutral defaults; the
// full config model + UI lands in follow-up work. These helpers are the single
// source of truth for the brand strings that appear in every export.

// PDF document metadata. Never emit any platform entity name — use the shop
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
