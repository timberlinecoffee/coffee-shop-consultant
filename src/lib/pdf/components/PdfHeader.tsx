"use client"

import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
    marginBottom: BRAND.spacing.blockGap,
  },
  brandLine: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 14,
    color: BRAND.colors.primary,
  },
  meta: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.muted,
    textAlign: "right",
  },
})

type Props = {
  shopName: string | null
  workspaceName: string
}

export function PdfHeader({ shopName, workspaceName }: Props) {
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brandLine}>Groundwork</Text>
      <Text style={styles.meta}>
        {shopName ?? "Your Coffee Shop"}{"\n"}{workspaceName}
      </Text>
    </View>
  )
}
