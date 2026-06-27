// TIM-2366: barrel re-export for the 11 transactional templates so callers can
// pull a send-helper without knowing the file layout.

export {
  sendVerifyEmail,
  VerifyEmailTemplate,
  renderVerifyEmailText,
  type VerifyEmailProps,
} from './verify-email';
export {
  sendWelcomeEmail,
  WelcomeEmailTemplate,
  renderWelcomeEmailText,
  type WelcomeEmailProps,
} from './welcome';
export {
  sendPasswordResetEmail,
  PasswordResetTemplate,
  renderPasswordResetText,
  type PasswordResetProps,
} from './password-reset';
export {
  sendEmailChangeEmail,
  EmailChangeTemplate,
  renderEmailChangeText,
  type EmailChangeProps,
} from './email-change';
export {
  sendMagicLinkEmail,
  MagicLinkTemplate,
  renderMagicLinkText,
  type MagicLinkProps,
} from './magic-link';
export {
  sendCreditBalanceLowEmail,
  CreditBalanceLowTemplate,
  renderCreditBalanceLowText,
  type CreditBalanceLowProps,
} from './credit-balance-low';
export {
  sendBusinessPlanExportReadyEmail,
  BusinessPlanExportReadyTemplate,
  renderBusinessPlanExportReadyText,
  type BusinessPlanExportReadyProps,
} from './business-plan-export-ready';
export {
  sendDeepResearchCompleteEmail,
  DeepResearchCompleteTemplate,
  renderDeepResearchCompleteText,
  type DeepResearchCompleteProps,
} from './deep-research-complete';
export {
  sendCommentShareEmail,
  CommentShareTemplate,
  renderCommentShareText,
  type CommentShareProps,
  type CommentShareKind,
} from './comment-share';
export {
  sendSupportTicketReceivedEmail,
  SupportTicketReceivedTemplate,
  renderSupportTicketReceivedText,
  type SupportTicketReceivedProps,
} from './support-ticket-received';
export {
  sendSupportTicketRepliedEmail,
  SupportTicketRepliedTemplate,
  renderSupportTicketRepliedText,
  type SupportTicketRepliedProps,
} from './support-ticket-replied';
