// TIM-635 / TIM-618-F: Co-pilot error classification + Vercel Analytics tagging.
// Pure helpers so we can unit-test the mapping without DOM or react state.

import type { CopilotErrorCode, CopilotErrorState } from "./types";

// Mirrors UPGRADE_PATH in src/lib/access.ts — duplicated here so this module
// stays free of the @/ alias and can be unit-tested with the node test runner.
const UPGRADE_PATH = "/pricing";

export const TTFT_MS = 8_000;
export const GAP_MS = 20_000;

const KNOWN_CODES: ReadonlyArray<CopilotErrorCode> = [
  "upstream_error",
  "timeout",
  "quota",
  "paywall",
  "unauthorized",
  "bad_request",
  "network",
];

function isKnownCode(value: unknown): value is CopilotErrorCode {
  return typeof value === "string" && (KNOWN_CODES as ReadonlyArray<string>).includes(value);
}

/** Parses a `data:` payload from an SSE `event: error` frame into a typed error state. */
export function parseErrorFrame(rawData: string): CopilotErrorState {
  try {
    const parsed = JSON.parse(rawData) as {
      code?: unknown;
      message?: unknown;
      reason?: unknown;
      tier_required?: unknown;
    };
    const code = isKnownCode(parsed.code) ? parsed.code : "upstream_error";
    const message =
      typeof parsed.message === "string" && parsed.message.length > 0
        ? parsed.message
        : defaultMessageForCode(code);
    const details: Record<string, unknown> = {};
    if (typeof parsed.tier_required === "string") details.tier_required = parsed.tier_required;
    if (typeof parsed.reason === "string") details.reason = parsed.reason;
    return Object.keys(details).length > 0
      ? { code, message, details }
      : { code, message };
  } catch {
    return {
      code: "upstream_error",
      message: "Stream ended with an unknown error.",
    };
  }
}

/** Surfaced when the request returned a non-OK JSON response (no SSE body). */
export function fromHttpError(status: number, payload: unknown): CopilotErrorState {
  const message =
    payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string"
      ? (payload as { error: string }).error
      : "Request failed.";
  if (status === 401) return { code: "unauthorized", message };
  if (status === 402) return { code: "quota", message };
  if (status === 403) return { code: "quota", message };
  if (status === 400) return { code: "bad_request", message };
  return { code: "upstream_error", message };
}

/** Synthesizes a timeout error state for client-side TTFT/gap watchdog firings. */
export function timeoutError(kind: "ttft" | "gap"): CopilotErrorState {
  return {
    code: "timeout",
    message:
      kind === "ttft"
        ? "Took too long to start a response."
        : "Stream stalled mid-response.",
  };
}

function defaultMessageForCode(code: CopilotErrorCode): string {
  switch (code) {
    case "timeout":
      return "Took too long.";
    case "quota":
    case "paywall":
      return "Plan limit reached.";
    case "unauthorized":
      return "Sign-in required.";
    case "bad_request":
      return "Request was malformed.";
    case "network":
      return "Network connection lost.";
    case "upstream_error":
    default:
      return "AI service hiccup.";
  }
}

/** Codes that should auto-retry once silently before being surfaced. */
export function shouldAutoRetry(code: CopilotErrorCode): boolean {
  return code === "timeout";
}

export interface ErrorBannerCopy {
  title: string;
  cta: string | null;
  href: string | null;
  retryable: boolean;
  showSmallerQuestion: boolean;
}

/**
 * Maps a CopilotErrorState into the banner copy the drawer renders.
 * Source spec: TIM-606 error-states design spec §E1–E3 + TIM-635 scope.
 *
 * - upstream_error: "AI service hiccup — your message wasn't sent. [Retry]"
 * - timeout:        "Took too long. [Retry] [Smaller question]"
 * - quota / paywall: server message + Upgrade CTA, no retry
 */
export function errorCopy(err: CopilotErrorState): ErrorBannerCopy {
  switch (err.code) {
    // Free-tier and zero-credits paths both land here per TIM-635.
    case "quota":
    case "paywall":
      return {
        title:
          err.message ||
          "You've reached your plan's co-pilot limit. Upgrade to keep coaching.",
        cta: "Upgrade",
        href: UPGRADE_PATH,
        retryable: false,
        showSmallerQuestion: false,
      };
    case "timeout":
      return {
        title: "Took too long.",
        cta: "Retry",
        href: null,
        retryable: true,
        showSmallerQuestion: true,
      };
    case "upstream_error":
      return {
        title: "AI service hiccup — your message wasn't sent.",
        cta: "Retry",
        href: null,
        retryable: true,
        showSmallerQuestion: false,
      };
    case "network":
      return {
        title: "Connection dropped mid-stream.",
        cta: "Retry",
        href: null,
        retryable: true,
        showSmallerQuestion: false,
      };
    case "unauthorized":
      return {
        title: "Please sign in again to keep coaching.",
        cta: "Sign in",
        href: "/login",
        retryable: false,
        showSmallerQuestion: false,
      };
    case "bad_request":
      return {
        title: err.message || "We couldn't send that request.",
        cta: null,
        href: null,
        retryable: false,
        showSmallerQuestion: false,
      };
    default:
      return {
        title: err.message,
        cta: "Retry",
        href: null,
        retryable: true,
        showSmallerQuestion: false,
      };
  }
}

export interface AnalyticsTracker {
  (event: string, properties?: Record<string, string | number | boolean | null>): void;
}

/**
 * Fires a Vercel Analytics custom event for a visible co-pilot error. Caller
 * should NOT call this for silently-retried errors. The event name is
 * `copilot_error_{code}` (underscore-flat for the Vercel UI event browser).
 */
export function trackVisibleError(
  err: CopilotErrorState,
  context: { workspaceKey: string; modelUsed?: string | null },
  track: AnalyticsTracker,
): void {
  track(`copilot_error_${err.code}`, {
    workspaceKey: context.workspaceKey,
    modelUsed: context.modelUsed ?? null,
  });
}
