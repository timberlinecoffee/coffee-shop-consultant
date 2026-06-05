// TIM-2362 + TIM-2366: shared design tokens and brand identity for all
// Groundwork email templates (Resend transactional + Klaviyo lifecycle).
// Matches the live Groundwork UI token set from TIM-1537.

export const colors = {
  teal: '#155e63',
  tealDark: '#0e4448',
  sage: '#76b39d',
  background: '#faf9f7',
  card: '#ffffff',
  foreground: '#1a1a1a',
  mutedForeground: '#6b6b6b',
  tertiary: '#9a9a9a',
  border: '#efefef',
  borderSubtle: '#E5E5E0',
} as const;

export const font = {
  family:
    "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  sizes: {
    h1: '24px',
    h2: '20px',
    body: '15px',
    small: '13px',
    caption: '12px',
  },
  lineHeights: {
    heading: '1.3',
    body: '1.6',
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const spacing = {
  containerMaxWidth: '600px',
  bodyPaddingX: '40px',
  bodyPaddingY: '32px',
  sectionGap: '24px',
  componentPadding: '16px',
} as const;

export const LOGO_URL =
  'https://app.groundwork.coffee/brand/groundwork-logo-color.png';
export const LOGO_WIDTH = 140;
export const LOGO_HEIGHT = 35;

// TIM-2366 / Email Comms Plan §3 — transactional sender identity on
// groundwork.cafe. Overridable via env-vars so the bootstrap window can run
// from the legacy timberline.coffee mailbox while groundwork.cafe finishes
// Resend DKIM verification.
export const TRANSACTIONAL_FROM = 'Groundwork <noreply@groundwork.cafe>';
export const TRANSACTIONAL_REPLY_TO = 'support@groundwork.cafe';
export const SUPPORT_EMAIL = 'support@groundwork.cafe';
