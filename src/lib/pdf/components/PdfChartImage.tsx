"use client"

import React from "react"
import { View, Image, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  image: {
    width: "100%",
    objectFit: "contain",
  },
  caption: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 8,
    color: BRAND.colors.muted,
    textAlign: "center",
    marginTop: 4,
  },
})

type Props = {
  src: Buffer | string
  caption?: string
  height?: number
}

export function PdfChartImage({ src, caption, height = 180 }: Props) {
  const source =
    typeof src === "string"
      ? src
      : `data:image/png;base64,${src.toString("base64")}`

  return (
    <View style={styles.wrapper}>
      <Image src={source} style={[styles.image, { height }]} />
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  )
}
