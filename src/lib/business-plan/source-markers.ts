// TIM-2342: Source-tagging every quantitative claim in the BP narrative.
//
// Investor critique on TIM-2315 item #6 part 1 (Beaver & Beef): the narrative
// invented numbers that read like facts. "Phil & Sebastian house blend costs
// $6.80 per pound", "Whitehorse Farms beef at $1.80 to $2.40 per ounce", "120
// to 150 transactions per day across the daypart" — none of those numbers
// came from plan_state, none came from a sourced benchmark, none were marked
// as an estimate. A lender catches one and the entire plan's credibility falls.
//
// This module provides the protocol the narrative LLM follows + the parser
// that strips markers before render and surfaces estimate-class claims to the
// export-gate modal for human review.
//
// Marker shape (XML-style — easy to parse with a regex without needing an
// XML parser, distinctive enough that the LLM emits it consistently):
//
//   <num src="user_provided">$250,000</num>
//   <num src="computed">Year 1 revenue of $334,747</num>
//   <num src="benchmark">specialty coffee blended COGS of 30 percent</num>
//   <num src="estimate" hedge="approximately">$6.80 per pound</num>
//
// Render-time handling:
//   user_provided / computed / benchmark — strip marker, keep content verbatim.
//   estimate — strip marker, ensure a hedge prefix ("approximately", "we
//     estimate", "roughly") prepends the content if one isn't already there.
//
// Acceptance #4: source-marker round-trip — emit + parse + render, no markers
// leak to the rendered PDF. The renderForExport() function is the gate; both
// the print page and the PDF renderer call it before passing prose to the
// markdown block parser.
//
// Relative imports (no @/ aliases) so node:test can load this module without
// the Next.js path-alias resolver. Mirrors plan-state.ts and entities.ts.

// ── Public types ─────────────────────────────────────────────────────────────

export type ClaimSource =
  | "user_provided"   // Number came from a workspace input the founder typed.
  | "computed"        // Number derived from plan_state by the engine.
  | "benchmark"       // Number cited from the curated industry-benchmark dataset.
  | "estimate";       // AI generator estimate — must be hedged + flagged for review.

export interface ClaimMarker {
  // Stable id: `${sectionKey}:${index}` — populated by extractEstimatedClaims.
  // The bare parser leaves id empty (no section context).
  id: string;
  source: ClaimSource;
  // Inner text of the marker as the LLM emitted it (e.g. "$6.80 per pound").
  // Render output substitutes this back into the prose, possibly with a hedge
  // prefix prepended for estimate-class claims.
  content: string;
  // Hedge phrase the LLM attached to this marker. Optional; default at render
  // time is "approximately" if the source is "estimate" and the marker
  // contains no explicit hedge.
  hedge: string | null;
  // 0-based character offset of the OPENING tag inside the original text.
  // Lets callers reconstruct a surrounding-sentence window for the modal.
  start: number;
  // 0-based character offset just past the CLOSING tag.
  end: number;
}

export interface ParseResult {
  // Text with every marker stripped. estimate-class markers had a hedge
  // prefix prepended where one wasn't already present in the prose.
  rendered: string;
  // Every marker the parser found, in document order.
  markers: ClaimMarker[];
  // Per-source counts. Useful for telemetry + sanity-checks in tests.
  counts: Record<ClaimSource, number>;
}

export interface EstimatedClaim {
  // Stable id: `${sectionKey}:${markerIndex}`.
  id: string;
  section_key: string;
  // The content text (e.g. "$6.80 per pound").
  content: string;
  // The hedge that will render in the final prose (e.g. "approximately").
  hedge: string;
  // The surrounding sentence — what the modal shows the founder so they can
  // judge whether to verify or replace.
  surrounding_sentence: string;
}

// ── Prompt protocol ──────────────────────────────────────────────────────────
//
// SOURCE_MARKER_DIRECTIVE is injected into every section system prompt. The
// narrative LLM is REQUIRED to mark every numeric claim it emits with one
// of four sources. Numbers that can't honestly be tagged user_provided,
// computed, or benchmark MUST be tagged "estimate" with a hedge — that's how
// we keep ourselves honest with the lender.

export const SOURCE_MARKER_DIRECTIVE = `Source-marker rule (every quantitative claim must be tagged):
- Wrap every numeric claim you emit in an XML-style marker that names its source:
  <num src="user_provided">…the literal number…</num>          — number came from a workspace input the founder typed (capital stack, lease rent, headcount, etc).
  <num src="computed">…the literal number…</num>               — number was derived by the financial engine and appears in the Ground Truth block below.
  <num src="benchmark">…the literal number…</num>              — number is cited from the Industry Benchmarks block below.
  <num src="estimate" hedge="approximately">…the number…</num> — number is YOUR estimate. You MUST attach a hedge attribute ("approximately", "roughly", "we estimate", "in the range of").
- Approved sources are ONLY: the Ground Truth Numbers block, the Industry Benchmarks block, and explicit user-entered values mentioned in the section auto-content. Everything else is "estimate" and MUST be hedged.
- The dollar figure, headcount, percentage, ratio, square-footage, or count goes INSIDE the marker — including any unit or qualifier ("$6.80 per pound", "30 percent", "120 transactions per day"). The marker is opaque to render — the founder sees only the inner text.
- Apply this to EVERY numeric claim, even ones that read as background ("the shop will open six days a week" → <num src="user_provided">six days a week</num>).
- Do NOT mark dates, years (e.g. "Year 1"), or version numbers as numeric claims — those are not the kind of "number" lenders care about.
- The export pipeline strips the markers before render; you don't need to worry about them appearing in the PDF. Estimate-class claims get a hedge prefix in the rendered prose and are surfaced to the founder for review.`;

// ── Hedge handling ──────────────────────────────────────────────────────────

const DEFAULT_HEDGE = "approximately";

// Hedge phrases the renderer recognizes as "already hedged". If the content
// starts with one of these (case-insensitive, leading whitespace OK), we do
// not double-prefix. Keep this list aligned with what SOURCE_MARKER_DIRECTIVE
// invites the LLM to use.
const EXISTING_HEDGE_PATTERNS: ReadonlyArray<RegExp> = [
  /^approximately\b/i,
  /^roughly\b/i,
  /^we\s+estimate\b/i,
  /^estimated\b/i,
  /^in\s+the\s+range\s+of\b/i,
  /^around\b/i,
  /^about\b/i,
];

function contentHasHedge(content: string): boolean {
  const trimmed = content.replace(/^\s+/, "");
  return EXISTING_HEDGE_PATTERNS.some((re) => re.test(trimmed));
}

// ── Parser ──────────────────────────────────────────────────────────────────
//
// Matches <num src="..." hedge="...">inner</num>. We allow:
//   - either single or double quotes around attribute values,
//   - optional whitespace between attributes,
//   - hedge attribute optional (only meaningful for "estimate" source).
//
// The inner text is captured non-greedily up to the closing tag so adjacent
// markers don't bleed into each other.

const MARKER_RE = /<num\s+src=(?:"([^"]*)"|'([^']*)')(?:\s+hedge=(?:"([^"]*)"|'([^']*)'))?\s*>([\s\S]*?)<\/num>/g;

function normalizeSource(raw: string): ClaimSource {
  const s = raw.trim().toLowerCase();
  if (s === "user_provided" || s === "computed" || s === "benchmark" || s === "estimate") return s;
  // Anything we don't recognize falls back to "estimate" so it still surfaces
  // for human review (safer than silently passing it as authoritative).
  return "estimate";
}

export function parseSourceMarkers(text: string): ParseResult {
  if (!text || typeof text !== "string") {
    return {
      rendered: text ?? "",
      markers: [],
      counts: { user_provided: 0, computed: 0, benchmark: 0, estimate: 0 },
    };
  }

  const markers: ClaimMarker[] = [];
  const out: string[] = [];
  let lastIndex = 0;
  const counts: Record<ClaimSource, number> = {
    user_provided: 0,
    computed: 0,
    benchmark: 0,
    estimate: 0,
  };

  MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const srcRaw = m[1] ?? m[2] ?? "";
    const hedgeRaw = m[3] ?? m[4] ?? null;
    const content = m[5] ?? "";
    const source = normalizeSource(srcRaw);
    const hedge = hedgeRaw && hedgeRaw.trim().length > 0 ? hedgeRaw.trim() : null;

    out.push(text.slice(lastIndex, m.index));

    // Render the inner content. For estimate-class claims, prepend a hedge
    // prefix unless the prose already opens with one. Other sources render
    // the content verbatim.
    let renderedContent: string;
    if (source === "estimate") {
      const effectiveHedge = hedge ?? DEFAULT_HEDGE;
      renderedContent = contentHasHedge(content)
        ? content
        : `${effectiveHedge} ${content.replace(/^\s+/, "")}`;
    } else {
      renderedContent = content;
    }
    out.push(renderedContent);

    markers.push({
      id: "",
      source,
      content,
      hedge,
      start: m.index,
      end: m.index + m[0].length,
    });
    counts[source] += 1;

    lastIndex = m.index + m[0].length;
  }
  out.push(text.slice(lastIndex));

  return {
    rendered: out.join(""),
    markers,
    counts,
  };
}

// ── Render-only shortcut ─────────────────────────────────────────────────────
//
// renderForExport() is what every PDF/print path calls right before passing
// prose to the markdown renderer. Strips every marker, applies hedge prefix
// to estimate-class claims that didn't already carry one. Acceptance #4 pins
// that no marker leaks past this boundary.

export function renderForExport(text: string): string {
  return parseSourceMarkers(text).rendered;
}

// ── Estimate extraction (for the export-gate modal) ─────────────────────────

const SENTENCE_BOUNDARY_RE = /[.!?]+\s+/g;

function surroundingSentenceFromMarker(
  text: string,
  marker: ClaimMarker,
): string {
  // Walk backward from the marker's start until we hit a sentence-ending
  // boundary or the start of text. Walk forward from end until we hit a
  // boundary or the end. The slice between is what we hand to the modal.
  // Caps the window at 240 characters so a runaway paragraph doesn't fill
  // the modal.
  const startSearch = Math.max(0, marker.start - 240);
  const endSearch = Math.min(text.length, marker.end + 240);
  const before = text.slice(startSearch, marker.start);
  const after = text.slice(marker.end, endSearch);

  let sentenceStart = startSearch;
  let lastBoundary = -1;
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  let bm: RegExpExecArray | null;
  while ((bm = SENTENCE_BOUNDARY_RE.exec(before)) !== null) {
    lastBoundary = bm.index + bm[0].length;
  }
  if (lastBoundary !== -1) sentenceStart = startSearch + lastBoundary;

  let sentenceEnd = endSearch;
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  const firstBoundary = SENTENCE_BOUNDARY_RE.exec(after);
  if (firstBoundary) sentenceEnd = marker.end + firstBoundary.index + firstBoundary[0].length;

  // Pull the rendered (marker-stripped) sentence so the modal shows the prose
  // the founder will see in the PDF — including the hedge prefix on estimates.
  const rawSlice = text.slice(sentenceStart, sentenceEnd);
  return renderForExport(rawSlice).trim();
}

// extractEstimatedClaims walks the markers found in a section's prose and
// returns only the estimate-class ones, packaged for the export-gate modal.
// Section key + position give each claim a stable id the modal can key on.

export function extractEstimatedClaims(
  sectionKey: string,
  text: string,
): EstimatedClaim[] {
  if (!text || typeof text !== "string") return [];
  const parsed = parseSourceMarkers(text);
  const claims: EstimatedClaim[] = [];
  parsed.markers.forEach((marker, idx) => {
    if (marker.source !== "estimate") return;
    const hedge = marker.hedge ?? DEFAULT_HEDGE;
    claims.push({
      id: `${sectionKey}:estimate:${idx}`,
      section_key: sectionKey,
      content: marker.content.trim(),
      hedge,
      surrounding_sentence: surroundingSentenceFromMarker(text, marker),
    });
  });
  return claims;
}

// ── Bare strip (no hedge insertion) ─────────────────────────────────────────
//
// Strips markers and emits content verbatim — no hedge prefix added. Used by
// the validator's claim extractor so reconciliation sees the raw narrative
// numbers without the renderer's added words confusing keyword routing.

export function stripMarkersRaw(text: string): string {
  if (!text || typeof text !== "string") return text ?? "";
  return text.replace(MARKER_RE, (_full, _q1, _q2, _h1, _h2, content) => content as string);
}
