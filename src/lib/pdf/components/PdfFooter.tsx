import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND, type BrandTokens } from "../brand"

type Props = {
  generatedDate: string
  brand?: BrandTokens
}

export function PdfFooter({ generatedDate, brand = BRAND }: Props) {
  const styles = StyleSheet.create({
    footer: {
      position: "absolute",
      bottom: 24,
      left: brand.page.margin,
      right: brand.page.margin,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: brand.colors.rule,
      paddingTop: 6,
    },
    left: {
      fontFamily: brand.fonts.sans,
      fontSize: 8,
      color: brand.colors.muted,
    },
    right: {
      fontFamily: brand.fonts.sans,
      fontSize: 8,
      color: brand.colors.muted,
    },
  })

  return (
    <View style={styles.footer} fixed>
      <Text style={styles.left}>
        Generated {generatedDate}
      </Text>
      <Text
        style={styles.right}
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
}
