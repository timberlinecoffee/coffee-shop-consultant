// TIM-1563: Single source of truth for the AI assistant's display name.
// Name is "Scout" per TIM-1557 brand spec. To rename, edit COPILOT_NAME here.

export const COPILOT_NAME = "Scout"
export const COPILOT_SUBTITLE = "AI assistant"

// Persistent caveat shown in the chat footer. Wording per TIM-1151 founder ask:
// scope the verify-before-acting nudge to financial/legal/operational decisions
// so it reads as a real caveat instead of a generic AI-output warning.
export const COPILOT_AI_DISCLAIMER =
  "AI can make mistakes. Verify before acting on financial, legal, or operational advice."
