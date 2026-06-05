// TIM-2343: Per-section self-consistency check (BP Quality J).
//
// Investor critique on TIM-2315 (Beaver & Beef) flagged a one-paragraph
// self-contradiction the LLM emitted because it had no awareness of what it
// just said: "Owner draws $3,000 per month from month five" two sentences
// later contradicted by "Year 1 assumes no Owner draw". This module wraps
// every freshly-generated section in a lightweight skeptical-reader LLM call
// that extracts every numerical, categorical, and temporal claim and flags
// any pair within the same section that cannot both be true.
//
// When contradictions are found, the route does ONE regeneration with the
// pairs called out in the prompt ("you wrote X and Y in the same paragraph,
// fix"). If the regen still contains contradictions, the surviving set is
// attached to the SSE payload so the export-gate modal surfaces them as
// advisory (never blocking — narrative-vs-itself is a quality signal, not a
// numeric reconciliation against plan_state).
//
// Distinct from TIM-2336 (narrative-vs-plan_state reconciliation) — that
// catches "you said $4,880/mo rent but the table shows $0". This catches
// "you said $3,000/mo owner draw and zero owner draws in the same breath".
//
// Relative imports + node:test compatible — mirrors plan-state.ts, validate.ts,
// source-markers.ts, entities.ts. Keep this module dependency-free so the
// route can import it cheaply and a unit-test runner can exercise the parser
// without spinning up an Anthropic mock.

// ── Public types ─────────────────────────────────────────────────────────────

export type ContradictionKind =
  | "numerical"    // "$3,000/mo owner draw" + "no owner draw in Y1"
  | "categorical"  // "we will not do delivery" + "delivery drives Y2 growth"
  | "temporal"     // "opening month 6" + "ramp begins month 4"
  | "other";

export interface SelfConsistencyContradiction {
  // Stable id: `${sectionKey}:${index}`.
  id: string;
  section_key: string;
  kind: ContradictionKind;
  // The two contradicting fragments quoted verbatim from the narrative.
  // Capped at 500 chars each so a misbehaving LLM can't blow up the payload.
  claim_a: string;
  claim_b: string;
  // One-sentence explanation the modal renders below the pair.
  explanation: string;
}

// ── System prompt for the consistency checker ────────────────────────────────
// Haiku-fast, JSON-only output. The route runs the LLM; this module hands it
// the prompt + parser so the route stays thin.

export const SELF_CONSISTENCY_SYSTEM_PROMPT = `You are a meticulous proofreader. Your only job is to find pairs of statements within a single business-plan section that contradict each other.

A contradiction is two statements that cannot both be true. Three categories:

1. NUMERICAL — two different numbers describing the same thing.
   Example: "Owner draws $3,000 per month from month five" + "Year 1 assumes no owner draw."
   Example: "Total raise of $250,000" + "the $280,000 raise covers build-out."
2. CATEGORICAL — a decision asserted one way, then the opposite.
   Example: "We will not offer delivery." + "Delivery will drive Y2 growth."
3. TEMPORAL — two different timings for the same event.
   Example: "Opening month 6." + "Ramp begins month 4."

DO NOT flag:
- A number that simply differs from a number in a DIFFERENT context (Y1 revenue ≠ Y2 revenue is not a contradiction).
- A ranged claim ("$3 to $5 per cup") versus a point claim ("$4 average") — those are consistent.
- A stylistic disagreement, a typo, or a credibility tell.
- A claim that contradicts something OUTSIDE the section text.

You MUST respond with a single JSON object — no prose before or after — of the shape:

{
  "contradictions": [
    {
      "kind": "numerical" | "categorical" | "temporal" | "other",
      "claim_a": "<exact verbatim quote of the first statement>",
      "claim_b": "<exact verbatim quote of the second statement>",
      "explanation": "<one sentence describing why the two cannot both be true>"
    }
  ]
}

Return at most 5 contradictions. If the section reads cleanly, return {"contradictions":[]}.`;

export function buildSelfConsistencyUserMessage(
  sectionTitle: string,
  sectionText: string,
): string {
  return `Section: ${sectionTitle}

Narrative (verbatim — read end to end before judging):

${sectionText}

Return the JSON described in your instructions.`;
}

// ── Response parser ──────────────────────────────────────────────────────────

export function parseSelfConsistencyResponse(
  raw: string,
  sectionKey: string,
): SelfConsistencyContradiction[] {
  if (!raw || typeof raw !== "string") return [];
  // Strip code fences if the model wrapped JSON in ```.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const arr = (parsed as { contradictions?: unknown }).contradictions;
  if (!Array.isArray(arr)) return [];

  const out: SelfConsistencyContradiction[] = [];
  for (let i = 0; i < arr.length && i < 10; i++) {
    const f = arr[i];
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    const kind = normalizeKind(obj.kind);
    const claimA = typeof obj.claim_a === "string" ? obj.claim_a.trim().slice(0, 500) : "";
    const claimB = typeof obj.claim_b === "string" ? obj.claim_b.trim().slice(0, 500) : "";
    const explanation = typeof obj.explanation === "string" ? obj.explanation.trim().slice(0, 500) : "";
    // Drop empty pairs — a "contradiction" with nothing on one side is noise.
    if (!claimA || !claimB) continue;
    // Drop pairs where both fragments are identical text — that's the model
    // reusing the same quote on both sides, not a contradiction.
    if (claimA === claimB) continue;
    out.push({
      id: `${sectionKey}:${i}`,
      section_key: sectionKey,
      kind,
      claim_a: claimA,
      claim_b: claimB,
      explanation: explanation || "These statements cannot both be true.",
    });
  }
  return out;
}

function normalizeKind(v: unknown): ContradictionKind {
  if (v === "numerical" || v === "categorical" || v === "temporal" || v === "other") {
    return v;
  }
  return "other";
}

// ── Regeneration directive ───────────────────────────────────────────────────
// Appended to the section user-message when the route asks the narrative LLM
// to fix the contradictions it just emitted. Acceptance #3: voice must be
// preserved — the directive instructs the LLM to keep the rest verbatim and
// only rewrite the smallest substring that resolves the conflict.

export function buildConsistencyFixDirective(
  contradictions: SelfConsistencyContradiction[],
): string {
  if (contradictions.length === 0) return "";
  const lines: string[] = [];
  lines.push("REVISION REQUEST — your previous draft contained internal contradictions. Rewrite it so the contradictions below no longer appear. Keep the voice, structure, paragraph count, and every non-contradicting sentence VERBATIM. Change only the smallest amount of text needed to resolve each pair.");
  lines.push("");
  lines.push("Contradictions to fix:");
  for (let i = 0; i < contradictions.length; i++) {
    const c = contradictions[i];
    lines.push(`${i + 1}. [${c.kind}] You wrote "${c.claim_a}" AND "${c.claim_b}" in the same section. ${c.explanation} Resolve by keeping whichever side is grounded in the Ground Truth Numbers block above (or, if neither is, by removing the unsupported figure).`);
  }
  lines.push("");
  lines.push("Return the full revised section — no preamble, no explanation, no diff markers.");
  return lines.join("\n");
}
