// TIM-2366 #25: Credit balance low — fires when balance drops below 10.
//
// One-shot per calendar month at the row level — the credit-balance monitor in
// src/lib/billing/credit-balance-monitor.ts is responsible for dedup so we don't
// re-fire on every API call that consumes a fraction of a credit.

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

export interface CreditBalanceLowProps {
  firstName?: string | null;
  currentBalance: number;
  buyMoreUrl: string;
}

const SUBJECT = 'Your Groundwork credit balance is running low';
const PREVIEW = 'Top up before your next run.';

export function CreditBalanceLowTemplate({
  firstName,
  currentBalance,
  buyMoreUrl,
}: CreditBalanceLowProps) {
  const safeBalance = Math.max(0, Math.floor(currentBalance));
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Heads up: your credits are running low</EmailH1>
        <EmailP>
          You have <strong>{safeBalance}</strong>{' '}
          {safeBalance === 1 ? 'credit' : 'credits'} left on your Groundwork
          account. Long generations and deep research can each use several at
          once.
        </EmailP>
        <EmailP>
          Top up so the next workspace run doesn&apos;t stall:
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={buyMoreUrl}>Buy more credits</EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          You will receive this notice at most once per month. Cancel anytime
          from Settings &gt; Billing.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderCreditBalanceLowText(
  props: CreditBalanceLowProps,
): string {
  const safeBalance = Math.max(0, Math.floor(props.currentBalance));
  return [
    greetingLine(props.firstName),
    '',
    `You have ${safeBalance} ${safeBalance === 1 ? 'credit' : 'credits'} left on your Groundwork account.`,
    'Long generations and deep research can each use several at once.',
    '',
    'Top up to avoid a stall on your next workspace run:',
    '',
    props.buyMoreUrl,
    '',
    'You will receive this notice at most once per month. Cancel anytime from Settings > Billing.',
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendCreditBalanceLowEmail(args: {
  to: string;
  userId: string;
  monthKey: string; // e.g. "2026-06" — used as Resend dedupe hint.
  props: CreditBalanceLowProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <CreditBalanceLowTemplate {...args.props} />,
    text: renderCreditBalanceLowText(args.props),
    refId: `tim2366-credits-${args.userId}-${args.monthKey}`,
  });
}
