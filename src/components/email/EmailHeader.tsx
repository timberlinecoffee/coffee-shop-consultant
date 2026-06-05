import * as React from 'react';
import { Img, Row, Section, Text } from '@react-email/components';
import { colors, font, LOGO_URL, LOGO_WIDTH, LOGO_HEIGHT } from './tokens';

interface EmailHeaderProps {
  eyebrow?: string;
  logoUrl?: string;
}

export function EmailHeader({
  eyebrow,
  logoUrl = LOGO_URL,
}: EmailHeaderProps) {
  return (
    <Section
      style={{
        padding: '24px 40px 20px',
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <Row>
        <Img
          src={logoUrl}
          alt="Groundwork"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          style={{ display: 'block' }}
        />
      </Row>
      {eyebrow && (
        <Row style={{ marginTop: '10px' }}>
          <Text
            style={{
              margin: 0,
              fontSize: font.sizes.caption,
              fontWeight: font.weights.semibold,
              color: colors.teal,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {eyebrow}
          </Text>
        </Row>
      )}
    </Section>
  );
}
