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
  logo: "/branding/groundwork-mark.png",
} as const

export type BrandTokens = typeof BRAND

// Maps body_font picker IDs to registered PDF font-family names.
// Fonts not registered fall back to the closest available family.
export const PDF_BODY_FONT_MAP: Record<string, string> = {
  inter: "Inter",
  "dm-sans": "DM Sans",
  lato: "Inter",           // Lato TTF not bundled; Inter is the closest sans fallback
  "source-serif-4": "Source Serif Pro",
  "libre-baskerville": "Source Serif Pro",
  nunito: "Inter",
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

  Font.register({
    family: "DM Sans",
    fonts: [
      { src: path.join(fontsDir, "dm-sans-regular.ttf"), fontWeight: 400 },
      { src: path.join(fontsDir, "dm-sans-regular.ttf"), fontWeight: 600 },
      { src: path.join(fontsDir, "dm-sans-regular.ttf"), fontWeight: 700 },
    ],
  })
}
