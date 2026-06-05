import * as React from 'react';
import { Button } from '@react-email/components';
import { colors, font } from './tokens';

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}

export function EmailButton({
  href,
  children,
  variant = 'primary',
}: EmailButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Button
      href={href}
      style={{
        display: 'inline-block',
        backgroundColor: isPrimary ? colors.teal : 'transparent',
        color: isPrimary ? '#ffffff' : colors.teal,
        borderRadius: '12px',
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: '20px',
        paddingRight: '20px',
        fontSize: font.sizes.body,
        fontWeight: font.weights.medium,
        lineHeight: '1',
        textDecoration: 'none',
        border: isPrimary ? `2px solid ${colors.teal}` : `2px solid ${colors.teal}`,
        cursor: 'pointer',
        fontFamily: font.family,
      }}
    >
      {children}
    </Button>
  );
}
