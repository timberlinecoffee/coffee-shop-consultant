import { Font } from "@react-pdf/renderer"

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

  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hiA.woff2",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hiA.woff2",
        fontWeight: 600,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hiA.woff2",
        fontWeight: 700,
      },
    ],
  })

  Font.register({
    family: "Source Serif Pro",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/sourceserifpro/v21/neIQzD-0qpwxpaWvjeD0X88SAOeasashRBksDw.woff2",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/sourceserifpro/v21/neIXzD-0qpwxpaWvjeD0X88SAOeauXEGYSGs9Tc.woff2",
        fontWeight: 600,
      },
    ],
  })
}
