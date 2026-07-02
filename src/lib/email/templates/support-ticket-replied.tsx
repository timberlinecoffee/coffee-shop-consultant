// TIM-2366 #35: Support ticket replied — fired when CSM responds.

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

export interface SupportTicketRepliedProps {
  firstName?: string | null;
  ticketId: string;
  subjectLine: string;
  threadUrl: string;
  replySnippet?: string;
  agentName?: string;
}

const PREVIEW = 'Open the thread to read the full reply.';

export function SupportTicketRepliedTemplate({
  firstName,
  ticketId,
  subjectLine,
  threadUrl,
  replySnippet,
  agentName,
}: SupportTicketRepliedProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader eyebrow="Support" />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>You have a reply on your support ticket</EmailH1>
        <EmailP>
          {agentName ? <strong>{agentName}</strong> : 'Our support team'}{' '}
          replied to <strong>{subjectLine}</strong> (ticket{' '}
          <code style={{ fontFamily: 'monospace' }}>{ticketId}</code>).
        </EmailP>
        {replySnippet ? (
          <EmailP small muted>
            &ldquo;{replySnippet}&rdquo;
          </EmailP>
        ) : null}
        <EmailSpacer height={4} />
        <EmailButton href={threadUrl}>Open Thread</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Reply directly to this email to continue the conversation.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderSupportTicketRepliedText(
  props: SupportTicketRepliedProps,
): string {
  return [
    greetingLine(props.firstName),
    '',
    `${props.agentName ?? 'Our support team'} replied to "${props.subjectLine}" (ticket ${props.ticketId}).`,
    props.replySnippet ? `"${props.replySnippet}"` : '',
    '',
    `Open thread: ${props.threadUrl}`,
    '',
    'Reply directly to this email to continue the conversation.',
    '',
    'Groundwork',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendSupportTicketRepliedEmail(args: {
  to: string;
  userId: string;
  replyId: string;
  props: SupportTicketRepliedProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: `Re: ${args.props.subjectLine}`,
    preview: PREVIEW,
    react: <SupportTicketRepliedTemplate {...args.props} />,
    text: renderSupportTicketRepliedText(args.props),
    refId: `tim2366-support-reply-${args.userId}-${args.replyId}`,
  });
}
