import React from "react"
import { View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { BRAND, type BrandTokens } from "../brand"

type Props = {
  shopName: string | null
  workspaceName: string
  brand?: BrandTokens
}

export function PdfHeader({ shopName, workspaceName, brand = BRAND }: Props) {
  const styles = StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: brand.colors.rule,
      marginBottom: brand.spacing.blockGap,
    },
    brandLine: {
      // TIM-2333: running header carries the user's shop name. Default to
      // neutral ink so the platform-primary green can never brand the user's
      // own name. A per-plan brand_config.primary_color override still flows
      // through brand.colors.primary if the owner has explicitly themed it.
      fontFamily: brand.fonts.sans,
      fontWeight: 700,
      fontSize: 14,
      color: brand.colors.ink,
    },
    logoImage: {
      maxHeight: 32,
      maxWidth: 120,
      objectFit: "contain" as const,
    },
    meta: {
      fontFamily: brand.fonts.sans,
      fontSize: 9,
      color: brand.colors.muted,
      textAlign: "right",
    },
  })

  const logoSrc = brand.logoBytes
    ? `data:image/${brand.logoBytes.format === "jpg" ? "jpeg" : "png"};base64,${brand.logoBytes.data.toString("base64")}`
    : null

  return (
    <View style={styles.header} fixed>
      {logoSrc ? (
        <Image src={logoSrc} style={styles.logoImage} />
      ) : (
        <Text style={styles.brandLine}>{shopName ?? "Your Coffee Shop"}</Text>
      )}
      <Text style={styles.meta}>{workspaceName}</Text>
    </View>
  )
}
