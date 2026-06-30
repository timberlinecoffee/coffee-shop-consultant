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
  type ScoutRouteErrorClass,
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

// TIM-3495: Anthropic-hosted server tools (web_search) take a different shape
// than client tools — no input_schema, just type+name(+max_uses). copilot/stream
// registers `web_search_20250305` on research-classified turns; without this
// type the only way to pass it was to bypass the adapter (today's reality).
// Additive: routes that only use client tools keep working unchanged.
// TIM-3496: extended with user_location, allowed_domains, blocked_domains so
// menu-pricing/benchmark-price (computeLocalCafeRange) can request country/city-
// biased searches and per-country TLD allow/blocks without bypassing the adapter.
export interface ScoutServerToolUserLocation {
  type: "approximate"
  city?: string
  country?: string
  region?: string
  timezone?: string
}

export interface ScoutServerToolDefinition {
  type: "web_search_20250305"
  name: string
  max_uses?: number
  user_location?: ScoutServerToolUserLocation
  allowed_domains?: string[]
  blocked_domains?: string[]
}

// Adapter tools: client tools (name/description/input_schema) OR server tools
// (web_search_20250305). Discriminator is presence of `type` — server tools
// have it, client tools don't. Existing callers passing the client shape stay
// type-compatible without code changes.
export type ScoutAnyToolDefinition = ScoutToolDefinition | ScoutServerToolDefinition

// TIM-3495: caller-supplied tool_choice. copilot/stream forces
// `propose_equipment_change` on the cross-workspace equipment cost lane
// because Haiku 4.5 tool_choice:auto fires the tool ~0% of the time on that
// intent (TIM-1798 measurement). Optional — defaults to `{type:"auto"}`.
export type ScoutToolChoice =
  | { type: "auto" }
  | { type: "tool"; name: string }

export interface ScoutTurnInput {
  lane: ScoutLane
  systemBlocks: SystemBlock[]
  messages: ScoutMessage[]
  tools?: ScoutAnyToolDefinition[]
  toolChoice?: ScoutToolChoice
  maxTokens: number
  temperature?: number
  userId: string | null
  routeTag: string
  preferProvider?: ScoutProvider
  // Override the router. Tests + the QA harness use this.
  forceProvider?: ScoutProvider
  // TIM-3468: Override the model id chosen by the router. Use this only when
  // the call site owns a deterministic model-tier policy (today: document
  // extraction picks Haiku-vs-Sonnet on parsed-doc length). Caller is
  // responsible for keeping the override compatible with the routed provider —
  // e.g. only pass an Anthropic model when lane resolves to Anthropic.
  modelOverride?: string
  // TIM-3468: AbortSignal threaded into the SDK call so per-route timeouts
  // (audit SYNTHESIS_TIMEOUT_MS, regenerate-all PER_SECTION_TIMEOUT_MS,
  // validate PASS2_TIMEOUT_MS) actually cancel the in-flight HTTP request
  // instead of just polling between stream events. Without this, a stalled
  // upstream call keeps running until Vercel maxDuration burns the function
  // budget and the credit-spend continues unchecked.
  signal?: AbortSignal
  // ISO-3166-1 alpha-2 country code for the EU geo-gate (TIM-3460). Source
  // priority resolved by the route caller (see scout-adapter.routeCountryFor
  // contract below): user.regulatoryRegion → x-vercel-ip-country → null/unknown.
  // null is treated as "block DeepSeek" by the router.
  country?: string | null
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
  // TIM-3460 — populated when the router diverted a DeepSeek-eligible turn to
  // Anthropic for EU/UK/CH compliance. Route callers map this into
  // `recordTurnMetric({ errorClass, fallbackUsed: true })` so dashboards can
  // attribute compliance fallbacks separately from upstream provider errors.
  routeErrorClass?: ScoutRouteErrorClass
  routeReason: string
}

export type ScoutStreamEvent =
  // First event the stream emits. Lets routes record provider + modelId in
  // their telemetry without re-running the router (TIM-3468). TIM-3495 added
  // fallbackUsed so streaming callsites can stamp ai_turn_metrics with the
  // routing-driven fallback flag (today: EU geo-gate diverts).
  | {
      kind: "decision"
      provider: ScoutProvider
      modelId: string
      fallbackUsed: boolean
      routeReason: string
    }
  | { kind: "text_delta"; text: string }
  // TIM-3495: extended-thinking text (Anthropic only — DeepSeek's compat
  // endpoint forces thinking off). copilot/stream surfaces this as its
  // `event: thinking` SSE so the client can show a thinking affordance.
  | { kind: "thinking_delta"; text: string }
  | { kind: "tool_use_start"; id: string; name: string; input: unknown }
  | { kind: "tool_use_delta"; id: string; jsonDelta: string }
  // TIM-3495: emitted on content_block_stop for a client tool_use block so
  // routes can finalize the accumulated input (reorganize_equipment_list,
  // propose_item, propose_equipment_change, add_persona,
  // suggest_workspace_changes) and emit their suggestions payloads.
  | { kind: "tool_use_stop"; id: string; name: string }
  // TIM-3495: emitted when an Anthropic-hosted server tool block starts
  // (today: web_search_20250305). copilot/stream uses this for the
  // `status:searching` SSE event and to reset the GAP_MS watchdog while the
  // server-side search runs without producing text/tool deltas.
  | { kind: "server_tool_use_start"; name: string }
  // TIM-3495: emitted on `web_search_tool_result` content block start —
  // signals "search done, results landing" so the watchdog keeps eating.
  | { kind: "server_tool_use_result" }
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
  tools: ScoutAnyToolDefinition[] | undefined
  // TIM-3495: optional caller-supplied tool_choice (auto vs forced-tool name).
  toolChoice?: ScoutToolChoice
  maxTokens: number
  temperature: number | undefined
  // TIM-3468: optional caller-supplied AbortSignal. liveTransport forwards
  // it to Anthropic.RequestOptions.signal so the SDK cancels the HTTP fetch
  // when the caller's timer fires.
  signal?: AbortSignal
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
  tools: ScoutAnyToolDefinition[] | undefined,
): Anthropic.ToolUnion[] | undefined {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => {
    // TIM-3495: discriminate on `input_schema` rather than `type` — client
    // tools always carry input_schema and the SDK's Anthropic.Tool keeps an
    // optional `type: "custom"` field on its literal type, so a presence
    // check on `type` could misfire when callers pass an SDK-typed literal.
    if ("input_schema" in t) {
      return {
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      } satisfies Anthropic.Tool
    }
    // SDK's WebSearchTool20250305.name is the literal "web_search"; cast at
    // the construction boundary to satisfy the SDK's branded literal.
    // TIM-3496: forward user_location/allowed_domains/blocked_domains so
    // computeLocalCafeRange can pass country/city bias and per-country TLD
    // filters identical to the pre-Scout direct-SDK call.
    const serverTool: Anthropic.WebSearchTool20250305 = {
      type: t.type,
      name: t.name as "web_search",
      ...(t.max_uses !== undefined ? { max_uses: t.max_uses } : {}),
      ...(t.user_location !== undefined ? { user_location: t.user_location } : {}),
      ...(t.allowed_domains !== undefined ? { allowed_domains: t.allowed_domains } : {}),
      ...(t.blocked_domains !== undefined ? { blocked_domains: t.blocked_domains } : {}),
    }
    return serverTool
  })
}

// TIM-3495: resolve tool_choice the SDK accepts. Default `{type:"auto"}`
// preserves TIM-3468 behavior for all existing callers; explicit `{type:"tool",
// name}` lets copilot/stream force propose_equipment_change on Haiku 4.5.
function toAnthropicToolChoice(
  choice: ScoutToolChoice | undefined,
): Anthropic.ToolChoice {
  if (choice?.type === "tool") {
    return { type: "tool", name: choice.name }
  }
  return { type: "auto" }
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

// TIM-3468: assemble the SDK RequestOptions so caller AbortSignal and
// DeepSeek extra-body coexist on the same object. The Anthropic SDK accepts
// `signal` as a top-level option on every call/stream entry point.
function buildRequestOptions(input: ScoutTransportCallInput) {
  const opts: { signal?: AbortSignal; headers?: Record<string, string>; query?: Record<string, unknown>; body?: Record<string, unknown> } = {}
  if (input.signal) opts.signal = input.signal
  if (input.provider === "deepseek") {
    opts.headers = {}
    opts.query = {}
    opts.body = deepseekExtraBody()
  }
  return Object.keys(opts).length > 0 ? opts : undefined
}

const liveTransport: ScoutTransport = {
  async call(input) {
    const client = getAnthropicClient(input.provider)
    const extra = buildRequestOptions(input)
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
            ? {
                tools: toAnthropicTools(input.tools),
                tool_choice: toAnthropicToolChoice(input.toolChoice),
              }
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
      // TIM-3496: surface server_tool_use.web_search_requests so non-streaming
      // callers (computeLocalCafeRange) keep parity with the pre-Scout
      // direct-SDK call that read this counter for cost telemetry.
      const webSearchRequests =
        message.usage?.server_tool_use?.web_search_requests ?? 0
      return {
        text,
        toolUses,
        usage: normalizeUsageFromAnthropic(message.usage, toolUses.length, webSearchRequests),
        stopReason,
      }
    } catch (err) {
      throw classifyAnthropicError(err, input.provider)
    }
  },

  async *stream(input) {
    const client = getAnthropicClient(input.provider)
    const extra = buildRequestOptions(input)
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
            ? {
                tools: toAnthropicTools(input.tools),
                tool_choice: toAnthropicToolChoice(input.toolChoice),
              }
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
            // TIM-3495: surface the server-tool start so copilot/stream can
            // emit `status:searching` and keep its GAP_MS watchdog fed while
            // the server-side search runs without producing text deltas.
            yield { kind: "server_tool_use_start", name: block.name }
          } else if (block.type === "web_search_tool_result") {
            // TIM-3495: search-results landing — copilot/stream uses this to
            // reset the watchdog and (today) leaves it as a silent keep-alive.
            yield { kind: "server_tool_use_result" }
          }
        } else if (event.type === "content_block_stop") {
          // TIM-3495: finalize the active tool block so the route can parse
          // the accumulated tool input and emit its suggestions payload.
          const t = activeTool.get(event.index)
          if (t) {
            yield { kind: "tool_use_stop", id: t.id, name: t.name }
            activeTool.delete(event.index)
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta
          if (delta.type === "text_delta") {
            yield { kind: "text_delta", text: delta.text }
          } else if (delta.type === "thinking_delta") {
            // TIM-3495: extended-thinking deltas — surface so copilot/stream
            // can emit its `event: thinking` SSE event.
            yield { kind: "thinking_delta", text: delta.thinking }
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

// TIM-3468: lanes whose primary provider has a capability the failover
// provider cannot match — failing over would 400 on the secondary endpoint
// anyway, so we throw upstream instead of attempting a doomed swap. Vision
// (document/image content blocks) only Anthropic accepts; web_search hosted
// tool only Anthropic offers. Both lanes are pinned to Anthropic at routing
// time so the failover would always be DeepSeek → 400.
const BLOCK_CROSS_PROVIDER_FAILOVER_LANES = new Set<ScoutLane>([
  "document_import_extract",
  "menu_benchmark_price",
  "location_area_analysis",
])

// Plan §7: single same-provider retry (250ms backoff) on failover-eligible
// errors, then cross-provider failover. NOT-eligible classes return upstream
// to the caller without retry.
const RETRY_BACKOFF_MS = 250

async function callWithFailover(
  transport: ScoutTransport,
  primary: ScoutTransportCallInput,
  // TIM-3468: lane + modelOverride threaded through so failover honors
  // capability gates and preserves the caller's tier policy on retry.
  lane: ScoutLane,
  modelOverride: string | undefined,
  // When set (e.g. EU geo-gate routed the turn to Anthropic), cross-provider
  // failover is suppressed — we must not switch to DeepSeek on Anthropic 5xx
  // or we defeat the PIPEDA compliance gate. Same-provider retry still fires.
  lockedToProvider?: ScoutProvider,
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
    // Same-provider retry with short backoff — preserves modelOverride.
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
      // TIM-3468: capability-gated lanes (vision, web_search) cannot
      // failover to the other provider — throw the second-attempt error
      // upstream instead of sending content the secondary will 400 on.
      if (BLOCK_CROSS_PROVIDER_FAILOVER_LANES.has(lane)) {
        throw retryErr
      }
      // Cross-provider failover — also skipped when the router locked the
      // provider for compliance (EU geo-gate, TIM-3471). Rethrow to preserve
      // the upstream error rather than routing EU traffic to DeepSeek.
      if (lockedToProvider !== undefined) {
        throw retryErr
      }
      // The override doesn't apply across providers (an Anthropic model id is
      // meaningless to DeepSeek and vice-versa) — drop it explicitly.
      void modelOverride
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

// TIM-3468: cheap heuristic so Rule 3 (>30k token fallback to Haiku) can fire.
// True tokenization is expensive on a hot path; the SDK doesn't expose a
// pre-call tokenizer either. Char-quarter is a well-known approximation
// (Anthropic + OpenAI public guidance — 1 token ≈ 4 chars of English prose)
// and safely overestimates for code/JSON-heavy prompts, which is the
// conservative direction here (favor the safer Haiku fallback on borderline
// inputs).
function estimateInputTokens(input: ScoutTurnInput): number {
  let chars = 0
  for (const b of input.systemBlocks) chars += b.text.length
  for (const m of input.messages) {
    if (typeof m.content === "string") {
      chars += m.content.length
    } else {
      for (const block of m.content) {
        if (block.type === "text" && typeof block.text === "string") {
          chars += block.text.length
        }
        // base64 image/document blocks aren't text — billed differently
        // and not counted toward the long-context threshold.
      }
    }
  }
  return Math.ceil(chars / 4)
}

function decideRoute(input: ScoutTurnInput): ScoutRouteDecision {
  return routeScoutTurn({
    lane: input.lane,
    estimatedInputTokens: estimateInputTokens(input),
    messageCount: input.messages.length,
    deepseekProdEnabled: readDeepseekProdGate(),
    country: input.country,
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
    // TIM-3468: respect caller-supplied modelOverride for sites that own a
    // deterministic tier policy (document extraction Haiku-vs-Sonnet). Without
    // an override, take the router's chosen modelId.
    modelId: input.modelOverride ?? decision.modelId,
    systemBlocks: input.systemBlocks,
    messages: input.messages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    signal: input.signal,
  }
  const t0 = Date.now()
  const { result, provider, modelId, fallbackUsed } = await callWithFailover(
    transport,
    primary,
    input.lane,
    input.modelOverride,
    // Lock to Anthropic when the EU geo-gate diverted the turn — prevents
    // a provider 5xx from silently failing over to DeepSeek and bypassing
    // the PIPEDA compliance gate.
    decision.errorClass !== undefined ? decision.provider : undefined,
  )
  // EU geo-gate diverts count as fallback_used even when the resulting
  // Anthropic call succeeds on the first try — preserve the higher-precedence
  // signal (cross-provider failover from a 5xx) when both apply.
  const gateFallback = decision.fallbackUsed ?? false
  return {
    text: result.text,
    toolUses: result.toolUses,
    usage: result.usage,
    provider,
    modelId,
    latencyMs: Date.now() - t0,
    fallbackUsed: fallbackUsed || gateFallback,
    routeErrorClass: decision.errorClass,
    routeReason: decision.reason,
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
  // TIM-3468: respect modelOverride symmetrically with runScoutTurn.
  const effectiveModelId = input.modelOverride ?? decision.modelId
  const primary: ScoutTransportCallInput = {
    provider: decision.provider,
    modelId: effectiveModelId,
    systemBlocks: input.systemBlocks,
    messages: input.messages,
    tools: input.tools,
    toolChoice: input.toolChoice,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    signal: input.signal,
  }
  // TIM-3468 / TIM-3495: announce routing decision so callers can stamp
  // telemetry with provider + modelId + fallbackUsed without re-running the
  // router. fallbackUsed reflects the routing-driven divert (today: EU
  // geo-gate) — mid-stream cross-provider failover is intentionally NOT
  // supported because already-flushed tokens can't be retroactively retried.
  yield {
    kind: "decision",
    provider: decision.provider,
    modelId: effectiveModelId,
    fallbackUsed: decision.fallbackUsed ?? false,
    routeReason: decision.reason,
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

// TIM-3468: Convert a ScoutTurnOutput envelope into the shape the existing
// recordTurnMetric() helper expects. Folds NormalizedUsage back into the legacy
// AnthropicUsage field names so existing telemetry code paths keep working
// while TIM-3463's new TIM_3463 columns (provider/lane/latencyMs/fallbackUsed)
// are populated from the same envelope.
export interface ScoutEnvelopeMetricArgs {
  model: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  }
  webSearchRequests: number
  toolCalls: number
  provider: ScoutProvider
  lane: ScoutLane
  latencyMs: number
  fallbackUsed: boolean
}

export function toTurnMetricArgs(
  envelope: ScoutTurnOutput,
  lane: ScoutLane,
): ScoutEnvelopeMetricArgs {
  return {
    model: envelope.modelId,
    usage: {
      input_tokens: envelope.usage.inputTokensUncached,
      output_tokens: envelope.usage.outputTokens,
      cache_read_input_tokens: envelope.usage.inputTokensCachedRead,
      cache_creation_input_tokens: envelope.usage.inputTokensCacheCreate,
    },
    webSearchRequests: envelope.usage.webSearchRequests,
    toolCalls: envelope.usage.toolCalls,
    provider: envelope.provider,
    lane,
    latencyMs: envelope.latencyMs,
    fallbackUsed: envelope.fallbackUsed,
  }
}

export { PLATFORM_AI_MODEL, DEEPSEEK_CHAT_MODEL }
