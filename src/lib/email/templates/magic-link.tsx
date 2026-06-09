// TIM-2366 #8: Magic link sign-in — built but feature-flagged off.
//
// Dispatch will refuse to send unless NEXT_PUBLIC_FEATURE_MAGIC_LINK is on, so
// the template can land in the repo before passwordless launches without any
// risk of accidental sends.

import * as React from 'react';
import {
  EmailBody,
  EmailButton,
  EmailFooter,
  EmailH1,
  EmailHeader,
  EmailLayout,
  EmailP,
  EmailSpacer,
} from '../../../components/email/index.ts';
import {
  sendTransactionalEmail,
  type TransactionalSendResult,
} from '../resend-dispatch.ts';
import { greetingLine } from './_common.ts';

export interface MagicLinkProps {
  firstName?: string | null;
  magicLinkUrl: string;
  expiryMinutes?: number;
}

const SUBJECT = 'Your Groundwork sign-in link';
const PREVIEW = 'Tap to sign in without a password.';

export function MagicLinkTemplate({
  firstName,
  magicLinkUrl,
  expiryMinutes = 15,
}: MagicLinkProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Sign in to Groundwork</EmailH1>
        <EmailP>
          Tap the button below to sign in. The link is good for{' '}
          {expiryMinutes} minutes.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={magicLinkUrl}>Sign in</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Didn&apos;t request this? You can safely ignore this email.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderMagicLinkText(props: MagicLinkProps): string {
  return [
    greetingLine(props.firstName),
    '',
    'Tap to sign in to Groundwork.',
    `The link is good for ${props.expiryMinutes ?? 15} minutes:`,
    '',
    props.magicLinkUrl,
    '',
    "Didn't request this? You can safely ignore this email.",
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendMagicLinkEmail(args: {
  to: string;
  userId: string;
  props: MagicLinkProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <MagicLinkTemplate {...args.props} />,
    text: renderMagicLinkText(args.props),
    refId: `tim2366-magic-${args.userId}-${Date.now()}`,
    featureFlag: 'magic_link',
  });
}
