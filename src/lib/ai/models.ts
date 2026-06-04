// TIM-1897: board directive (owner: Trent on TIM-1555) — ALL platform AI runs on
// Claude Haiku, not Sonnet. This is the single source of truth for the model ID
// used by every AI call path (chat, inline generation, "Improve with AI",
// consistency check, workspace generators, critiques, suggestions, etc.).
//
// To move the whole platform to a different model, change this one constant.
//
// Note on extended thinking: Haiku 4.5 does not support extended thinking, so no
// call site may pass a `thinking` param while using this model — doing so is a
// 400 from the API. (Routes that previously enabled thinking on the Sonnet tier
// had it removed in TIM-1897.)
export const PLATFORM_AI_MODEL = "claude-haiku-4-5-20251001"
