// TIM-2366 #31: Business plan export ready — fires when the PDF render
// pipeline finishes and the signed URL is available.

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

export interface BusinessPlanExportReadyProps {
  firstName?: string | null;
  planTitle: string;
  exportUrl: string;
  expiresAtIso: string;
  sizeKb?: number;
}

const SUBJECT = 'Your Business Plan PDF is ready';
const PREVIEW = 'Download — the link expires in 24 hours.';

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toUTCString();
}

export function BusinessPlanExportReadyTemplate({
  firstName,
  planTitle,
  exportUrl,
  expiresAtIso,
  sizeKb,
}: BusinessPlanExportReadyProps) {
  return (
    <EmailLayout preview={PREVIEW}>
      <EmailHeader eyebrow="Business Plan" />
      <EmailBody>
        <EmailP>{greetingLine(firstName)}</EmailP>
        <EmailH1>Your Business Plan is ready to download</EmailH1>
        <EmailP>
          <strong>{planTitle}</strong> finished rendering. Download the PDF
          below. The link works for 24 hours; request a new export from your
          workspace if you miss it.
        </EmailP>
        <EmailSpacer height={4} />
        <EmailButton href={exportUrl}>
          Download PDF{sizeKb ? ` (${sizeKb} KB)` : ''}
        </EmailButton>
        <EmailSpacer height={12} />
        <EmailP small muted>
          Link expires {formatExpiry(expiresAtIso)}.
        </EmailP>
      </EmailBody>
      <EmailFooter variant="transactional" />
    </EmailLayout>
  );
}

export function renderBusinessPlanExportReadyText(
  props: BusinessPlanExportReadyProps,
): string {
  return [
    greetingLine(props.firstName),
    '',
    `Your Business Plan "${props.planTitle}" is ready to download.`,
    `The link works for 24 hours${props.sizeKb ? ` (${props.sizeKb} KB)` : ''}:`,
    '',
    props.exportUrl,
    '',
    `Link expires ${formatExpiry(props.expiresAtIso)}.`,
    '',
    'Groundwork',
  ].join('\n');
}

export async function sendBusinessPlanExportReadyEmail(args: {
  to: string;
  userId: string;
  exportId: string;
  props: BusinessPlanExportReadyProps;
}): Promise<TransactionalSendResult> {
  return sendTransactionalEmail({
    to: args.to,
    subject: SUBJECT,
    preview: PREVIEW,
    react: <BusinessPlanExportReadyTemplate {...args.props} />,
    text: renderBusinessPlanExportReadyText(args.props),
    refId: `tim2366-bp-export-${args.userId}-${args.exportId}`,
  });
}
