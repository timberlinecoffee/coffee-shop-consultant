// TIM-2366: shared body-section primitives used by every transactional template.
// Keeps typography + spacing consistent so per-template files only deal with copy.

import * as React from 'react';
import { Heading, Section, Text } from '@react-email/components';
import { colors, font, spacing } from './tokens.ts';

interface EmailBodyProps {
  children: React.ReactNode;
}

export function EmailBody({ children }: EmailBodyProps) {
  return (
    <Section
      style={{
        padding: `${spacing.bodyPaddingY} ${spacing.bodyPaddingX}`,
        backgroundColor: colors.card,
      }}
    >
      {children}
    </Section>
  );
}

export function EmailH1({ children }: { children: React.ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        margin: '0 0 16px 0',
        fontFamily: font.family,
        fontSize: font.sizes.h1,
        fontWeight: font.weights.semibold,
        lineHeight: font.lineHeights.heading,
        color: colors.foreground,
      }}
    >
      {children}
    </Heading>
  );
}

export function EmailP({
  children,
  small = false,
  muted = false,
}: {
  children: React.ReactNode;
  small?: boolean;
  muted?: boolean;
}) {
  return (
    <Text
      style={{
        margin: '0 0 14px 0',
        fontFamily: font.family,
        fontSize: small ? font.sizes.small : font.sizes.body,
        lineHeight: font.lineHeights.body,
        color: muted ? colors.mutedForeground : colors.foreground,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailSpacer({ height = 8 }: { height?: number }) {
  return <div style={{ height: `${height}px` }} />;
}
