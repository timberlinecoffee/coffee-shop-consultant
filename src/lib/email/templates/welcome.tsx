// TIM-2366 #5: Welcome (Trial Day 0) — single source of truth.
//
// IMPORTANT: this email is the ONLY Day-0 welcome. Klaviyo's Day-0 trigger is
// intentionally suppressed (or rebound to a ~6h "quick wins" follow-up) — see
// the marketing subtask TIM-2365. Sending both would land two welcomes in the
// user's inbox within minutes.

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

export interface WelcomeEmailProps {
  firstName?: string | null;
  dashboardUrl: string;
}

const SUBJECT = 'Your Groundwork trial is live';
const PREVIEW = 'Your trial is live. Three things to do first.';

export function WelcomeEmailTemplate({
  firstName,
  dashboardUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader eyebrow="Trial Day 0" />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Your trial is live</EmailH1>
        <EmailP>
          Your 7-day trial is live. Here are three places to start so you get
          real value out of the next week:
        </EmailP>
        <EmailP>
          1. Build a Business Plan in the workspace — drop your shop concept in
          and let the AI fill out the lender-ready sections.
        </EmailP>
        <EmailP>
          2. Run a Deep Research dive on your local market — pricing,
          competitor menus, foot-traffic.
        </EmailP>
        <EmailP>
          3. Use a credit on a question you would otherwise stall on. That is
          what they are for.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={dashboardUrl}>Open my workspace</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Reply to this email if anything is in the way. Trent reads every reply.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderWelcomeEmailText(props: WelcomeEmailProps): string {
  return [
    greetingLine(props.firstName),
    '',
    'Welcome to Groundwork.',
    '',
    'Your 7-day trial is live. Three places to start:',
    '',
    '1. Build a Business Plan in the workspace.',
    '2. Run a Deep Research dive on your local market.',
    '3. Use a credit on a question you would otherwise stall on.',
    '',
    `Open my workspace: ${props.dashboardUrl}`,
    '',
    'Reply to this email if anything is in the way. Trent reads every reply.',
    '',
    'Trent',
    'Groundwork',
  ].join('\n');
}

export async function sendWelcomeEmail(args: {
  to: string;
  userId: string;
  props: WelcomeEmailProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <WelcomeEmailTemplate {...args.props} />,
    text: renderWelcomeEmailText(args.props),
    refId: `tim2366-welcome-${args.userId}`,
  });
}
