import React from "react"
import { Document, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND, pdfDocMeta, type BrandTokens } from "../brand"

registerFonts()

export function makeBasePageStyle(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: brand.page.margin,
      paddingBottom: brand.page.margin + 20,
      paddingLeft: brand.page.margin,
      paddingRight: brand.page.margin,
    },
  })
}

// Kept for backward compatibility with existing callers.
export const baseStyles = makeBasePageStyle(BRAND)

type Props = {
  children: React.ReactNode
  // Shop owner's brand name — flows into PDF document metadata. White-label
  // (TIM-1686): never emit Groundwork/Timberline. Falls back to neutral when null.
  shopName?: string | null
}

export function PdfDocument({ children, shopName }: Props) {
  return (
    <Document {...pdfDocMeta(shopName)}>
      {children}
    </Document>
  )
}
