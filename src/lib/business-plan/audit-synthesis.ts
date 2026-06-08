// TIM-2356: Plain-language synthesis layer for Plan Quality Check.
//
// Wraps each AuditFinding with a Haiku call whose system prompt is the
// Designer's voice guide (TIM-2355 #document-voice-guide). The LLM rewrites
// the raw validator output into the three owner-facing fields the UX spec
// requires: issue, why_it_matters, suggested_fix.
//
// Why Haiku per finding instead of one batched call:
//   1. Reliability — JSON-only output stays clean when the model only emits
//      one object at a time. A batched response has to re-key everything and
//      the parser breaks if any element is malformed.
//   2. Independent failure — if the model trips on one finding, the rest still
//      get plain-language fields. A batch failure would degrade the whole
//      report to raw validator messages.
//   3. Cache friendliness — finding-level caching is naturally finer-grained.
//      The wrapper here only computes; the route handles persistence.
//
// Conventions match self-consistency-runner.ts (TIM-2343): typed runner
// signature, AbortSignal-friendly, returns null on failure so callers can
// fall back to raw_message.

import Anthropic from "@anthropic-ai/sdk";
import type { AuditFinding, AuditSeverity } from "./audit.ts";
import { stripFindingTags } from "./sanitize-finding-text.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export interface AuditSynthesisFields {
  issue: string;
  why_it_matters: string;
  suggested_fix: string;
}

export interface SynthesizeFindingArgs {
  client: Anthropic;
  model: string;
  finding: AuditFinding;
  abortSignal?: AbortSignal;
  // Voice guide loaded from disk by the route. Passed verbatim as the system
  // prompt per [[tim-2355]] guidance ("pass this verbatim as the system prompt
  // for the synthesis layer").
  voiceGuide: string;
}

// ── Voice-guide loader ───────────────────────────────────────────────────────
//
// The voice guide is the single source of truth — checked into the repo so
// the synthesis prompt is auditable and editable without a deploy.

export const VOICE_GUIDE_PATH = "src/lib/business-plan/audit-voice-guide.md";

// Engineer-facing prompt scaffold appended AFTER the voice guide. Encodes the
// I/O contract the parser expects.
const SYNTHESIS_INSTRUCTIONS = `

---

# Engineer-facing instructions

You will receive a structured validator finding as JSON. Rewrite it as three short fields a coffee-shop owner can read alone without an advisor.

Output a single JSON object -- no prose before or after -- of the shape:

{
  "issue": "<one sentence, plain English, what is wrong>",
  "why_it_matters": "<one sentence, money/time/risk consequence to the owner>",
  "suggested_fix": "<concrete next step, names the workspace when applicable>"
}

Rules:
- All three fields are required and non-empty.
- Each field is one sentence.
- Names a concrete workspace ("Open the Labor workspace", "Open the Financials workspace") when the fix lives elsewhere.
- Do not use the forbidden word list in the voice guide.
- Do not use em dashes (—). Use a regular dash with spaces ( -- ) if you need a pause.
- Match the worked-example tone -- never write a financial-statement footnote.
- Persona: knowledgeable friend who has helped open coffee shops, not a senior consultant.`;

// Build the user message — a JSON envelope describing one finding. Keep this
// compact so Haiku's input cost stays low.
export function buildSynthesisUserMessage(finding: AuditFinding): string {
  // Sanitize one more time at the prompt boundary so the model can't echo
  // a stray template tag back at us.
  const payload = {
    rule_id: finding.rule_id,
    severity: finding.severity,
    raw_message: stripFindingTags(finding.raw_message),
    quoted_text: finding.quoted_text ? stripFindingTags(finding.quoted_text) : null,
    units: finding.units,
    expected_text: finding.expected_text ? stripFindingTags(finding.expected_text) : null,
    suggested_replacement: finding.suggested_replacement ? stripFindingTags(finding.suggested_replacement) : null,
    source_workspace: finding.source.workspace_label,
    source_field: finding.source.field_label,
    target_workspace: finding.target.workspace_label,
    target_field: finding.target.field_label,
  };
  return `Rewrite this validator finding as a plain-language owner-facing card.\n\n${JSON.stringify(payload, null, 2)}`;
}

// ── Parser ──────────────────────────────────────────────────────────────────

export function parseSynthesisResponse(raw: string): AuditSynthesisFields | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip any prose around the JSON object. The prompt says JSON-only but
  // models occasionally add a backtick fence or leading "Here is the JSON:".
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const issue = typeof obj.issue === "string" ? stripFindingTags(obj.issue).trim() : "";
  const why = typeof obj.why_it_matters === "string" ? stripFindingTags(obj.why_it_matters).trim() : "";
  const fix = typeof obj.suggested_fix === "string" ? stripFindingTags(obj.suggested_fix).trim() : "";
  if (!issue || !why || !fix) return null;
  return { issue, why_it_matters: why, suggested_fix: fix };
}

// ── Runner ───────────────────────────────────────────────────────────────────

const MAX_TOKENS = 400;            // Three short sentences fit in 200 with slack.

export async function synthesizeFinding(
  args: SynthesizeFindingArgs,
): Promise<AuditSynthesisFields | null> {
  const system = `${args.voiceGuide.trim()}${SYNTHESIS_INSTRUCTIONS}`;
  const user = buildSynthesisUserMessage(args.finding);
  try {
    const resp = await args.client.messages.create(
      {
        model: args.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      },
      args.abortSignal ? { signal: args.abortSignal } : undefined,
    );
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return parseSynthesisResponse(text);
  } catch {
    return null;
  }
}

// Hash helper so the route can salt the cache by voice-guide revision. Bumps
// invalidate every cached report when the guide is edited.
export function voiceGuideHash(text: string): string {
  // Cheap djb2 — the route also uses sha256 for plan state, but voice guide
  // is tiny and a deterministic 32-bit hash is plenty here.
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  // Force unsigned hex.
  return (h >>> 0).toString(16);
}

// Type-export passthrough so the route can satisfy the unused-import linter
// without dragging audit.ts in twice. (Eslint flags "type-only re-exports
// that don't isolatedModules-encode" when this is implicit.)
export type { AuditFinding, AuditSeverity };
