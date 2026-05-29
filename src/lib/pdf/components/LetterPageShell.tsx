import React from "react"
import { Page, StyleSheet } from "@react-pdf/renderer"
import { registerFonts, BRAND } from "../brand"
import { PdfHeader } from "./PdfHeader"
import { PdfFooter } from "./PdfFooter"

registerFonts()

const LETTER_MARGIN = 36

const styles = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: LETTER_MARGIN,
    paddingBottom: 56,
    paddingLeft: LETTER_MARGIN,
    paddingRight: LETTER_MARGIN,
  },
})

type Props = {
  shopName: string | null
  workspaceName: string
  generatedDate: string
  children: React.ReactNode
}

export function LetterPageShell({ shopName, workspaceName, generatedDate, children }: Props) {
  return (
    <Page size="LETTER" style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName={workspaceName} />
      {children}
      <PdfFooter generatedDate={generatedDate} />
    </Page>
  )
}
