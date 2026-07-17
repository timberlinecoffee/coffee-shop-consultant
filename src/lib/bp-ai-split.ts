// TIM-3950: Feature-flag infrastructure for the Business Plan AI-button split.
// Default-ON (true). When TRUE, every BP section exposes two SectionHeader
// actions:
//   [Write with AI]        primary — opens the BPWriteWithAIModal (guided,
//                           iterative, non-destructive; Accept gate required)
//   [Regenerate with AI]   secondary — full-section regeneration from
//                           workspace data, warned-before-run, undo-after-run
//
// When FALSE, the SectionHeader falls back to the pre-TIM-3950 layout:
//   [Auto-Write This Section] primary + "Customize Sources" link in sub-header
//   (the one-click TIM-3927 flow with inline Accept preview).
//
// If the board needs to revert, set NEXT_PUBLIC_BP_AI_SPLIT=false at build
// time. Pattern mirrors ai-analyse-button.ts.

/**
 * BP two-button split flag — true unless NEXT_PUBLIC_BP_AI_SPLIT is
 * explicitly "false". Baked at build time.
 */
export const BP_AI_SPLIT: boolean =
  (process.env.NEXT_PUBLIC_BP_AI_SPLIT ?? '').toLowerCase().trim() !== 'false'
