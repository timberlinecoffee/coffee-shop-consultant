// TIM-1671: credit cost model.
//
// Billing moved from a flat message-count model (1 credit per turn) to a
// credit model where consumption scales with how much work Scout actually did
// on a turn. This file is the single, documented source of truth for that
// mapping. The numbers below are LAUNCH DEFAULTS — flagged for Trent/product to
// calibrate (see TIM-1671 plan document) — and are intentionally cheap to tune:
// change the constants here and nothing else moves.
//
// Design goals:
//   1. A short, simple chat reply costs ~1 credit, so the existing monthly
//      grants (starter 25 / growth 100 / pro 500, see MONTHLY_CREDITS in
//      src/lib/stripe.ts) keep their rough "this many easy questions" meaning.
//   2. Heavier work costs proportionally more: long generations, the stronger
//      model (which we route to for complex/research turns), web research, and
//      discrete tool actions all add credits.
//   3. Every charge is at least 1 credit — no free turns once a turn runs.
//
// What we meter on, and why:
//   - OUTPUT tokens — the best single proxy for "how much work was produced".
//     Input is dominated by the cached plan snapshot + system prompt (same on
//     every turn within a conversation), so it does not reflect user-driven
//     work and is deliberately excluded from the credit charge. (cost_usd, the
//     separate accounting figure persisted on the conversation, still folds in
//     input/cache cost — credits and cost_usd are different lenses.)
//   - MODEL tier — the complex model (sonnet) is reserved for heavier/research
//     turns and is ~4x the output price of the default (haiku); we let a given
//     volume of sonnet output cost more credits than the same haiku volume.
//   - WEB SEARCH requests — real metered research depth; each hosted search is
//     billed cost and signals a heavier turn.
//   - TOOL CALLS — discrete actions Scout took on the user's plan.
//
// TIM-1897: the platform now runs entirely on Claude Haiku, so every live caller
// passes the "default" (Haiku) tier. The "complex"/Sonnet tier below is retained
// as the generic mechanism (and is still pinned by cost.test.mjs) so that
// re-introducing a stronger model later is a one-line routing change rather than
// a cost-model rewrite.

export type CreditModelTier = "default" | "complex"

// Output tokens that map to one credit, by model tier. Lower = more expensive
// per token. Sonnet output is priced ~4x haiku; we weight it ~2x in credits
// (the rest is absorbed as margin / kept simple for users).
const OUTPUT_TOKENS_PER_CREDIT: Record<CreditModelTier, number> = {
  default: 700, // haiku-4-5: a typical 2–3 paragraph reply (~400–700 out tokens) ≈ 1 credit
  complex: 350, // sonnet-4-6: heavier reasoning/generation, charged ~2x per token
}

// Each hosted web search adds this many credits (research depth costs more).
const CREDITS_PER_WEB_SEARCH = 1

// Each tool action (e.g. reorganize_equipment_list) adds this many credits.
const CREDITS_PER_TOOL_CALL = 1

// No turn is ever free once it produces output.
const MIN_CREDITS_PER_TURN = 1

export interface CreditCostInput {
  /** "complex" when the turn routed to the stronger model, else "default". */
  modelTier: CreditModelTier
  /** Output tokens generated this turn (excludes thinking? — see note). */
  outputTokens: number
  /** Number of hosted web_search requests the turn made. */
  webSearchRequests?: number
  /** Number of tool calls (e.g. reorganize_equipment_list) the turn made. */
  toolCalls?: number
}

export interface CreditCostBreakdown {
  /** Final integer credits to charge (>= MIN_CREDITS_PER_TURN). */
  credits: number
  /** Fractional credit attributable to generated output. */
  outputCredits: number
  /** Credits from web searches. */
  searchCredits: number
  /** Credits from tool calls. */
  toolCredits: number
}

/**
 * Compute the credit charge for one Scout turn. Returns a full breakdown; most
 * callers only need `.credits`. Always >= MIN_CREDITS_PER_TURN, always an integer
 * (rounded up — partial work rounds in the platform's favor, predictably).
 */
export function computeCreditCost(input: CreditCostInput): CreditCostBreakdown {
  const outputTokens = Math.max(0, input.outputTokens || 0)
  const webSearchRequests = Math.max(0, input.webSearchRequests || 0)
  const toolCalls = Math.max(0, input.toolCalls || 0)

  const outputCredits = outputTokens / OUTPUT_TOKENS_PER_CREDIT[input.modelTier]
  const searchCredits = webSearchRequests * CREDITS_PER_WEB_SEARCH
  const toolCredits = toolCalls * CREDITS_PER_TOOL_CALL

  const raw = outputCredits + searchCredits + toolCredits
  const credits = Math.max(MIN_CREDITS_PER_TURN, Math.ceil(raw))

  return { credits, outputCredits, searchCredits, toolCredits }
}

/**
 * Human-readable description for the credit_transactions ledger row, e.g.
 * "Scout: marketing — 3 credits (gen + 2 searches)".
 */
export function describeCreditCharge(
  workspaceLabel: string,
  breakdown: CreditCostBreakdown,
  webSearchRequests = 0,
  toolCalls = 0,
): string {
  const parts: string[] = ["gen"]
  if (webSearchRequests > 0) parts.push(`${webSearchRequests} search${webSearchRequests === 1 ? "" : "es"}`)
  if (toolCalls > 0) parts.push(`${toolCalls} action${toolCalls === 1 ? "" : "s"}`)
  const noun = breakdown.credits === 1 ? "credit" : "credits"
  return `Scout: ${workspaceLabel} — ${breakdown.credits} ${noun} (${parts.join(" + ")})`
}
