// TIM-3869: Client-safe feature flags backed by NEXT_PUBLIC_* env vars.
// Read at component render time. Add new flags here alongside UI_REVAMP_V3.
//
// NEXT_PUBLIC_AI_ANALYSE_BUTTON (default true):
//   Controls whether the Analyse with AI action renders in SectionHeader.
//   Set to "false" in env to revert — board can flip instantly without deploy.

/** true when NEXT_PUBLIC_AI_ANALYSE_BUTTON is unset or any value except "false". */
export const AI_ANALYSE_BUTTON_ENABLED =
  process.env.NEXT_PUBLIC_AI_ANALYSE_BUTTON !== 'false'
