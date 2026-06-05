// TIM-2315: render the markdown content stored in business_plan_sections.user_content
// (and AI-generated autoContent) as styled @react-pdf/renderer blocks instead of
// dumping raw `##` / `**` text on the page.
//
// Intentionally small and dependency-free: supports the subset our content
// pipeline emits — ATX headings (## / ###), bullet/numeric lists, **bold**,
// *italic*, and blank-line paragraph breaks. Anything else falls through as
// body text so we never lose content.

import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { BrandTokens } from "../brand";

type Props = {
  content: string;
  brand: BrandTokens;
  accentColor?: string | null;
};

type InlineSpan = { text: string; bold?: boolean; italic?: boolean };

function parseInline(line: string): InlineSpan[] {
  const out: InlineSpan[] = [];
  let i = 0;
  let buf = "";
  const flush = (extra?: Partial<InlineSpan>) => {
    if (buf) out.push({ text: buf, ...extra });
    buf = "";
  };
  while (i < line.length) {
    if (line.startsWith("**", i)) {
      const end = line.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ text: line.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }
    if (line[i] === "*" && line[i + 1] !== "*" && line[i - 1] !== "*") {
      const end = line.indexOf("*", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ text: line.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return out;
}

function renderInline(spans: InlineSpan[], baseStyle: Style): React.ReactNode {
  return spans.map((s, i) => {
    const styles: Style[] = [baseStyle];
    if (s.bold) styles.push({ fontWeight: 700 });
    if (s.italic) styles.push({ fontStyle: "italic" });
    return (
      <Text key={i} style={styles}>
        {s.text}
      </Text>
    );
  });
}

export function MarkdownBlocks({ content, brand, accentColor }: Props) {
  const headingColor = accentColor || brand.colors.primary;
  const S = StyleSheet.create({
    h2: {
      fontFamily: brand.fonts.serif,
      fontSize: 13,
      fontWeight: 600,
      color: headingColor,
      marginTop: 12,
      marginBottom: 4,
    },
    h3: {
      fontFamily: brand.fonts.sans,
      fontSize: 10.5,
      fontWeight: 600,
      color: brand.colors.ink,
      marginTop: 8,
      marginBottom: 2,
    },
    p: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      lineHeight: 1.55,
      marginBottom: 8,
    },
    bulletRow: {
      flexDirection: "row",
      marginBottom: 3,
      paddingLeft: 4,
    },
    bullet: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      width: 12,
      lineHeight: 1.55,
    },
    bulletText: {
      flex: 1,
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      lineHeight: 1.55,
    },
  });

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const text = paraBuf.join(" ").trim();
    paraBuf = [];
    if (!text) return;
    blocks.push(
      <Text key={`p-${blocks.length}`} style={S.p}>
        {renderInline(parseInline(text), S.p)}
      </Text>
    );
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const raw = lines[idx];
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      flushPara();
      blocks.push(
        <Text key={`h3-${idx}`} style={S.h3}>
          {renderInline(parseInline(h3[1]), S.h3)}
        </Text>
      );
      continue;
    }
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushPara();
      blocks.push(
        <Text key={`h2-${idx}`} style={S.h2}>
          {renderInline(parseInline(h2[1]), S.h2)}
        </Text>
      );
      continue;
    }
    const h1 = /^#\s+(.+)$/.exec(line);
    if (h1) {
      flushPara();
      // Demote h1 to h2 — the section page already has its own H1 (sectionTitle)
      // and we never want a second visual title competing with it.
      blocks.push(
        <Text key={`h1-${idx}`} style={S.h2}>
          {renderInline(parseInline(h1[1]), S.h2)}
        </Text>
      );
      continue;
    }
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      blocks.push(
        <View key={`ul-${idx}`} style={S.bulletRow} wrap={false}>
          <Text style={S.bullet}>•</Text>
          <Text style={S.bulletText}>
            {renderInline(parseInline(ul[1]), S.bulletText)}
          </Text>
        </View>
      );
      continue;
    }
    const ol = /^(\d+)\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      blocks.push(
        <View key={`ol-${idx}`} style={S.bulletRow} wrap={false}>
          <Text style={S.bullet}>{ol[1]}.</Text>
          <Text style={S.bulletText}>
            {renderInline(parseInline(ol[2]), S.bulletText)}
          </Text>
        </View>
      );
      continue;
    }

    paraBuf.push(line);
  }
  flushPara();

  return <>{blocks}</>;
}
