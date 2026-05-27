// TIM-1149 / TIM-1151: Single source of truth for the AI co-pilot's display name.
// Founder feedback locked "Brew" as the product-side name. To rename, edit
// COPILOT_NAME here and update agent-docs/groundwork/copilot-brand.md so
// other agents reference the same one.

export const COPILOT_NAME = "Brew"
export const COPILOT_SUBTITLE = "AI assistant"

// Persistent caveat shown in the chat footer. Wording per TIM-1151 founder ask:
// scope the verify-before-acting nudge to financial/legal/operational decisions
// so it reads as a real caveat instead of a generic AI-output warning.
export const COPILOT_AI_DISCLAIMER =
  "AI can make mistakes. Verify before acting on financial, legal, or operational advice."
