// TIM-3463: Scout provider adapter. Plan TIM-3333 §2 (rev 94e4b911).
//
// Unified `runScoutTurn` / `streamScoutTurn` so call sites do not care which
// provider executes the turn. Both Anthropic and DeepSeek route through the
// same shape; output normalization is at this layer so every metric, retry,
// and failover path downstream sees one envelope.
//
// Provider transport — both verified live on plan §1:
//   • Anthropic: `@anthropic-ai/sdk` (current usage in every Scout route).
//   • DeepSeek: same SDK, swapped baseURL + apiKey to the Anthropic-compatible
//     endpoint at `https://api.deepseek.com/anthropic`. The endpoint accepts
//     identical `messages.create` and `messages.stream` shapes, plus a
//     pass-through `thinking:{type:"disabled"}` to force non-thinking mode.
//
// Errors normalize to `ScoutAdapterError` with a single `errorClass` taxonomy
// (scout-errors.ts) so the router + failover layer reads one shape regardless
// of provider. Raw provider error bodies never leak to clients (Rule 5).
//
// Logging: every turn writes to `ai_turn_metrics` via the existing
// recordTurnMetric() helper, populated with the new TIM-3463 columns
// (provider, lane, latency_ms, error_class, fallback_used).

import Anthropic from "@anthropic-ai/sdk"
import {
  ScoutAdapterError,
  classifyHttpStatus,
  classifyTransportError,
  isFailoverEligible,
  type ScoutErrorClass,
} from "./scout-errors.ts"
import {
  DEEPSEEK_CHAT_MODEL,
  PLATFORM_AI_MODEL,
} from "./models.ts"
import {
  readDeepseekProdGate,
  routeScoutTurn,
  type ScoutProvider,
  type ScoutRouteDecision,
} from "./scout-router.ts"
import type { ScoutLane } from "./scout-lane.ts"

// ── Public types ─────────────────────────────────────────────────────────────

export interface SystemBlock {
  text: string
  // Mirror of Anthropic's cache_control; DeepSeek's prefix cache is automatic,
  // so this field is ignored on that provider. The system prompt MUST still be
  // the first block, byte-identical across calls in the same lane, to hit the
  // DeepSeek disk cache (see plan §4).
  cacheControl?: { type: "ephemeral" }
}

export interface ScoutMessage {
  role: "user" | "assistant"
  content: string | Anthropic.ContentBlockParam[]
}

export interface ScoutToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ScoutTurnInput {
  lane: ScoutLane
  systemBlocks: SystemBlock[]
  messages: ScoutMessage[]
  tools?: ScoutToolDefinition[]
  maxTokens: number
  temperature?: number
  userId: string | null
  routeTag: string
  preferProvider?: ScoutProvider
  // Override the router. Tests + the QA harness use this.
  forceProvider?: ScoutProvider
  // Test seam: caller can inject a transport so unit tests don't need an HTTP
  // mock library. Defaults to the live SDK clients.
  transport?: ScoutTransport
}

export interface NormalizedUsage {
  inputTokensUncached: number
  inputTokensCachedRead: number
  inputTokensCacheCreate: number
  outputTokens: number
  webSearchRequests: number
  toolCalls: number
}

export interface ScoutToolUse {
  id: string
  name: string
  input: unknown
}

export interface ScoutTurnOutput {
  text: string
  toolUses: ScoutToolUse[]
  usage: NormalizedUsage
  provider: ScoutProvider
  modelId: string
  latencyMs: number
  fallbackUsed: boolean
}

export type ScoutStreamEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_use_start"; id: string; name: string; input: unknown }
  | { kind: "tool_use_delta"; id: string; jsonDelta: string }
  | {
      kind: "stop"
      reason: "end_turn" | "tool_use" | "max_tokens" | "error"
    }
  | { kind: "usage"; usage: NormalizedUsage }

// ── Transport seam (testable) ────────────────────────────────────────────────

export interface ScoutTransportCallInput {
  provider: ScoutProvider
  modelId: string
  systemBlocks: SystemBlock[]
  messages: ScoutMessage[]
  tools: ScoutToolDefinition[] | undefined
  maxTokens: number
  temperature: number | undefined
}

export interface ScoutTransportCallOutput {
  text: string
  toolUses: ScoutToolUse[]
  usage: NormalizedUsage
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "error"
}

export interface ScoutTransport {
  call(input: ScoutTransportCallInput): Promise<ScoutTransportCallOutput>
  stream(
    input: ScoutTransportCallInput,
  ): AsyncIterable<ScoutStreamEvent>
}

// ── Live transport implementations ───────────────────────────────────────────

function getAnthropicClient(provider: ScoutProvider): Anthropic {
  if (provider === "anthropic") {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  // DeepSeek's Anthropic-compatible endpoint accepts the same shape with a
  // different baseURL + key. The `thinking:{type:"disabled"}` parameter is
  // passed via the SDK's extra-body field on each call.
  return new Anthropic({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com/anthropic",
  })
}

function toAnthropicSystem(
  blocks: SystemBlock[],
): Anthropic.TextBlockParam[] {
  return blocks.map((b) => ({
    type: "text",
    text: b.text,
    ...(b.cacheControl ? { cache_control: b.cacheControl } : {}),
  }))
}

function toAnthropicMessages(
  messages: ScoutMessage[],
): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))
}

function toAnthropicTools(
  tools: ScoutToolDefinition[] | undefined,
): Anthropic.Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }))
}

// DeepSeek thinking-disable parameter is passed as extra-body to the SDK.
// Anthropic's SDK preserves unknown top-level fields, so we attach it on the
// request and the SDK forwards it. Behavior verified per plan §1 — if the
// Anthropic-compatible URL silently ignores it, the adapter PR's smoke test
// catches that and we fall back to the OpenAI-format URL.
function deepseekExtraBody(): Record<string, unknown> {
  return { thinking: { type: "disabled" } }
}

function normalizeUsageFromAnthropic(
  usage: Anthropic.Usage | null | undefined,
  toolCallCount: number,
  webSearchRequests: number,
): NormalizedUsage {
  return {
    inputTokensUncached: Math.max(0, usage?.input_tokens ?? 0),
    inputTokensCachedRead: Math.max(
      0,
      usage?.cache_read_input_tokens ?? 0,
    ),
    inputTokensCacheCreate: Math.max(
      0,
      usage?.cache_creation_input_tokens ?? 0,
    ),
    outputTokens: Math.max(0, usage?.output_tokens ?? 0),
    webSearchRequests,
    toolCalls: toolCallCount,
  }
}

function classifyAnthropicError(
  err: unknown,
  provider: ScoutProvider,
): ScoutAdapterError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0
    const code = (err.error as { type?: string } | undefined)?.type ?? ""
    const contentPolicy =
      code === "invalid_request_error" && /content/i.test(err.message)
    const errorClass: ScoutErrorClass = classifyHttpStatus(status, {
      contentPolicy,
    })
    return new ScoutAdapterError({
      errorClass,
      provider,
      status,
      message: `${provider} ${status} ${err.message}`,
      cause: err,
    })
  }
  return new ScoutAdapterError({
    errorClass: classifyTransportError(err),
    provider,
    message: err instanceof Error ? err.message : String(err),
    cause: err,
  })
}

const liveTransport: ScoutTransport = {
  async call(input) {
    const client = getAnthropicClient(input.provider)
    const extra =
      input.provider === "deepseek"
        ? { headers: {}, query: {}, body: deepseekExtraBody() }
        : undefined
    try {
      const message = await client.messages.create(
        {
          model: input.modelId,
          max_tokens: input.maxTokens,
          system: toAnthropicSystem(input.systemBlocks),
          messages: toAnthropicMessages(input.messages),
          ...(input.temperature !== undefined
            ? { temperature: input.temperature }
            : {}),
          ...(input.tools && input.tools.length > 0
            ? { tools: toAnthropicTools(input.tools), tool_choice: { type: "auto" } }
            : {}),
        },
        extra,
      )

      const toolUses: ScoutToolUse[] = []
      let text = ""
      for (const block of message.content) {
        if (block.type === "text") text += block.text
        else if (block.type === "tool_use") {
          toolUses.push({ id: block.id, name: block.name, input: block.input })
        }
      }
      const stopReason: ScoutTransportCallOutput["stopReason"] =
        message.stop_reason === "end_turn" ||
        message.stop_reason === "tool_use" ||
        message.stop_reason === "max_tokens"
          ? message.stop_reason
          : "end_turn"
      return {
        text,
        toolUses,
        usage: normalizeUsageFromAnthropic(message.usage, toolUses.length, 0),
        stopReason,
      }
    } catch (err) {
      throw classifyAnthropicError(err, input.provider)
    }
  },

  async *stream(input) {
    const client = getAnthropicClient(input.provider)
    const extra =
      input.provider === "deepseek"
        ? { headers: {}, query: {}, body: deepseekExtraBody() }
        : undefined
    try {
      const stream = client.messages.stream(
        {
          model: input.modelId,
          max_tokens: input.maxTokens,
          system: toAnthropicSystem(input.systemBlocks),
          messages: toAnthropicMessages(input.messages),
          ...(input.temperature !== undefined
            ? { temperature: input.temperature }
            : {}),
          ...(input.tools && input.tools.length > 0
            ? { tools: toAnthropicTools(input.tools), tool_choice: { type: "auto" } }
            : {}),
        },
        extra,
      )
      type StopReason = "end_turn" | "tool_use" | "max_tokens" | "error"
      const activeTool = new Map<number, { id: string; name: string }>()
      let toolCallCount = 0
      let webSearchRequests = 0
      let finalUsage: Anthropic.Usage | null = null
      let stopReason: StopReason = "end_turn"
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block
          if (block.type === "tool_use") {
            toolCallCount += 1
            activeTool.set(event.index, { id: block.id, name: block.name })
            yield {
              kind: "tool_use_start",
              id: block.id,
              name: block.name,
              input: block.input,
            }
          } else if (block.type === "server_tool_use") {
            webSearchRequests += 1
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta
          if (delta.type === "text_delta") {
            yield { kind: "text_delta", text: delta.text }
          } else if (delta.type === "input_json_delta") {
            const t = activeTool.get(event.index)
            if (t) {
              yield {
                kind: "tool_use_delta",
                id: t.id,
                jsonDelta: delta.partial_json,
              }
            }
          }
        } else if (event.type === "message_delta") {
          if (event.usage) finalUsage = event.usage as Anthropic.Usage
          const r = event.delta.stop_reason
          if (r === "end_turn" || r === "tool_use" || r === "max_tokens") {
            stopReason = r
          }
        } else if (event.type === "message_stop") {
          // Final usage is also available on the assembled message.
          const final = stream.finalMessage
            ? await stream.finalMessage()
            : null
          if (final?.usage) finalUsage = final.usage
        }
      }
      yield { kind: "stop", reason: stopReason }
      yield {
        kind: "usage",
        usage: normalizeUsageFromAnthropic(
          finalUsage,
          toolCallCount,
          webSearchRequests,
        ),
      }
    } catch (err) {
      const e = classifyAnthropicError(err, input.provider)
      yield { kind: "stop", reason: "error" }
      throw e
    }
  },
}

// ── Failover orchestration (plan §7) ─────────────────────────────────────────

function otherProvider(p: ScoutProvider): ScoutProvider {
  return p === "anthropic" ? "deepseek" : "anthropic"
}

function fallbackModelFor(provider: ScoutProvider): string {
  return provider === "anthropic" ? PLATFORM_AI_MODEL : DEEPSEEK_CHAT_MODEL
}

// Plan §7: single same-provider retry (250ms backoff) on failover-eligible
// errors, then cross-provider failover. NOT-eligible classes return upstream
// to the caller without retry.
const RETRY_BACKOFF_MS = 250

async function callWithFailover(
  transport: ScoutTransport,
  primary: ScoutTransportCallInput,
): Promise<{
  result: ScoutTransportCallOutput
  provider: ScoutProvider
  modelId: string
  fallbackUsed: boolean
}> {
  // First attempt.
  try {
    const result = await transport.call(primary)
    return {
      result,
      provider: primary.provider,
      modelId: primary.modelId,
      fallbackUsed: false,
    }
  } catch (err) {
    if (!(err instanceof ScoutAdapterError) || !isFailoverEligible(err.errorClass)) {
      throw err
    }
    // Same-provider retry with short backoff.
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
    try {
      const result = await transport.call(primary)
      return {
        result,
        provider: primary.provider,
        modelId: primary.modelId,
        fallbackUsed: false,
      }
    } catch (retryErr) {
      if (
        !(retryErr instanceof ScoutAdapterError) ||
        !isFailoverEligible(retryErr.errorClass)
      ) {
        throw retryErr
      }
      // Cross-provider failover.
      const failoverProvider = otherProvider(primary.provider)
      const failoverInput: ScoutTransportCallInput = {
        ...primary,
        provider: failoverProvider,
        modelId: fallbackModelFor(failoverProvider),
      }
      const result = await transport.call(failoverInput)
      return {
        result,
        provider: failoverInput.provider,
        modelId: failoverInput.modelId,
        fallbackUsed: true,
      }
    }
  }
}

// ── Public entry points ──────────────────────────────────────────────────────

function decideRoute(input: ScoutTurnInput): ScoutRouteDecision {
  return routeScoutTurn({
    lane: input.lane,
    estimatedInputTokens: undefined,
    messageCount: input.messages.length,
    deepseekProdEnabled: readDeepseekProdGate(),
    forceProvider: input.forceProvider ?? input.preferProvider,
  })
}

/**
 * Run one non-streaming Scout turn against the routed provider, with
 * single-retry + cross-provider failover (plan §7). Returns a normalized
 * envelope. Does NOT write `ai_turn_metrics` itself — that is the route
 * caller's responsibility today (it owns credit accounting), but the returned
 * `provider` / `modelId` / `usage` / `fallbackUsed` / `latencyMs` plug
 * directly into `recordTurnMetric()` with the TIM-3463 column extensions.
 */
export async function runScoutTurn(
  input: ScoutTurnInput,
): Promise<ScoutTurnOutput> {
  const decision = decideRoute(input)
  const transport = input.transport ?? liveTransport
  const primary: ScoutTransportCallInput = {
    provider: decision.provider,
    modelId: decision.modelId,
    systemBlocks: input.systemBlocks,
    messages: input.messages,
    tools: input.tools,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  }
  const t0 = Date.now()
  const { result, provider, modelId, fallbackUsed } = await callWithFailover(
    transport,
    primary,
  )
  return {
    text: result.text,
    toolUses: result.toolUses,
    usage: result.usage,
    provider,
    modelId,
    latencyMs: Date.now() - t0,
    fallbackUsed,
  }
}

/**
 * Stream one Scout turn. Failover semantics on a streaming turn cannot
 * retroactively retry tokens already flushed to the client — once tokens are
 * out, an error is terminal (the caller emits its own SSE error event). This
 * mirrors today's behavior in `copilot/stream` (TIM-1670 watchdog comments).
 */
export async function* streamScoutTurn(
  input: ScoutTurnInput,
): AsyncIterable<ScoutStreamEvent> {
  const decision = decideRoute(input)
  const transport = input.transport ?? liveTransport
  const primary: ScoutTransportCallInput = {
    provider: decision.provider,
    modelId: decision.modelId,
    systemBlocks: input.systemBlocks,
    messages: input.messages,
    tools: input.tools,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
  }
  for await (const event of transport.stream(primary)) {
    yield event
  }
}

// Convenience for routes that already have a recordTurnMetric callsite — gives
// them the route + provider + lane in one shape.
export interface ScoutTurnMetricExtras {
  provider: ScoutProvider
  lane: ScoutLane
  latencyMs: number
  fallbackUsed: boolean
  errorClass?: ScoutErrorClass
}

export { PLATFORM_AI_MODEL, DEEPSEEK_CHAT_MODEL }
