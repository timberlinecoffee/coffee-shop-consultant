// TIM-2361: Per-turn AI telemetry sink.
//
// Pure-DI: this module exports two layers.
//   - buildTurnMetricRecord(input)  — pure function, no IO. Computes the row
//     shape from the raw Anthropic SDK usage + the model id, including
//     credits_charged and cost_usd_estimate. Drop-in testable.
//   - recordTurnMetric(deps, input) — small wrapper that takes a service-role
//     Supabase client and inserts the row built by buildTurnMetricRecord.
//
// The route-side caller composes its own credit deduction + credit_transactions
// row exactly the way /api/copilot/stream/route.ts already does (TIM-1671).
// This helper does NOT mutate ai_credits_remaining — callers do that inline so
// they keep full control over the 0-floor and isUnlimited gate.
//
// See also: src/lib/credits/cost.ts (computeCreditCost), src/lib/ai/models.ts
// (MODEL_PRICING_PER_M, computeTurnCostUsd, creditTierForModel).

// Relative imports + split type/value imports keep this file loadable under
// `node --experimental-strip-types` for src/**/*.test.mjs (TIM-2350/2343).
import { computeCreditCost } from "../credits/cost.ts"
import type { CreditCostBreakdown } from "../credits/cost.ts"
import { computeTurnCostUsd, creditTierForModel } from "./models.ts"

export type AnthropicUsage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
} | null | undefined

export type PlanTier =
  | "pro"
  | "starter"
  | "free_trial"
  | "beta_waived"
  | "free"
  | "unknown"

export interface TurnMetricInput {
  route: string
  model: string
  usage: AnthropicUsage
  webSearchRequests?: number
  toolCalls?: number
  userId: string | null
  planTier: PlanTier
}

export interface TurnMetricRecord {
  route: string
  model_used: string
  input_tokens_uncached: number
  input_tokens_cached_read: number
  input_tokens_cache_create: number
  output_tokens: number
  web_search_requests: number
  tool_calls: number
  credits_charged: number
  cost_usd_estimate: number
  user_id: string | null
  plan_tier: PlanTier
}

/** Build a single ai_turn_metrics row + the credit breakdown that fed it. */
export function buildTurnMetricRecord(input: TurnMetricInput): {
  record: TurnMetricRecord
  creditBreakdown: CreditCostBreakdown
} {
  const inputTokens = Math.max(0, input.usage?.input_tokens ?? 0)
  const outputTokens = Math.max(0, input.usage?.output_tokens ?? 0)
  const cacheReadTokens = Math.max(0, input.usage?.cache_read_input_tokens ?? 0)
  const cacheCreateTokens = Math.max(
    0,
    input.usage?.cache_creation_input_tokens ?? 0,
  )
  const webSearchRequests = Math.max(0, input.webSearchRequests ?? 0)
  const toolCalls = Math.max(0, input.toolCalls ?? 0)

  const creditBreakdown = computeCreditCost({
    modelTier: creditTierForModel(input.model),
    outputTokens,
    webSearchRequests,
    toolCalls,
  })

  const costUsd = computeTurnCostUsd({
    model: input.model,
    inputTokens,
    cacheReadTokens,
    cacheCreateTokens,
    outputTokens,
    webSearchRequests,
  })

  return {
    record: {
      route: input.route,
      model_used: input.model,
      input_tokens_uncached: inputTokens,
      input_tokens_cached_read: cacheReadTokens,
      input_tokens_cache_create: cacheCreateTokens,
      output_tokens: outputTokens,
      web_search_requests: webSearchRequests,
      tool_calls: toolCalls,
      credits_charged: creditBreakdown.credits,
      cost_usd_estimate: Number(costUsd.toFixed(6)),
      user_id: input.userId,
      plan_tier: input.planTier,
    },
    creditBreakdown,
  }
}

export interface TurnMetricInserter {
  insert(row: TurnMetricRecord): Promise<{ error?: { message?: string } | null }>
}

/**
 * Insert one ai_turn_metrics row. Caller passes the actual Supabase service
 * client wrapper so this stays testable without pulling in @supabase/supabase-js
 * at test time. Fire-and-forget by convention — logging failures must never
 * tank a live turn (warn-and-continue, like the existing
 * menu_price_aggregates insert in benchmark-price/route.ts).
 */
export async function recordTurnMetric(
  inserter: TurnMetricInserter,
  input: TurnMetricInput,
): Promise<{ creditBreakdown: CreditCostBreakdown; record: TurnMetricRecord }> {
  const built = buildTurnMetricRecord(input)
  try {
    const { error } = await inserter.insert(built.record)
    if (error) {
      console.warn(
        `[ai_turn_metrics] insert failed for ${input.route}: ${error.message ?? "unknown"}`,
      )
    }
  } catch (err) {
    console.warn(
      `[ai_turn_metrics] insert threw for ${input.route}:`,
      err instanceof Error ? err.message : err,
    )
  }
  return built
}

/**
 * Map the user profile fields we already pull from `users` to a plan_tier label.
 * Mirrors src/lib/access.ts predicates without re-importing them so the test
 * suite can pin the labels deterministically.
 */
export function resolvePlanTier(profile: {
  subscription_tier?: string | null
  subscription_status?: string | null
  beta_waiver_until?: string | Date | null
}): PlanTier {
  const waiver = profile.beta_waiver_until
  if (waiver) {
    const t = typeof waiver === "string" ? Date.parse(waiver) : waiver.getTime()
    if (Number.isFinite(t) && t > Date.now()) return "beta_waived"
  }
  if (profile.subscription_status === "free_trial") return "free_trial"
  const tier = (profile.subscription_tier ?? "").toLowerCase()
  if (tier === "pro") return "pro"
  if (tier === "starter") return "starter"
  if (tier === "free") return "free"
  return "unknown"
}
