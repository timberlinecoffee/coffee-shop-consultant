import React from "react"
import { Page, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND, type BrandTokens } from "../brand"
import { PdfHeader } from "./PdfHeader"
import { PdfFooter } from "./PdfFooter"

registerFonts()

const LETTER_MARGIN = 36

type Props = {
  shopName: string | null
  workspaceName: string
  generatedDate: string
  children: React.ReactNode
  brand?: BrandTokens
}

export function LetterPageShell({ shopName, workspaceName, generatedDate, children, brand = BRAND }: Props) {
  const styles = StyleSheet.create({
    page: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: LETTER_MARGIN,
      paddingBottom: 56,
      paddingLeft: LETTER_MARGIN,
      paddingRight: LETTER_MARGIN,
    },
  })

  return (
    <Page size="LETTER" style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName={workspaceName} brand={brand} />
      {children}
      <PdfFooter generatedDate={generatedDate} brand={brand} />
    </Page>
  )
}
