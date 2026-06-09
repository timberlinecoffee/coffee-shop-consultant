import * as React from 'react';
import { Hr, Link, Section, Text } from '@react-email/components';
import { colors, font, SUPPORT_EMAIL } from './tokens.ts';

interface EmailFooterProps {
  variant: 'marketing' | 'transactional';
  unsubscribeUrl?: string;
  supportEmail?: string;
}

const captionStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontSize: font.sizes.caption,
  color: colors.mutedForeground,
  lineHeight: '1.5',
};

export function EmailFooter({
  variant,
  unsubscribeUrl = '{{ unsubscribe_url }}',
  supportEmail = SUPPORT_EMAIL,
}: EmailFooterProps) {
  const year = new Date().getFullYear();

  return (
    <Section style={{ padding: '16px 40px 32px' }}>
      <Hr style={{ borderColor: colors.border, margin: '0 0 16px 0' }} />
      <Text style={captionStyle}>
        &copy; {year} Timberline Coffee LLC. All rights reserved.
      </Text>
      {variant === 'marketing' ? (
        <Text style={{ ...captionStyle, margin: 0 }}>
          <Link href={unsubscribeUrl} style={{ color: colors.mutedForeground }}>
            Unsubscribe
          </Link>
          {' · '}
          You received this because you signed up for Groundwork.
        </Text>
      ) : (
        <Text style={{ ...captionStyle, margin: 0 }}>
          Questions?{' '}
          <Link
            href={`mailto:${supportEmail}`}
            style={{ color: colors.teal }}
          >
            {supportEmail}
          </Link>
        </Text>
      )}
    </Section>
  );
}
