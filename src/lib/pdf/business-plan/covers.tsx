// TIM-1225: Business Plan cover-template registry + renderCover().
// Three templates: Classic (centered serif), Modern (left-band), Editorial (full-bleed teal header).
// Design spec: TIM-1224 spec document.

import React from "react";
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { BRAND, type BrandTokens } from "../brand";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CoverTemplateId = "classic" | "modern" | "editorial";

export interface CoverProps {
  shopName: string;
  tagline?: string;
  preparedFor?: string;
  authorName?: string;
  date: string;
  accentColor?: string;
  logo?: { data: Buffer; format: "png" | "jpg" };
  brand?: BrandTokens;
}

export interface CoverTemplate {
  id: CoverTemplateId;
  label: string;
  description: string;
}

export const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Centered, formal, serif-led — the traditional format a bank officer expects.",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Left-aligned, minimal, architectural — signals discipline and clarity.",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Bold full-bleed header block — confident, modern, presentation-ready.",
  },
];

export function renderCover(templateId: string, props: CoverProps, brand: BrandTokens = BRAND): React.ReactElement {
  const id = (templateId as CoverTemplateId) ?? "classic";
  // brand arg takes precedence over any brand embedded in props
  const propsWithBrand: CoverProps = { ...props, brand };
  switch (id) {
    case "modern":
      return <ModernCover {...propsWithBrand} />;
    case "editorial":
      return <EditorialCover {...propsWithBrand} />;
    default:
      return <ClassicCover {...propsWithBrand} />;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function accent(props: CoverProps): string {
  return props.accentColor ?? (props.brand ?? BRAND).colors.accent;
}

// ── Template 1: Classic ───────────────────────────────────────────────────────

function makeClassicStyles(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      backgroundColor: brand.colors.paper,
      // TIM-2315: 96/56pt page-safe margins (~33mm top, ~20mm sides). The cover
      // previously had paddingTop/paddingBottom: 0 which let the title/accent
      // bar bleed to the page edge.
      paddingHorizontal: 56,
      paddingTop: 96,
      paddingBottom: 56,
      flexDirection: "column",
    },
    logoZone: {
      justifyContent: "center",
      alignItems: "center",
    },
    logo: {
      maxHeight: 72,
      objectFit: "contain",
    },
    shopName: {
      // TIM-2333: no hardcoded platform teal default. The accent prop is
      // always applied inline below; the StyleSheet baseline falls back to
      // neutral ink so platform colors can never bleed through.
      fontFamily: "Source Serif Pro",
      fontSize: 36,
      fontWeight: "bold",
      color: brand.colors.ink,
      textAlign: "center",
    },
    subtitle: {
      fontFamily: "Source Serif Pro",
      fontSize: 22,
      color: brand.colors.ink,
      textAlign: "center",
      marginBottom: 10,
    },
    nameGap: { marginBottom: 12 },
    tagline: {
      fontFamily: "Inter",
      fontSize: 13,
      fontStyle: "italic",
      color: brand.colors.muted,
      textAlign: "center",
    },
    metaZone: {
      marginTop: "auto",
    },
    metaRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    metaLabel: {
      fontFamily: "Inter",
      fontSize: 11,
      color: brand.colors.muted,
      marginRight: 4,
    },
    metaValue: {
      fontFamily: "Inter",
      fontSize: 11,
      fontWeight: "600",
      color: brand.colors.ink,
    },
    date: {
      fontFamily: "Inter",
      fontSize: 11,
      color: brand.colors.muted,
      marginBottom: 0,
    },
    bottomBar: {
      width: "100%",
      height: 4,
    },
  });
}

function ClassicCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo, brand = BRAND } = props;
  const classicS = makeClassicStyles(brand);
  const ac = accent(props);
  const logoZoneHeight = logo ? 120 : 40;

  return (
    <Page size={brand.page.size} style={classicS.page}>
      {/* Zone A: logo */}
      <View style={[classicS.logoZone, { height: logoZoneHeight }]}>
        {logo && (
          <Image
            src={{ data: logo.data, format: logo.format }}
            style={classicS.logo}
          />
        )}
      </View>

      {/* Title band */}
      <Text style={[classicS.shopName, { color: ac }]}>{shopName}</Text>
      <View style={classicS.nameGap} />
      <Text style={classicS.subtitle}>Business Plan</Text>

      {/* Gold rule */}
      <View style={{ width: 120, height: 2, backgroundColor: ac, alignSelf: "center", marginBottom: 10 }} />

      {/* Tagline */}
      {tagline ? <Text style={classicS.tagline}>{tagline}</Text> : null}

      {/* Metadata pushed to bottom */}
      <View style={classicS.metaZone}>
        {preparedFor ? (
          <View style={classicS.metaRow}>
            <Text style={classicS.metaLabel}>Prepared for:</Text>
            <Text style={classicS.metaValue}>{preparedFor}</Text>
          </View>
        ) : null}
        {authorName ? (
          <View style={classicS.metaRow}>
            <Text style={classicS.metaLabel}>Prepared by:</Text>
            <Text style={classicS.metaValue}>{authorName}</Text>
          </View>
        ) : null}
        <Text style={classicS.date}>{date}</Text>
      </View>

      {/* Bottom accent bar */}
      <View style={[classicS.bottomBar, { backgroundColor: ac }]} />
    </Page>
  );
}

// ── Template 2: Modern ────────────────────────────────────────────────────────

function makeModernStyles(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      backgroundColor: brand.colors.paper,
      flexDirection: "row",
    },
    stripe: {
      // TIM-2333: accent overrides this inline; neutral rule color baseline
      // ensures no platform teal leak.
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: 6,
      backgroundColor: brand.colors.rule,
    },
    content: {
      flex: 1,
      paddingLeft: 64,
      paddingRight: 56,
      paddingTop: 80,
      paddingBottom: 48,
      flexDirection: "column",
    },
    shopName: {
      // TIM-2333: accent overrides inline; neutral ink baseline.
      fontFamily: "Source Serif Pro",
      fontSize: 44,
      fontWeight: "bold",
      color: brand.colors.ink,
      lineHeight: 1.1,
      marginBottom: 14,
    },
    subtitle: {
      fontFamily: "Inter",
      fontSize: 18,
      color: brand.colors.ink,
      marginBottom: 10,
    },
    tagline: {
      fontFamily: "Inter",
      fontSize: 13,
      fontStyle: "italic",
      color: brand.colors.muted,
      marginBottom: 14,
    },
    spacer: {
      flex: 1,
    },
    metaLabel: {
      fontFamily: "Inter",
      fontSize: 10,
      color: brand.colors.muted,
      marginBottom: 2,
    },
    metaValue: {
      fontFamily: "Inter",
      fontSize: 12,
      fontWeight: "600",
      color: brand.colors.ink,
      marginBottom: 12,
    },
    date: {
      fontFamily: "Inter",
      fontSize: 10,
      color: brand.colors.muted,
      marginTop: 8,
    },
    logo: {
      position: "absolute",
      bottom: 48,
      left: 64,
      maxWidth: 120,
      maxHeight: 64,
      objectFit: "contain",
    },
    confidential: {
      position: "absolute",
      bottom: 24,
      right: 56,
      fontFamily: "Inter",
      fontSize: 8,
      color: brand.colors.muted,
    },
  });
}

function ModernCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo, brand = BRAND } = props;
  const modernS = makeModernStyles(brand);
  const ac = accent(props);

  return (
    <Page size={brand.page.size} style={modernS.page}>
      {/* Left vertical stripe */}
      <View style={[modernS.stripe, { backgroundColor: ac }]} />

      {/* Main content area */}
      <View style={modernS.content}>
        <Text style={[modernS.shopName, { color: ac }]}>{shopName}</Text>
        <Text style={modernS.subtitle}>Business Plan</Text>
        {tagline ? <Text style={modernS.tagline}>{tagline}</Text> : null}

        {/* Accent rule */}
        <View style={{ width: "100%", height: 2, backgroundColor: ac, marginBottom: 0 }} />

        {/* Spacer */}
        <View style={modernS.spacer} />

        {/* Metadata */}
        {preparedFor ? (
          <>
            <Text style={modernS.metaLabel}>Prepared for</Text>
            <Text style={modernS.metaValue}>{preparedFor}</Text>
          </>
        ) : null}
        {authorName ? (
          <>
            <Text style={modernS.metaLabel}>Prepared by</Text>
            <Text style={modernS.metaValue}>{authorName}</Text>
          </>
        ) : null}
        <Text style={modernS.date}>{date}</Text>
      </View>

      {/* Logo: bottom-left absolute */}
      {logo ? (
        <Image
          src={{ data: logo.data, format: logo.format }}
          style={modernS.logo}
        />
      ) : null}

      {/* Confidential watermark */}
      <Text style={modernS.confidential}>Confidential</Text>
    </Page>
  );
}

// ── Template 3: Editorial ─────────────────────────────────────────────────────

function makeEditorialStyles(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      backgroundColor: brand.colors.paper,
      flexDirection: "column",
    },
    greenBlock: {
      // TIM-2333: accent overrides this inline; neutral ink fallback ensures
      // the platform teal never leaks if a future override is removed.
      width: "100%",
      height: 356,
      backgroundColor: brand.colors.ink,
      padding: 40,
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
    },
    logo: {
      maxHeight: 96,
      maxWidth: 200,
      objectFit: "contain",
      marginBottom: 20,
    },
    shopName: {
      fontFamily: "Source Serif Pro",
      fontSize: 38,
      fontWeight: "bold",
      color: brand.colors.paper,
      textAlign: "center",
      marginBottom: 16,
    },
    subtitle: {
      fontFamily: "Source Serif Pro",
      fontSize: 20,
      color: brand.colors.paper,
      textAlign: "center",
      marginBottom: 12,
    },
    tagline: {
      // TIM-2333: was hardcoded platform mint (#D4ECD7) which leaked even when
      // the user picked a non-teal accent. Sits on the accent block, so a
      // softened paper-on-accent tint works for any accent the user picks.
      fontFamily: "Inter",
      fontSize: 13,
      color: brand.colors.paper,
      opacity: 0.85,
      textAlign: "center",
    },
    whiteBlock: {
      flex: 1,
      backgroundColor: brand.colors.paper,
      paddingHorizontal: 56,
      paddingTop: 40,
      paddingBottom: 48,
    },
    metaLabel: {
      fontFamily: "Inter",
      fontSize: 10,
      color: brand.colors.muted,
      marginBottom: 3,
    },
    metaValue: {
      fontFamily: "Inter",
      fontSize: 13,
      fontWeight: "600",
      color: brand.colors.ink,
      marginBottom: 16,
    },
    date: {
      fontFamily: "Inter",
      fontSize: 10,
      color: brand.colors.muted,
      marginTop: 8,
    },
    accentSquare: {
      position: "absolute",
      bottom: 40,
      right: 48,
      width: 48,
      height: 8,
    },
  });
}

function EditorialCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo, brand = BRAND } = props;
  const editS = makeEditorialStyles(brand);
  const ac = accent(props);

  return (
    <Page size={brand.page.size} style={editS.page}>
      {/* Full-bleed header block */}
      <View style={[editS.greenBlock, { backgroundColor: ac }]}>
        {logo ? (
          <Image
            src={{ data: logo.data, format: logo.format }}
            style={editS.logo}
          />
        ) : null}
        <Text style={editS.shopName}>{shopName}</Text>
        <Text style={editS.subtitle}>Business Plan</Text>
        {tagline ? <Text style={editS.tagline}>{tagline}</Text> : null}
      </View>

      {/* White metadata block */}
      <View style={editS.whiteBlock}>
        {preparedFor ? (
          <>
            <Text style={editS.metaLabel}>Prepared for</Text>
            <Text style={editS.metaValue}>{preparedFor}</Text>
          </>
        ) : null}
        {authorName ? (
          <>
            <Text style={editS.metaLabel}>Prepared by</Text>
            <Text style={editS.metaValue}>{authorName}</Text>
          </>
        ) : null}
        <Text style={editS.date}>{date}</Text>
      </View>

      {/* Accent square — bottom-right absolute */}
      <View style={[editS.accentSquare, { backgroundColor: ac }]} />
    </Page>
  );
}
