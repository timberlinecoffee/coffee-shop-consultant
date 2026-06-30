// TIM-2366 #6: Password reset — overrides Supabase Auth's default reset email.

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

export interface PasswordResetProps {
  firstName?: string | null;
  resetUrl: string;
  expiryMinutes?: number;
}

const SUBJECT = 'Reset your Groundwork password';
const PREVIEW = 'One link to set a new password.';

export function PasswordResetTemplate({
  firstName,
  resetUrl,
  expiryMinutes = 60,
}: PasswordResetProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Reset your password</EmailH1>
        <EmailP>
          We received a request to reset the password on your Groundwork
          account. Tap below to choose a new one. The link is good for{' '}
          {expiryMinutes} minutes.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={resetUrl}>Set new password</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Didn&apos;t request this? You can safely ignore this email. Your
          password is unchanged.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderPasswordResetText(props: PasswordResetProps): string {
  return [
    greetingLine(props.firstName),
    '',
    'We received a request to reset the password on your Groundwork account.',
    `The link below is good for ${props.expiryMinutes ?? 60} minutes:`,
    '',
    props.resetUrl,
    '',
    "Didn't request this? You can safely ignore this email.",
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendPasswordResetEmail(args: {
  to: string;
  userId: string;
  props: PasswordResetProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <PasswordResetTemplate {...args.props} />,
    text: renderPasswordResetText(args.props),
    refId: `tim2366-reset-${args.userId}`,
  });
}
