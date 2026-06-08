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

// TIM-2361: selective Sonnet 4.6 routing for deep-research turns.
// Board-accepted recommendation (TIM-2306 confirmation 4fdde253) reverses the
// blanket Haiku rule for a small, named set of multi-source-synthesis routes
// where Haiku output drifts off concrete local detail. Sonnet 4.6 has stronger
// research reasoning at ~4x the output price; we weight it ~2x in credits and
// absorb the rest as margin. The default for everything else stays Haiku.
//
// Surfaces that route to RESEARCH_AI_MODEL today (and pass modelTier: "complex"
// to computeCreditCost):
//   - /api/workspaces/menu-pricing/benchmark-price  (Coffee Shop World)
//   - /api/workspaces/location-lease/candidates/[id]/area-analysis
// New deep-research surfaces should join this list, not introduce a third tier.
export const RESEARCH_AI_MODEL = "claude-sonnet-4-6"

// Relative import keeps this loadable under `node --experimental-strip-types`
// for the .test.mjs siblings (TIM-2343).
import type { CreditModelTier } from "../credits/cost.ts"

// TIM-2361: keep model → credit-tier mapping in one place so a route can pass
// either constant through without the caller having to remember which is which.
export function creditTierForModel(model: string): CreditModelTier {
  if (model === RESEARCH_AI_MODEL) return "complex"
  return "default"
}

// TIM-2361: Anthropic public price table at the time of writing, in USD per
// 1,000,000 tokens. Used by ai_turn_metrics to compute cost_usd_estimate at log
// time so we can validate the ~$5-7/mo Pro COGS estimate without re-pricing
// historical rows when Anthropic adjusts. Cache reads bill at 0.1x base input,
// cache writes at 1.25x base input; web search is $10/1k requests.
export interface ModelPricing {
  inputPerM: number
  outputPerM: number
}
export const MODEL_PRICING_PER_M: Record<string, ModelPricing> = {
  // Haiku 4.5: $0.80 input / $4.00 output per 1M tokens.
  [PLATFORM_AI_MODEL]: { inputPerM: 0.8, outputPerM: 4 },
  // Sonnet 4.6: $3.00 input / $15.00 output per 1M tokens.
  [RESEARCH_AI_MODEL]: { inputPerM: 3, outputPerM: 15 },
}

export const COST_USD_PER_WEB_SEARCH = 0.01

// TIM-2361: compute USD cost for one turn given the model + raw usage breakdown.
// Cache reads bill at 0.1x base input rate, cache writes at 1.25x base input
// rate; mirrors the formula in src/app/api/copilot/stream/route.ts so the two
// stay in sync. Returns 0 (not NaN) for unknown models so a logging failure
// never tanks a live turn.
export function computeTurnCostUsd(input: {
  model: string
  inputTokens: number
  cacheReadTokens?: number
  cacheCreateTokens?: number
  outputTokens: number
  webSearchRequests?: number
}): number {
  const pricing = MODEL_PRICING_PER_M[input.model]
  if (!pricing) return 0
  const inputT = Math.max(0, input.inputTokens || 0)
  const cacheReadT = Math.max(0, input.cacheReadTokens || 0)
  const cacheCreateT = Math.max(0, input.cacheCreateTokens || 0)
  const outputT = Math.max(0, input.outputTokens || 0)
  const webSearch = Math.max(0, input.webSearchRequests || 0)
  return (
    (inputT * pricing.inputPerM +
      cacheReadT * pricing.inputPerM * 0.1 +
      cacheCreateT * pricing.inputPerM * 1.25 +
      outputT * pricing.outputPerM) /
      1_000_000 +
    webSearch * COST_USD_PER_WEB_SEARCH
  )
}
