import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND, type BrandTokens } from "../brand"

type Props = {
  title: string
  children: React.ReactNode
  brand?: BrandTokens
}

export function PdfSection({ title, children, brand = BRAND }: Props) {
  const styles = StyleSheet.create({
    section: {
      marginBottom: brand.spacing.blockGap,
    },
    headingBar: {
      backgroundColor: brand.colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 8,
    },
    heading: {
      fontFamily: brand.fonts.sans,
      fontWeight: 700,
      fontSize: 11,
      color: brand.colors.paper,
    },
    body: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
    },
  })

  return (
    <View style={styles.section}>
      <View style={styles.headingBar}>
        <Text style={styles.heading}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  )
}
