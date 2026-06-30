// TIM-3463: Scout router. Pure function — no IO, no env lookups except for the
// single SCOUT_DEEPSEEK_PROD_ENABLED gate, threaded in by the caller.
//
// Plan TIM-3333 §3 (rev 94e4b911). Four rules, first-match-wins:
//   1. Explicit lane pin — Anthropic-only lanes always Anthropic; Sonnet-required
//      lanes always Sonnet 4.6; the rest progress to Rule 3+4.
//   2. Feature-context — lanes that require Anthropic-specific tools (today
//      that means web_search hosted tool) collapse to Rule 1's Sonnet pin.
//   3. Length/complexity — DeepSeek-eligible lanes that exceed
//      30K estimated input tokens OR >12 messages fall back to Haiku 4.5.
//   4. Fallback-to-cheap — DeepSeek-eligible lanes default to DeepSeek v4-flash
//      when the prod gate is open (staging/preview always treat the gate as
//      open). When the gate is closed, fall back to Haiku 4.5.

import {
  DEEPSEEK_CHAT_MODEL,
  PLATFORM_AI_MODEL,
  RESEARCH_AI_MODEL,
} from "./models.ts"
import {
  FORCE_ANTHROPIC_LANES,
  REQUIRES_RESEARCH_MODEL_LANES,
  type ScoutLane,
} from "./scout-lane.ts"

export type ScoutProvider = "anthropic" | "deepseek"

export interface ScoutRouteInput {
  lane: ScoutLane
  estimatedInputTokens?: number
  messageCount?: number
  // Caller-provided gate. Producer reads the env var ONCE per request:
  //   deepseekProdEnabled = process.env.SCOUT_DEEPSEEK_PROD_ENABLED === "true"
  // and threads it here. Pure function stays decoupled from process.env.
  deepseekProdEnabled: boolean
  // Optional escape hatch — tests, the side-by-side QA harness (§8), and the
  // staging-overlay tooling can force a provider regardless of routing rules.
  forceProvider?: ScoutProvider
}

export interface ScoutRouteDecision {
  provider: ScoutProvider
  modelId: string
  reason: string
}

// Plan §3 Rule 3 — DeepSeek-eligible lanes that go over this length fall back
// to Anthropic Haiku to preserve quality on long structured generations.
const LONG_CONTEXT_TOKEN_THRESHOLD = 30_000
const LONG_CONTEXT_MESSAGE_THRESHOLD = 12

export function routeScoutTurn(input: ScoutRouteInput): ScoutRouteDecision {
  if (input.forceProvider === "anthropic") {
    return {
      provider: "anthropic",
      modelId: PLATFORM_AI_MODEL,
      reason: "force:anthropic",
    }
  }
  if (input.forceProvider === "deepseek") {
    return {
      provider: "deepseek",
      modelId: DEEPSEEK_CHAT_MODEL,
      reason: "force:deepseek",
    }
  }

  // Rule 2 — research lanes are pinned to Sonnet 4.6 (web_search tool only
  // available on Anthropic today).
  if (REQUIRES_RESEARCH_MODEL_LANES.has(input.lane)) {
    return {
      provider: "anthropic",
      modelId: RESEARCH_AI_MODEL,
      reason: `research_tool:${input.lane}`,
    }
  }

  // Rule 1 — explicit Anthropic pins (doc-gen, audit, vision, long structured
  // outputs the directive says must stay on Claude).
  if (FORCE_ANTHROPIC_LANES.has(input.lane)) {
    return {
      provider: "anthropic",
      modelId: PLATFORM_AI_MODEL,
      reason: `lane_pin:${input.lane}`,
    }
  }

  // Rule 3 — DeepSeek-eligible but too long for the chat lane.
  const tokens = input.estimatedInputTokens ?? 0
  const messages = input.messageCount ?? 0
  if (
    tokens > LONG_CONTEXT_TOKEN_THRESHOLD ||
    messages > LONG_CONTEXT_MESSAGE_THRESHOLD
  ) {
    return {
      provider: "anthropic",
      modelId: PLATFORM_AI_MODEL,
      reason: "long_context",
    }
  }

  // Rule 4 — default cheap. When the prod gate is closed, fall back to Haiku
  // (preserves current behavior in prod until SA-2 flip). Staging callers pass
  // `deepseekProdEnabled: true` directly.
  if (!input.deepseekProdEnabled) {
    return {
      provider: "anthropic",
      modelId: PLATFORM_AI_MODEL,
      reason: "gate_closed",
    }
  }
  return {
    provider: "deepseek",
    modelId: DEEPSEEK_CHAT_MODEL,
    reason: "default_cheap",
  }
}

/**
 * Resolve the SCOUT_DEEPSEEK_PROD_ENABLED env flag. Read on the route, threaded
 * into `routeScoutTurn` as `deepseekProdEnabled`. Server-only — there's no
 * NEXT_PUBLIC_ prefix and no client codepath consumes this.
 *
 * Per plan §6, missing env or non-`"true"` value = gate closed.
 */
export function readDeepseekProdGate(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SCOUT_DEEPSEEK_PROD_ENABLED === "true"
}
