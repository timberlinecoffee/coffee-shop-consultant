// TIM-3463: Unified Scout error envelope. Plan §2 + §7.
//
// Every provider error (Anthropic, DeepSeek, network, timeout) normalizes into
// a single `ScoutAdapterError`. The router + failover logic read `class`. Raw
// provider error bodies never leak to clients (Rule 5).
//
// User-facing sanitized copy lives here too, single source of truth.

export type ScoutErrorClass =
  | "rate_limit"
  | "auth"
  | "server"
  | "timeout"
  | "content_policy"
  | "unknown"

export interface ScoutAdapterErrorInit {
  errorClass: ScoutErrorClass
  provider: "anthropic" | "deepseek"
  status?: number
  message: string
  cause?: unknown
}

export class ScoutAdapterError extends Error {
  readonly errorClass: ScoutErrorClass
  readonly provider: "anthropic" | "deepseek"
  readonly status: number | undefined
  constructor(init: ScoutAdapterErrorInit) {
    super(init.message)
    this.name = "ScoutAdapterError"
    this.errorClass = init.errorClass
    this.provider = init.provider
    this.status = init.status
    if (init.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = init.cause
    }
  }
}

// Plan §7 — single source for the sanitized user-facing copy.
export const SCOUT_USER_FALLBACK_COPY =
  "Scout is temporarily unavailable. Try again in a minute, or refresh the page if this keeps happening."

// Plan §7 — eligible classes failover after one same-provider retry.
// auth / content_policy / unknown(4xx) do NOT failover.
const FAILOVER_ELIGIBLE: ReadonlySet<ScoutErrorClass> = new Set([
  "rate_limit",
  "server",
  "timeout",
])

export function isFailoverEligible(errorClass: ScoutErrorClass): boolean {
  return FAILOVER_ELIGIBLE.has(errorClass)
}

// Map an HTTP status code + a tag to a ScoutErrorClass. Provider-agnostic.
export function classifyHttpStatus(
  status: number,
  hints?: { contentPolicy?: boolean },
): ScoutErrorClass {
  if (hints?.contentPolicy) return "content_policy"
  if (status === 401 || status === 403) return "auth"
  if (status === 429) return "rate_limit"
  if (status >= 500 && status <= 599) return "server"
  return "unknown"
}

// Provider exceptions outside the HTTP layer.
export function classifyTransportError(err: unknown): ScoutErrorClass {
  if (err instanceof Error) {
    const name = err.name
    if (name === "AbortError" || name === "TimeoutError") return "timeout"
    const msg = err.message?.toLowerCase() ?? ""
    if (msg.includes("timeout") || msg.includes("timed out")) return "timeout"
    if (
      msg.includes("network") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("fetch failed")
    ) {
      return "server"
    }
  }
  return "unknown"
}
