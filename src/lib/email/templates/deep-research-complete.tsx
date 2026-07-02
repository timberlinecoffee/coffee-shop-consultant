// TIM-2366 #32: Deep Research complete — Pro feature notification.

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

export interface DeepResearchCompleteProps {
  firstName?: string | null;
  topic: string;
  reportUrl: string;
  sourceCount?: number;
}

const SUBJECT = 'Your Deep Research report is ready';
const PREVIEW = 'Sources synthesized. Read the report.';

export function DeepResearchCompleteTemplate({
  firstName,
  topic,
  reportUrl,
  sourceCount,
}: DeepResearchCompleteProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader eyebrow="Deep Research" />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Your research is in</EmailH1>
        <EmailP>
          The Deep Research run for <strong>{topic}</strong> finished.
          {sourceCount
            ? ` ${sourceCount} sources were read and the findings are synthesized into a single report.`
            : ' The findings are synthesized into a single report.'}
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={reportUrl}>Open Report</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Reports live in your workspace and stay searchable. You can hand them
          to a partner or a banker.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderDeepResearchCompleteText(
  props: DeepResearchCompleteProps,
): string {
  const sources =
    props.sourceCount
      ? `${props.sourceCount} sources were read and synthesized.`
      : 'The findings are synthesized into a single report.';
  return [
    greetingLine(props.firstName),
    '',
    `The Deep Research run for "${props.topic}" finished.`,
    sources,
    '',
    `Open report: ${props.reportUrl}`,
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendDeepResearchCompleteEmail(args: {
  to: string;
  userId: string;
  runId: string;
  props: DeepResearchCompleteProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <DeepResearchCompleteTemplate {...args.props} />,
    text: renderDeepResearchCompleteText(args.props),
    refId: `tim2366-research-${args.userId}-${args.runId}`,
  });
}
