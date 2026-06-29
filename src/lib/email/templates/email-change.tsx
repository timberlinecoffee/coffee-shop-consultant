// TIM-2366 #7: Email change confirmation — confirms a pending address swap.

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

export interface EmailChangeProps {
  firstName?: string | null;
  oldEmail: string;
  newEmail: string;
  confirmUrl: string;
}

const SUBJECT = 'Confirm your new Groundwork email address';
const PREVIEW = 'Confirm the change so we can stop emailing the old address.';

export function EmailChangeTemplate({
  firstName,
  oldEmail,
  newEmail,
  confirmUrl,
}: EmailChangeProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Confirm your email change</EmailH1>
        <EmailP>
          You asked to change the email on your Groundwork account from{' '}
          <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>. Tap below
          to confirm the change.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={confirmUrl}>Confirm new email</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Didn&apos;t make this change? Reply to this email and we will lock the
          account.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderEmailChangeText(props: EmailChangeProps): string {
  return [
    greetingLine(props.firstName),
    '',
    `You asked to change the email on your Groundwork account from ${props.oldEmail} to ${props.newEmail}.`,
    'Confirm the change:',
    '',
    props.confirmUrl,
    '',
    "Didn't make this change? Reply and we will lock the account.",
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendEmailChangeEmail(args: {
  to: string;
  userId: string;
  props: EmailChangeProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <EmailChangeTemplate {...args.props} />,
    text: renderEmailChangeText(args.props),
    refId: `tim2366-emailchange-${args.userId}`,
  });
}
