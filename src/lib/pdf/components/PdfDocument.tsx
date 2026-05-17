"use client"

import React from "react"
import { Document, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND } from "../brand"

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
}

export function PdfDocument({ children }: Props) {
  return (
    <Document creator="Groundwork" producer="Groundwork">
      {children}
    </Document>
  )
}
