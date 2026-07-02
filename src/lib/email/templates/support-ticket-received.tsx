// TIM-2366 #34: Support ticket received (auto-ack). Mirrors the copy CSM is
// using on TIM-2349 so user-visible language stays consistent across the stack.

import * as React from 'react';
import {
  EmailBody,
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

export interface SupportTicketReceivedProps {
  firstName?: string | null;
  ticketId: string;
  subjectLine: string;
}

const PREVIEW = 'A human will respond within one business day.';

export function SupportTicketReceivedTemplate({
  firstName,
  ticketId,
  subjectLine,
}: SupportTicketReceivedProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader eyebrow="Support" />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>We got your message</EmailH1>
        <EmailP>
          Your support request{' '}
          <strong>{subjectLine}</strong> (ticket{' '}
          <code style={{ fontFamily: 'monospace' }}>{ticketId}</code>) is in the
          queue. A human will reply within one business day. Usually faster.
        </EmailP>
        <EmailSpacer height={8} />
        <EmailP small muted>
          You can reply directly to this email to add more context to the same
          ticket.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderSupportTicketReceivedText(
  props: SupportTicketReceivedProps,
): string {
  return [
    greetingLine(props.firstName),
    '',
    `Your support request "${props.subjectLine}" (ticket ${props.ticketId}) is in the queue.`,
    'A human will reply within one business day. Usually faster.',
    '',
    'You can reply directly to this email to add more context to the same ticket.',
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendSupportTicketReceivedEmail(args: {
  to: string;
  userId: string;
  props: SupportTicketReceivedProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: `Re: ${args.props.subjectLine}`,
    preview: PREVIEW,
    react: <SupportTicketReceivedTemplate {...args.props} />,
    text: renderSupportTicketReceivedText(args.props),
    refId: `tim2366-support-recv-${args.userId}-${args.props.ticketId}`,
  });
}
