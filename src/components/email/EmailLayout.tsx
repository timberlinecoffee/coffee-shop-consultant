import * as React from 'react';
import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Preview,
} from '@react-email/components';
import { colors, font, spacing } from './tokens.ts';

interface EmailLayoutProps {
  children: React.ReactNode;
  preview?: string;
}

export function EmailLayout({ children, preview }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Poppins"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/poppins/v23/pxiEyp8kv8JHgFVrJJfecg.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Poppins"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/poppins/v23/pxiByp8kv8JHgFVrLGT9Z11lFd2JQEk.woff2',
            format: 'woff2',
          }}
          fontWeight={500}
          fontStyle="normal"
        />
        <Font
          fontFamily="Poppins"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/poppins/v23/pxiByp8kv8JHgFVrLGT9Z1xlFd2JQEk.woff2',
            format: 'woff2',
          }}
          fontWeight={600}
          fontStyle="normal"
        />
        <Font
          fontFamily="Poppins"
          fallbackFontFamily={['Arial', 'Helvetica', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/poppins/v23/pxiByp8kv8JHgFVrLDD4Z1xlFd2JQEk.woff2',
            format: 'woff2',
          }}
          fontWeight={700}
          fontStyle="normal"
        />
      </Head>
      {preview && <Preview>{preview}</Preview>}
      <Body
        style={{
          backgroundColor: colors.background,
          margin: 0,
          padding: '32px 16px',
          fontFamily: font.family,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <Container
          style={{
            maxWidth: spacing.containerMaxWidth,
            margin: '0 auto',
            backgroundColor: colors.background,
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}
