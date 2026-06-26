// TIM-2366: small helpers shared across all transactional template senders.

export function greetingLine(firstName: string | null | undefined): string {
  return firstName ? `Hi ${firstName},` : 'Hi there,';
}

export function ensureHttpsBaseUrl(maybeUrl: string | null | undefined): string {
  // Used by templates that build absolute URLs from a configurable base.
  // Falls back to the live prod origin if unset / blank.
  const raw = (maybeUrl ?? '').replace(/\n/g, '').trim();
  if (!raw) return 'https://app.groundwork.coffee';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }
  return `https://${raw}`.replace(/\/+$/, '');
}
