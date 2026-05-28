// TIM-1225: Business Plan cover-template registry + renderCover().
// Three templates: Classic (centered serif), Modern (left-band), Editorial (full-bleed green header).
// Design spec: TIM-1224 spec document.

import React from "react";
import { Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

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
    description: "Bold full-bleed green header — confident, modern, presentation-ready.",
  },
];

export function renderCover(templateId: string, props: CoverProps): React.ReactElement {
  const id = (templateId as CoverTemplateId) ?? "classic";
  switch (id) {
    case "modern":
      return <ModernCover {...props} />;
    case "editorial":
      return <EditorialCover {...props} />;
    default:
      return <ClassicCover {...props} />;
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function accent(props: CoverProps): string {
  return props.accentColor ?? "#E8C24A";
}

// ── Template 1: Classic ───────────────────────────────────────────────────────

const classicS = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 56,
    paddingTop: 0,
    paddingBottom: 0,
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
    fontFamily: "Source Serif Pro",
    fontSize: 36,
    fontWeight: "bold",
    color: "#1A6E3B",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Source Serif Pro",
    fontSize: 22,
    color: "#333333",
    textAlign: "center",
    marginBottom: 10,
  },
  nameGap: { marginBottom: 12 },
  tagline: {
    fontFamily: "Inter",
    fontSize: 13,
    fontStyle: "italic",
    color: "#666666",
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
    color: "#888888",
    marginRight: 4,
  },
  metaValue: {
    fontFamily: "Inter",
    fontSize: 11,
    fontWeight: "600",
    color: "#333333",
  },
  date: {
    fontFamily: "Inter",
    fontSize: 11,
    color: "#888888",
    marginBottom: 0,
  },
  bottomBar: {
    width: "100%",
    height: 4,
  },
});

function ClassicCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo } = props;
  const ac = accent(props);
  const logoZoneHeight = logo ? 120 : 40;

  return (
    <Page size="LETTER" style={classicS.page}>
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
      <Text style={classicS.shopName}>{shopName}</Text>
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

const modernS = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
  },
  stripe: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: 6,
    backgroundColor: "#1A6E3B",
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
    fontFamily: "Source Serif Pro",
    fontSize: 44,
    fontWeight: "bold",
    color: "#1A6E3B",
    lineHeight: 1.1,
    marginBottom: 14,
  },
  subtitle: {
    fontFamily: "Inter",
    fontSize: 18,
    color: "#555555",
    marginBottom: 10,
  },
  tagline: {
    fontFamily: "Inter",
    fontSize: 13,
    fontStyle: "italic",
    color: "#888888",
    marginBottom: 14,
  },
  spacer: {
    flex: 1,
  },
  metaLabel: {
    fontFamily: "Inter",
    fontSize: 10,
    color: "#888888",
    marginBottom: 2,
  },
  metaValue: {
    fontFamily: "Inter",
    fontSize: 12,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 12,
  },
  date: {
    fontFamily: "Inter",
    fontSize: 10,
    color: "#888888",
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
    color: "#CCCCCC",
  },
});

function ModernCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo } = props;
  const ac = accent(props);

  return (
    <Page size="LETTER" style={modernS.page}>
      {/* Left vertical stripe */}
      <View style={modernS.stripe} />

      {/* Main content area */}
      <View style={modernS.content}>
        <Text style={modernS.shopName}>{shopName}</Text>
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

const editS = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    flexDirection: "column",
  },
  greenBlock: {
    width: "100%",
    height: 356,
    backgroundColor: "#1A6E3B",
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
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: "Source Serif Pro",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 12,
  },
  tagline: {
    fontFamily: "Inter",
    fontSize: 13,
    color: "#D4E8DF",
    textAlign: "center",
  },
  whiteBlock: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 56,
    paddingTop: 40,
    paddingBottom: 48,
  },
  metaLabel: {
    fontFamily: "Inter",
    fontSize: 10,
    color: "#888888",
    marginBottom: 3,
  },
  metaValue: {
    fontFamily: "Inter",
    fontSize: 13,
    fontWeight: "600",
    color: "#333333",
    marginBottom: 16,
  },
  date: {
    fontFamily: "Inter",
    fontSize: 10,
    color: "#888888",
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

function EditorialCover(props: CoverProps) {
  const { shopName, tagline, preparedFor, authorName, date, logo } = props;
  const ac = accent(props);

  return (
    <Page size="LETTER" style={editS.page}>
      {/* Full-bleed green header */}
      <View style={editS.greenBlock}>
        {logo ? (
          <Image
            src={{ data: logo.data, format: logo.format }}
            style={editS.logo}
          />
        ) : null}
        <Text style={editS.shopName}>{shopName}</Text>
        <Text style={[editS.subtitle, { color: ac }]}>Business Plan</Text>
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
