import React from "react"
import { View, Image, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND, type BrandTokens } from "../brand"

type Props = {
  src: Buffer | string
  caption?: string
  height?: number
  brand?: BrandTokens
}

export function PdfChartImage({ src, caption, height = 180, brand = BRAND }: Props) {
  const styles = StyleSheet.create({
    wrapper: {
      marginBottom: 8,
    },
    image: {
      width: "100%",
      objectFit: "contain",
    },
    caption: {
      fontFamily: brand.fonts.sans,
      fontSize: 8,
      color: brand.colors.muted,
      textAlign: "center",
      marginTop: 4,
    },
  })

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
