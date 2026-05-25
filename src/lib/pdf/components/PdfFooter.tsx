"use client"

import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    bottom: 24,
    left: BRAND.page.margin,
    right: BRAND.page.margin,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
    paddingTop: 6,
  },
  left: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
  },
  right: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
  },
})

type Props = {
  generatedDate: string
}

export function PdfFooter({ generatedDate }: Props) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.left}>
        Groundwork — built for first-time coffee shop owners · Generated {generatedDate}
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
