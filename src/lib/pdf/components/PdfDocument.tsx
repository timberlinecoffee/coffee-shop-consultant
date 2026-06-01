import React from "react"
import { Document, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND, pdfDocMeta } from "../brand"

registerFonts()

export const baseStyles = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: BRAND.page.margin,
    paddingBottom: BRAND.page.margin + 20,
    paddingLeft: BRAND.page.margin,
    paddingRight: BRAND.page.margin,
  },
})

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
