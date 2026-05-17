"use client"

import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"

const styles = StyleSheet.create({
  section: {
    marginBottom: BRAND.spacing.blockGap,
  },
  headingBar: {
    backgroundColor: BRAND.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  heading: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 11,
    color: BRAND.colors.paper,
  },
  body: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
  },
})

type Props = {
  title: string
  children: React.ReactNode
}

export function PdfSection({ title, children }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.headingBar}>
        <Text style={styles.heading}>{title}</Text>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  )
}
