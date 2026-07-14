// AI content normalization (TIM-1348 / TIM-1356).
//
// Spec: tcs-agent-workspace/AI-CONTENT-NORMALIZATION.md — "normalize at the
// source, every time". Every AI-generated user-facing string passes through
// one of these functions at the generation boundary (server action, seed
// script, or Klaviyo/Shopify/Canva push), never at the display surface.
//
// The ESLint rule `require-normalized-ai-output` enforces this at merge time.

export { toTitleCase } from "./text.ts";
import { toTitleCase } from "./text.ts";

// AI clichés banned per TIM-882. Each entry maps a jargon pattern to a plain
// replacement. Patterns are matched case-insensitively on word boundaries;
// the original token's leading capitalization is preserved on the replacement.
const AI_JARGON: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bdelve into\b/gi, "explore"],
  [/\bdelve\b/gi, "explore"],
  [/\bdiving deeper\b/gi, "going further"],
  [/\bdive deeper\b/gi, "go further"],
  [/\bdive into\b/gi, "get into"],
  [/\bleveraging\b/gi, "using"],
  [/\bleverage\b/gi, "use"],
  [/\bgame[-\s]?changer\b/gi, "major improvement"],
  [/\bgame[-\s]?changing\b/gi, "major"],
  [/\bunlock\b/gi, "open up"],
  [/\belevate\b/gi, "improve"],
  [/\bseamless\b/gi, "smooth"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bcutting[-\s]edge\b/gi, "modern"],
  [/\bin today's fast[-\s]paced world,?\s*/gi, ""],
  [/\bit's important to note that\b/gi, ""],
  [/\bit is important to note that\b/gi, ""],
];

// Corporate-filler openers removed by applyVoiceRules. Stripped from the start
// of a clause so "We are pleased to offer X" reads as "Offer X" → "Offering X"
// is left to the writer; we only remove the filler, we don't rewrite verbs.
const VOICE_FILLER: ReadonlyArray<RegExp> = [
  /\bwe(?:'re| are) (?:pleased|excited|thrilled|delighted|happy) to (?:announce that |share that |offer |present |introduce )?/gi,
  /\bwe would like to\b/gi,
  /\bplease note that\b/gi,
];

function preserveLeadingCase(match: string, replacement: string): string {
  if (!replacement) return replacement;
  const firstAlpha = match.match(/[a-zA-Z]/)?.[0];
  if (firstAlpha && firstAlpha === firstAlpha.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function collapseSpaces(s: string): string {
  // Collapse runs of spaces/tabs (not newlines) and tidy space-before-punctuation.
  return s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n");
}

/**
 * Remove banned AI clichés (delve, leverage, dive deeper, game-changer, …) and
 * replace them with plain alternatives. Leaves all other text untouched.
 */
export function stripAIJargon(input: string): string {
  if (!input) return input;
  let out = input;
  for (const [pattern, replacement] of AI_JARGON) {
    out = out.replace(pattern, (m) => preserveLeadingCase(m, replacement));
  }
  return collapseSpaces(out);
}

/**
 * Enforce brand voice on body copy:
 * - Replace em/en dashes used as sentence breaks with a comma (TIM voice
 *   mandate: no em dashes in user-facing copy — QA bounces them).
 * - Strip corporate-filler openers ("We are pleased to …", "We would like to …").
 *
 * Sentence-shaped copy only. Do not use on label-shaped fields.
 */
export function applyVoiceRules(input: string): string {
  if (!input) return input;
  let out = input;
  // Em dash and en dash (spaced or unspaced) → comma. Keep hyphens in
  // compound words intact (those have no surrounding spaces and are "-", not – or —).
  out = out.replace(/\s*[—–]\s*/g, ", ");
  for (const pattern of VOICE_FILLER) {
    out = out.replace(pattern, "");
  }
  // Re-capitalize a clause that lost its leading filler.
  out = out.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre, ch) => pre + ch.toUpperCase());
  return collapseSpaces(out).trim();
}

// Emoji / pictographic ranges. Extended_Pictographic covers the bulk; we also
// drop variation selectors, ZWJ, skin-tone modifiers, and regional-indicator
// pairs so ZWJ sequences (👩‍🚀) don't leave orphan joiners. Plain ASCII digits,
// '#', and '*' are intentionally NOT matched.
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}(?:[\u{FE0F}]|\u{200D}\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)|[\u{1F1E6}-\u{1F1FF}]{1,2}|[\u{FE00}-\u{FE0F}]|\u{200D}/gu;

/**
 * Strip emoji from body/paragraph text. Do NOT call on email subject lines or
 * marketing card titles — emoji there is permitted (TIM-306).
 */
export function stripEmojiFromBody(input: string): string {
  if (!input) return input;
  return collapseSpaces(input.replace(EMOJI_RE, "")).replace(/^[ \t]+|[ \t]+$/gm, "");
}

// A string is "label-shaped" (safe to title-case wholesale) when it is a short,
// single-line fragment with no sentence punctuation — e.g. "mocha latte
// training". Multi-sentence prose is left in sentence case by normalizeAIOutput.
function isLabelShaped(input: string): boolean {
  const t = input.trim();
  if (!t || t.includes("\n")) return false;
  if (t.length > 80) return false;
  if (/[.!?](\s|$)/.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false;
  return true;
}

/**
 * TIM-3854: Strip repeated all-caps placeholder tokens that the model
 * sometimes emits when it is confused about missing context — the canonical
 * failure mode is "HEREHEREHEREHERE..." leaking into the Executive Summary
 * preview. Also catches [FILL IN], {{PLACEHOLDER}}, and XXXXXX visual
 * placeholders. Upstream fix is the workspace-first seed (see the seed-context
 * module) — this is defense-in-depth so a garbage token never reaches the UI.
 *
 * Two false-positive gates surfaced in TIM-3854 code review:
 *  1. Space-separated repetition of a legit ALLCAPS acronym is real prose
 *     ("SBA SBA SBA underwriters..."). Only strip space-separated repeats
 *     when the token is 4+ chars AND appears 4+ times — real acronyms are
 *     rarely typed four times in a row, "HEREHEREHEREHERE" always is.
 *     Concatenated repeats ("HEREHEREHERE") stay at 3+ since legitimate
 *     prose never runs the same all-caps word together with no separator.
 *  2. Bracket markers `[TODO]`/`[TBD]` are legitimate lender-facing "to
 *     be determined" annotations — dropped from the strip list. The
 *     canonical junk shape is `[FILL IN]`/`[INSERT XYZ]`/`{{VAR}}`.
 */
export function stripPlaceholderTokens(input: string): string {
  if (!input) return input;
  return input
    // Concatenated repetition — "HEREHEREHERE", "TODOTODOTODO". Legit prose
    // never runs the same all-caps word together with zero separator.
    .replace(/\b([A-Z]{2,8})\1{2,}\b/g, "")
    // Space-separated repetition — require 4+ occurrences AND 4+ char token
    // so "SBA SBA SBA" and "CAM CAM CAM" survive. "HERE HERE HERE HERE" does not.
    .replace(/\b([A-Z]{4,8})(?:[ \t]+\1){3,}\b/g, "")
    // Bracket-style placeholders. Deliberately NOT stripping TODO/TBD — those
    // are legit "to be determined" annotations a lender/founder may keep in
    // the draft. FILL IN / PLACEHOLDER / INSERT are only ever junk.
    .replace(/\[(?:FILL[ _-]?IN|PLACEHOLDER|INSERT[ _-]?[A-Z0-9 _-]*)\]/gi, "")
    .replace(/\{\{[A-Z0-9_]+\}\}/g, "")
    // Runs of the same visual placeholder char (X or _) 6+ in a row. Case-
    // sensitive uppercase X only — lowercase `xxxxxx` in prose is unlikely
    // but not junk (e.g. redacted anonymized token in a sample paragraph).
    .replace(/[X_]{6,}/g, "")
    // Collapse the double-space + stranded punctuation-space blemish that
    // shows up when a stripped token sat between two words (e.g.
    // "prose HEREHEREHERE continues" → "prose  continues").
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1");
}

/**
 * Convenience: run all four normalizers in sequence on raw AI output.
 *
 * Order: strip jargon → apply voice rules → strip body emoji → (opt-in)
 * strip placeholder tokens → title-case. Title-casing is applied ONLY to
 * label-shaped fragments so paragraph copy is not wrongly capitalized
 * (toTitleCase must never run on full sentences — see text.ts). For a known
 * label field, call `toTitleCase` directly instead.
 *
 * `stripPlaceholders` defaults to FALSE. It is BP-specific defense-in-depth
 * for the TIM-3854 "HEREHEREHERE..." confusion output and MUST be scoped to
 * BP generation surfaces — enabling it globally would silently delete
 * intentional JD template markers like `[Insert manager name]` in the
 * hiring workspace, `XXXXXXXXX` redactions in location/buildout notes, and
 * signature-line underscores in lease copy across ~20 non-BP AI routes.
 * Only /api/business-plan/{improve,generate,regenerate-all} should pass true.
 */
export interface NormalizeOptions {
  stripPlaceholders?: boolean;
}

export function normalizeAIOutput(input: string, opts?: NormalizeOptions): string {
  if (!input) return input;
  let out = stripAIJargon(input);
  out = applyVoiceRules(out);
  out = stripEmojiFromBody(out);
  if (opts?.stripPlaceholders) {
    out = stripPlaceholderTokens(out);
  }
  if (isLabelShaped(out)) {
    out = toTitleCase(out);
  }
  return out;
}
