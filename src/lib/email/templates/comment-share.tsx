// TIM-2366 #33: Comment / share notification — built but feature-flagged off
// until sharing ships. Dispatch refuses to send unless
// NEXT_PUBLIC_FEATURE_SHARING is on.

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

export type CommentShareKind = 'shared' | 'commented';

export interface CommentShareProps {
  firstName?: string | null;
  actorName: string;
  kind: CommentShareKind;
  planTitle: string;
  contextUrl: string;
  commentSnippet?: string;
}

function subjectFor(kind: CommentShareKind, actorName: string): string {
  return kind === 'shared'
    ? `${actorName} shared a plan with you`
    : `${actorName} commented on your plan`;
}

const PREVIEW = 'Open the thread in your workspace.';

export function CommentShareTemplate({
  firstName,
  actorName,
  kind,
  planTitle,
  contextUrl,
  commentSnippet,
}: CommentShareProps) {
  const verb = kind === 'shared' ? 'shared' : 'left a comment on';
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>
          {actorName} {verb} a plan
        </EmailH1>
        <EmailP>
          <strong>{actorName}</strong> {verb}{' '}
          <strong>{planTitle}</strong>.
        </EmailP>
        {commentSnippet ? (
          <EmailP small muted>
            &ldquo;{commentSnippet}&rdquo;
          </EmailP>
        ) : null}
        <EmailSpacer height={4} />
        <EmailButton href={contextUrl}>
          {kind === 'shared' ? 'Open shared plan' : 'View comment'}
        </EmailButton>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderCommentShareText(props: CommentShareProps): string {
  const verb = props.kind === 'shared' ? 'shared' : 'left a comment on';
  return [
    greetingLine(props.firstName),
    '',
    `${props.actorName} ${verb} ${props.planTitle}.`,
    props.commentSnippet ? `"${props.commentSnippet}"` : '',
    '',
    `Open: ${props.contextUrl}`,
    '',
    'Groundwork',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function sendCommentShareEmail(args: {
  to: string;
  userId: string;
  notificationId: string;
  props: CommentShareProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: subjectFor(args.props.kind, args.props.actorName),
    preview: PREVIEW,
    react: <CommentShareTemplate {...args.props} />,
    text: renderCommentShareText(args.props),
    refId: `tim2366-share-${args.userId}-${args.notificationId}`,
    featureFlag: 'share_notification',
  });
}
