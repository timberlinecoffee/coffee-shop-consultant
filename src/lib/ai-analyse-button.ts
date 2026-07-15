// TIM-3869: Feature-flag infrastructure for the AI Analyse button rollout.
// Default-ON (true). If the board needs to revert, set
// NEXT_PUBLIC_AI_ANALYSE_BUTTON=false at build time and the Analyse button
// disappears from every SectionHeader without touching any component code.
// Pattern mirrors ui-revamp-v3.ts.

/**
 * Global Analyse-button flag — true unless NEXT_PUBLIC_AI_ANALYSE_BUTTON is
 * explicitly "false". Baked at build time.
 */
export const AI_ANALYSE_BUTTON: boolean =
  process.env.NEXT_PUBLIC_AI_ANALYSE_BUTTON !== 'false'
