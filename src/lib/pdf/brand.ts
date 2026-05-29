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

let fontsRegistered = false

export function registerFonts() {
  if (fontsRegistered) return
  fontsRegistered = true

  const fontsDir = path.join(process.cwd(), "public", "fonts")

  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(fontsDir, "inter-regular.woff2"), fontWeight: 400 },
      { src: path.join(fontsDir, "inter-semibold.woff2"), fontWeight: 600 },
      { src: path.join(fontsDir, "inter-bold.woff2"), fontWeight: 700 },
    ],
  })

  Font.register({
    family: "Source Serif Pro",
    fonts: [
      { src: path.join(fontsDir, "source-serif-pro-regular.woff2"), fontWeight: 400 },
      { src: path.join(fontsDir, "source-serif-pro-semibold.woff2"), fontWeight: 600 },
    ],
  })
}
