// TIM-2366 #4: Verify-email transactional template.
// Triggered by Supabase Auth on signup (or via direct call when overriding the
// default Supabase Auth verify-email template).

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

export interface VerifyEmailProps {
  firstName?: string | null;
  verifyUrl: string;
}

const SUBJECT = 'Confirm your Groundwork email';
const PREVIEW = 'One click to start your free trial.';

export function VerifyEmailTemplate({
  firstName,
  verifyUrl,
}: VerifyEmailProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Confirm your email</EmailH1>
        <EmailP>
          Welcome to Groundwork. Tap the button below to confirm your email and
          start your trial. The link works for the next 24 hours.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={verifyUrl}>Confirm Email</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Didn&apos;t sign up? You can ignore this email and nothing will happen.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderVerifyEmailText(props: VerifyEmailProps): string {
  return [
    greetingLine(props.firstName),
    '',
    'Welcome to Groundwork. Confirm your email to start your trial.',
    'The link works for the next 24 hours:',
    '',
    props.verifyUrl,
    '',
    "Didn't sign up? You can ignore this email.",
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendVerifyEmail(args: {
  to: string;
  userId: string;
  props: VerifyEmailProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <VerifyEmailTemplate {...args.props} />,
    text: renderVerifyEmailText(args.props),
    refId: `tim2366-verify-${args.userId}`,
  });
}
