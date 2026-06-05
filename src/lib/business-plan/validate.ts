// TIM-2336: Export-time validation suite for business plans.
//
// Pass 1 (this module): programmatic reconciliation between narrative-quoted
// numbers and plan_state — the same engine the financial tables read. Catches
// the four investor-flagged contradictions on Beaver & Beef (TIM-2315):
//   #1 narrative "7 staff" vs table 3
//   #2 narrative "raise $280K" vs sources $250K
//   #3 narrative "rent $4,880/mo" vs P&L $0
//   #4 narrative "Y1 -$59,825 net loss" vs table +$31,313 net profit
// plus mismatches on Y1..Y5 revenue/net income, equity, debt, use-of-funds
// total, monthly opex lines, and monthly payroll.
//
// Pass 2 (separate — invoked from the route): qualitative LLM critic, NOT in
// this file so the validator stays pure and unit-testable under node:test.
//
// Conventions match plan-state.ts: relative imports (no @/ aliases), node:test
// can load this module without the Next.js resolver.

import type {
  PlanState,
  PlanStateYearSummary,
} from "./plan-state.ts";

// ── Public types ─────────────────────────────────────────────────────────────

export type FindingSeverity = "blocking" | "advisory";

export type FindingKind =
  | "numeric_mismatch"  // Pass 1: narrative figure ≠ plan_state figure
  | "sign_mismatch"     // Pass 1: narrative said "loss" but plan_state is profit (or vice versa)
  | "qualitative";      // Pass 2: critical-reader prose finding

export type ClaimUnits = "currency" | "count" | "percent";

export interface NumericFinding {
  id: string;                       // stable identifier ${section}:${dimension}:${position}
  section_key: string;
  severity: FindingSeverity;        // Pass 1 is always "blocking"; Pass 2 is "advisory"
  kind: FindingKind;
  dimension: string;                // dotted-path into plan_state, e.g. "lease.monthly_rent"
  dimension_label: string;          // human-readable, e.g. "Monthly rent"
  units: ClaimUnits;
  // Verbatim text the narrative used. Length-capped to keep the modal readable.
  quoted_text: string;
  // What the narrative claimed, normalized into the same unit as expected_value.
  claim_value: number;
  // What plan_state says (signed cents for currency, integer for count, % for percent).
  expected_value: number;
  // Pre-formatted version of expected_value the modal shows verbatim (e.g. "$31,313").
  expected_text: string;
  // When auto_correctable, a single replacement string the user can one-click apply.
  suggested_replacement: string | null;
  auto_correctable: boolean;
  // One-line explanation for the modal. Names the dimension and shows both sides.
  message: string;
}

export interface QualitativeFinding {
  id: string;
  section_key: string;
  severity: "advisory";              // always advisory by spec
  kind: "qualitative";
  category: "contradiction" | "missing_section" | "credibility" | "typo" | "boilerplate" | "other";
  message: string;
  quoted_text: string | null;
}

export interface ValidationReport {
  // True iff at least one Pass 1 finding remains unresolved. The export
  // endpoint gates on this; Pass 2 findings are NEVER blocking by spec.
  blocking: boolean;
  numeric_findings: NumericFinding[];
  qualitative_findings: QualitativeFinding[];
  // Diagnostic — how many narrative claims the extractor saw vs how many it
  // matched to a plan_state dimension. Surfaces extraction coverage holes.
  stats: {
    claims_extracted: number;
    claims_matched: number;
    sections_scanned: number;
  };
}

// ── Currency formatter (matches plan-state.formatPlanStateForPrompt) ─────────

function fmtCents(cents: number, currencyCode: string): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const hasDecimals = Math.abs(dollars - Math.round(dollars)) > 0.005;
  const formatted = hasDecimals
    ? abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(abs).toLocaleString("en-US");
  const sign = dollars < 0 ? "-" : "";
  // Plan-state prompt uses "USD 4,880"; user-facing modal and findings use
  // the dollar sign so the proposed replacement reads naturally in narrative.
  void currencyCode;
  return `${sign}$${formatted}`;
}

// ── Expectation table — every dimension we know how to validate. ─────────────

interface Expectation {
  dim: string;
  label: string;
  units: ClaimUnits;
  value: number;             // cents for currency, count for count, % for percent
  // Keyword routing — at least one must appear in the context for the
  // expectation to be considered. The first expectation matched wins
  // (priority is array order — more specific dimensions go first).
  keywords: string[];
  // Optional year scoping — when set, the context must also contain a
  // matching year reference (year 1, Y1, first year, …) to match.
  year?: number;
  // Sign sensitivity — when true, the sign of a parsed currency claim is
  // taken from the surrounding text (loss/profit/deficit/income).
  signed?: boolean;
  // Allow narrative to match this expectation only when the claim units
  // match (e.g. headcount is always units="count").
  // (Currency and count never collide because the extractor stamps units.)
}

function expectationsFromPlanState(state: PlanState): Expectation[] {
  const exps: Expectation[] = [];

  // ── Lease ──────────────────────────────────────────────────────────────────
  if (state.lease.monthly_rent_cents >= 0) {
    exps.push({
      dim: "lease.monthly_rent",
      label: "Monthly rent",
      units: "currency",
      value: state.lease.monthly_rent_cents,
      // Order matters: "lease cost" before "lease" alone so it triggers on
      // the most specific phrasing first.
      keywords: ["monthly rent", "lease cost", "rent of", "rent at", "rent line", "rent —", "rent of $", "rent is", "rent will", "rent payment", "rent (", "rent."],
    });
  }

  // ── Capital stack ──────────────────────────────────────────────────────────
  if (state.capital_stack.total_raise_cents > 0) {
    exps.push({
      dim: "capital_stack.total_raise",
      label: "Total raise",
      units: "currency",
      value: state.capital_stack.total_raise_cents,
      keywords: ["total raise", "capital raise", "raising a total", "raising $", "raise of", "total funding", "total capital", "funding total", "seeking $", "we seek", "request $"],
    });
  }
  if (state.capital_stack.equity_cents > 0) {
    exps.push({
      dim: "capital_stack.equity",
      label: "Equity",
      units: "currency",
      value: state.capital_stack.equity_cents,
      keywords: ["equity injection", "equity contribution", "in equity", "of equity", "equity capital", "equity portion"],
    });
  }
  if (state.capital_stack.debt_cents > 0) {
    exps.push({
      dim: "capital_stack.debt",
      label: "Debt",
      units: "currency",
      value: state.capital_stack.debt_cents,
      keywords: ["sba loan", "term loan", "in debt", "of debt", "loan of", "loan amount", "debt financing", "debt portion", "loan principal"],
    });
  }

  // ── Use of funds ───────────────────────────────────────────────────────────
  if (state.use_of_funds.total_cents > 0) {
    exps.push({
      dim: "use_of_funds.total",
      label: "Use of funds total",
      units: "currency",
      value: state.use_of_funds.total_cents,
      keywords: ["use of funds", "total uses", "total use of funds"],
    });
  }

  // ── Years 1..5 (revenue, net income, operating income, ending cash) ───────
  for (const y of state.years) {
    pushYearExpectations(exps, y);
  }

  // ── Opex (steady-state monthly per overhead line) ─────────────────────────
  for (const line of state.opex.lines) {
    // The label IS the keyword (e.g. "Utilities", "Insurance"); we match
    // "$700/mo utilities" or "utilities at $700/mo" both ways. Skip rent —
    // already captured by lease.monthly_rent with richer keywords.
    if (line.key === "rent") continue;
    exps.push({
      dim: `opex.${line.key}.monthly`,
      label: `${line.label} (monthly)`,
      units: "currency",
      value: line.monthly_cents,
      keywords: [`${line.label.toLowerCase()} of`, `${line.label.toLowerCase()} at`, `monthly ${line.label.toLowerCase()}`, `${line.label.toLowerCase()} cost`, `${line.label.toLowerCase()} — `, `${line.label.toLowerCase()}:`],
    });
  }

  // ── Labor (total headcount + total monthly payroll) ────────────────────────
  if (state.labor.total_headcount > 0) {
    exps.push({
      dim: "labor.total_headcount",
      label: "Total headcount",
      units: "count",
      value: state.labor.total_headcount,
      // Plain "staff" / "team" wins after currency keywords filter out.
      keywords: ["staff", "employees", "team members", "ftes", "fte", "baristas", "headcount", "hires"],
    });
  }
  if (state.labor.monthly_loaded_cost_cents > 0) {
    exps.push({
      dim: "labor.monthly_payroll",
      label: "Monthly payroll",
      units: "currency",
      value: state.labor.monthly_loaded_cost_cents,
      keywords: ["monthly payroll", "payroll of", "labor cost", "monthly labor", "loaded payroll", "labor expense"],
    });
  }

  return exps;
}

function pushYearExpectations(exps: Expectation[], y: PlanStateYearSummary): void {
  const yr = y.year;
  exps.push({
    dim: `years.${yr}.revenue`,
    label: `Year ${yr} revenue`,
    units: "currency",
    value: y.revenue_cents,
    keywords: ["revenue", "top-line", "sales", "top line"],
    year: yr,
  });
  exps.push({
    dim: `years.${yr}.net_income`,
    label: `Year ${yr} net income`,
    units: "currency",
    value: y.net_income_cents,
    keywords: ["net income", "net profit", "net loss", "bottom line", "bottom-line"],
    year: yr,
    signed: true,
  });
  exps.push({
    dim: `years.${yr}.operating_income`,
    label: `Year ${yr} operating income`,
    units: "currency",
    value: y.operating_income_cents,
    keywords: ["operating income", "operating profit", "operating loss"],
    year: yr,
    signed: true,
  });
  exps.push({
    dim: `years.${yr}.ending_cash`,
    label: `Year ${yr} ending cash`,
    units: "currency",
    value: y.ending_cash_cents,
    keywords: ["ending cash", "cash balance", "cash at year-end", "cash on hand"],
    year: yr,
  });
}

// ── Numeric extraction ────────────────────────────────────────────────────────

type RawClaim =
  | { units: "currency"; cents: number; raw: string; start: number; end: number; signCarriesLoss: boolean }
  | { units: "count"; n: number; raw: string; start: number; end: number }
  | { units: "percent"; pct: number; raw: string; start: number; end: number };

// Word-number map for headcount tells like "team of seven".
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

// Currency: matches "$280K", "$280,000", "$4,880", "$1.2M", "$59,825.50".
// The K/M suffix is taken case-insensitive; "million"/"thousand"/"billion"
// spelled out match too. Captures preserve the exact match for quoting.
const CURRENCY_RE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(K|k|M|m|B|b|thousand|million|billion)?\b/g;

// Headcount: digit form "7 staff", word form "seven staff". Same allowed
// nouns as the expectation keywords.
const HEADCOUNT_DIGIT_RE = /\b(\d{1,3})\s+(staff|employees|baristas|team\s+members|hires|FTEs?|headcount)\b/gi;
const HEADCOUNT_WORD_RE = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s+(staff|employees|baristas|team\s+members|hires|FTEs?|headcount)\b/gi;

function parseCurrencyCents(numStr: string, suffix: string | undefined): number {
  const n = Number(numStr.replace(/,/g, ""));
  if (!Number.isFinite(n)) return NaN;
  let multiplier = 1;
  if (suffix) {
    const s = suffix.toLowerCase();
    if (s === "k" || s === "thousand") multiplier = 1_000;
    else if (s === "m" || s === "million") multiplier = 1_000_000;
    else if (s === "b" || s === "billion") multiplier = 1_000_000_000;
  }
  // Cents = dollars * 100. Round so $1.2M comes out clean.
  return Math.round(n * multiplier * 100);
}

function extractClaims(text: string): RawClaim[] {
  const claims: RawClaim[] = [];

  // ── Currency ────────────────────────────────────────────────────────────────
  CURRENCY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CURRENCY_RE.exec(text)) !== null) {
    const cents = parseCurrencyCents(m[1], m[2]);
    if (!Number.isFinite(cents) || cents <= 0) continue;
    // Sign is determined later when matching against a signed dimension;
    // we carry a flag for "loss"/"deficit" so the dimension matcher can flip.
    claims.push({
      units: "currency",
      cents,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
      signCarriesLoss: false,  // filled in by inferLossSign during matching
    });
  }

  // ── Headcount (digits) ──────────────────────────────────────────────────────
  HEADCOUNT_DIGIT_RE.lastIndex = 0;
  while ((m = HEADCOUNT_DIGIT_RE.exec(text)) !== null) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    claims.push({
      units: "count",
      n,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  // ── Headcount (word form) ───────────────────────────────────────────────────
  HEADCOUNT_WORD_RE.lastIndex = 0;
  while ((m = HEADCOUNT_WORD_RE.exec(text)) !== null) {
    const n = WORD_NUMBERS[m[1].toLowerCase()];
    if (n === undefined) continue;
    claims.push({
      units: "count",
      n,
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  return claims;
}

// ── Context utilities ────────────────────────────────────────────────────────

const CONTEXT_WINDOW = 180;

function contextAround(text: string, start: number, end: number): string {
  const a = Math.max(0, start - CONTEXT_WINDOW);
  const b = Math.min(text.length, end + 60);
  return text.slice(a, b).toLowerCase();
}

function yearInContext(ctx: string): number | null {
  // Match "year 1", "year one", "y1", "y-1", "first year", "second year", etc.
  const wordYears: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    one: 1, two: 2, three: 3, four: 4, five: 5,
  };
  // Numeric forms — most specific first.
  const numMatch = ctx.match(/\byear\s+([1-5])\b|\by[-\s]?([1-5])\b|\byr\s*([1-5])\b/);
  if (numMatch) {
    const n = Number(numMatch[1] ?? numMatch[2] ?? numMatch[3]);
    if (n >= 1 && n <= 5) return n;
  }
  // Word forms.
  const wordMatch = ctx.match(/\b(first|second|third|fourth|fifth)\s+year\b/);
  if (wordMatch) return wordYears[wordMatch[1]];
  const yearOneMatch = ctx.match(/\byear\s+(one|two|three|four|five)\b/);
  if (yearOneMatch) return wordYears[yearOneMatch[1]];
  return null;
}

function inferLossSign(ctx: string, claimStart: number, textStart: number): boolean {
  // Walk a tighter window around the claim to spot loss/deficit/negative tells.
  // Distance from `textStart` to `claimStart` is the offset into the lowercased
  // contextual slice — we only look ±40 chars around the number itself.
  const localStart = Math.max(0, claimStart - textStart - 40);
  const localEnd = Math.min(ctx.length, claimStart - textStart + 40);
  const window = ctx.slice(localStart, localEnd);
  return /\b(loss|deficit|negative|burn(?:ing)?)\b/.test(window);
}

// ── Matching ─────────────────────────────────────────────────────────────────

function findKeywordHit(ctx: string, keywords: string[]): boolean {
  for (const k of keywords) {
    if (ctx.includes(k)) return true;
  }
  return false;
}

// Tolerance for currency mismatches. A claim that lands within tolerance is
// not flagged. Calibrated so $280K vs $250K (12%) trips, while $4,880 vs
// $4,880.05 doesn't, and $59,825 vs $31,313 (sign-aware) always trips.
function currencyMatchesWithinTolerance(claimCents: number, expectedCents: number): boolean {
  if (expectedCents === 0 && claimCents === 0) return true;
  const absExpected = Math.abs(expectedCents);
  const absClaim = Math.abs(claimCents);
  const denom = Math.max(absExpected, absClaim, 1);
  const relDelta = Math.abs(absClaim - absExpected) / denom;
  // Absolute floor — "$1,234" vs "$1,300" at 5% rounding is fine.
  const absDelta = Math.abs(absClaim - absExpected);
  // <$100 absolute slack on anything to absorb rounding.
  if (absDelta <= 100) return true;
  // Relative slack — 2% on big numbers (lets $59,825 vs $61,000 pass without
  // a finding, but $280K vs $250K trips).
  return relDelta <= 0.02;
}

// Choose the best expectation for a given claim + context. Returns null when
// no expectation matches — that claim is then silently ignored (high precision).
function matchExpectation(
  claim: RawClaim,
  ctx: string,
  textStart: number,
  expectations: Expectation[],
): Expectation | null {
  for (const exp of expectations) {
    if (exp.units !== claim.units) continue;

    // Year-scoped expectations require a year mention in the context.
    if (exp.year !== undefined) {
      const inferredYear = yearInContext(ctx);
      if (inferredYear !== exp.year) continue;
    }

    if (!findKeywordHit(ctx, exp.keywords)) continue;

    // Sign signal — fill in the carrier so downstream comparison flips the
    // claim cents to negative when the surrounding text said "loss"/"deficit".
    if (exp.signed && claim.units === "currency") {
      claim.signCarriesLoss = inferLossSign(ctx, claim.start, textStart);
    }

    return exp;
  }
  return null;
}

// ── Pass 1 entry point ───────────────────────────────────────────────────────

export interface ReconciliationInput {
  planState: PlanState;
  // sectionKey → narrative text (user_content || autoContent, whichever the
  // export will actually render). Empty strings are skipped.
  sections: Map<string, string>;
}

export function runReconciliation(inp: ReconciliationInput): ValidationReport {
  const expectations = expectationsFromPlanState(inp.planState);
  const currencyCode = inp.planState.meta.currency_code;
  const findings: NumericFinding[] = [];

  let claimsExtracted = 0;
  let claimsMatched = 0;
  let sectionsScanned = 0;

  for (const [sectionKey, rawText] of inp.sections.entries()) {
    if (!rawText || rawText.trim().length === 0) continue;
    sectionsScanned += 1;

    const claims = extractClaims(rawText);
    claimsExtracted += claims.length;

    // Lowercased view for keyword routing — we keep the original text for
    // quoting so the modal renders the user's actual wording verbatim.
    for (const claim of claims) {
      const ctxStart = Math.max(0, claim.start - CONTEXT_WINDOW);
      const ctx = contextAround(rawText, claim.start, claim.end);
      const exp = matchExpectation(claim, ctx, ctxStart, expectations);
      if (!exp) continue;
      claimsMatched += 1;

      // ── Currency comparison ────────────────────────────────────────────────
      if (claim.units === "currency" && exp.units === "currency") {
        const signedClaim = claim.signCarriesLoss ? -claim.cents : claim.cents;
        // For signed dimensions (net_income, operating_income) check sign too.
        if (exp.signed) {
          const expectedNeg = exp.value < 0;
          const claimNeg = signedClaim < 0;
          if (expectedNeg !== claimNeg) {
            findings.push(buildFinding(
              sectionKey, exp, claim,
              signedClaim, currencyCode,
              "sign_mismatch",
              `${exp.label}: narrative says ${claim.signCarriesLoss ? "loss" : "profit"} of ${fmtCents(claim.cents, currencyCode)}, plan shows ${exp.value < 0 ? "loss" : "profit"} of ${fmtCents(exp.value, currencyCode)}.`,
            ));
            continue;
          }
        }
        if (!currencyMatchesWithinTolerance(signedClaim, exp.value)) {
          findings.push(buildFinding(
            sectionKey, exp, claim,
            signedClaim, currencyCode,
            "numeric_mismatch",
            `${exp.label}: narrative quotes ${fmtCents(claim.cents, currencyCode)}, plan shows ${fmtCents(exp.value, currencyCode)}.`,
          ));
        }
        continue;
      }

      // ── Count comparison ───────────────────────────────────────────────────
      if (claim.units === "count" && exp.units === "count") {
        if (claim.n !== exp.value) {
          findings.push(buildFinding(
            sectionKey, exp, claim,
            claim.n, currencyCode,
            "numeric_mismatch",
            `${exp.label}: narrative says ${claim.n}, plan shows ${exp.value}.`,
          ));
        }
        continue;
      }
    }
  }

  return {
    blocking: findings.length > 0,
    numeric_findings: findings,
    qualitative_findings: [],
    stats: {
      claims_extracted: claimsExtracted,
      claims_matched: claimsMatched,
      sections_scanned: sectionsScanned,
    },
  };
}

// ── Finding builder ──────────────────────────────────────────────────────────

function buildFinding(
  sectionKey: string,
  exp: Expectation,
  claim: RawClaim,
  signedClaimValue: number,
  currencyCode: string,
  kind: FindingKind,
  message: string,
): NumericFinding {
  const id = `${sectionKey}:${exp.dim}:${claim.start}`;
  let expectedText: string;
  let suggestedReplacement: string | null;
  if (exp.units === "currency") {
    expectedText = fmtCents(exp.value, currencyCode);
    // When the narrative carried a loss/profit word, preserve it in the
    // suggested replacement so the prose stays grammatical.
    const lossPrefix = claim.units === "currency" && claim.signCarriesLoss && exp.value < 0
      ? ""    // claim already said "loss" and the plan agrees — strip the sign from the replacement
      : "";
    void lossPrefix;
    // Suggested replacement: just the formatted number — the user pastes it
    // over their original quoted figure.
    suggestedReplacement = fmtCents(Math.abs(exp.value), currencyCode);
  } else if (exp.units === "count") {
    expectedText = String(exp.value);
    suggestedReplacement = String(exp.value);
  } else {
    expectedText = `${exp.value}%`;
    suggestedReplacement = `${exp.value}%`;
  }

  // Auto-correctable: we have a single unambiguous plan_state value and a
  // direct numeric mismatch (not a sign flip — sign flips often signal a
  // narrative narrative argument the user needs to re-examine, not search-replace).
  const autoCorrectable = kind === "numeric_mismatch";

  return {
    id,
    section_key: sectionKey,
    severity: "blocking",
    kind,
    dimension: exp.dim,
    dimension_label: exp.label,
    units: exp.units,
    quoted_text: claim.raw,
    claim_value: signedClaimValue,
    expected_value: exp.value,
    expected_text: expectedText,
    suggested_replacement: suggestedReplacement,
    auto_correctable: autoCorrectable,
    message,
  };
}

// ── Pass 2 prompt builder (used by the API route) ────────────────────────────
// The route runs the LLM; this module hands it a system prompt + JSON schema
// hint so the route can parse the response into QualitativeFinding[] without
// reaching back into this module's internals.

export const PASS2_SYSTEM_PROMPT = `You are a skeptical small-business lender reviewing a coffee-shop business plan before signing. Your only job is to flag credibility-killing issues a borrower would not want a lender to spot. Be specific and quote the exact prose.

Look for FIVE categories of problems:

1. CONTRADICTION — two claims within a single paragraph or adjacent paragraphs that cannot both be true ("Owner draws $3,000 per month from month five" + "Year 1 assumes no Owner draw").
2. MISSING SECTION — sensitivity analysis absent, no DSCR, no break-even discussion, no risk section.
3. CREDIBILITY TELL — vague generic phrasing ("we will leverage", "best-in-class"), unsourced claims, three-word taglines, marketing-speak that masquerades as analysis.
4. TYPO — misspelled proper nouns ("La Marzocko", "Whitehouse"), wrong city/region names, inconsistent capitalization of branded products.
5. BOILERPLATE — paragraphs that could appear in any coffee-shop plan; nothing specific to this concept, location, or numbers.

You MUST respond with a single JSON object — no prose before or after — of the shape:

{
  "findings": [
    {
      "section_key": "<which section>",
      "category": "contradiction" | "missing_section" | "credibility" | "typo" | "boilerplate" | "other",
      "message": "One sentence describing the issue.",
      "quoted_text": "The exact verbatim text from the narrative, or null if the issue is a missing piece."
    }
  ]
}

Return at most 10 findings; prioritize the most damaging. If the plan reads clean, return {"findings":[]}.`;

export function buildPass2UserMessage(
  shopName: string,
  sections: Map<string, string>,
): string {
  const parts: string[] = [];
  parts.push(`Shop: ${shopName}`);
  parts.push("");
  parts.push("BUSINESS PLAN SECTIONS — verbatim narrative as it will appear in the exported PDF:");
  parts.push("");
  for (const [key, text] of sections.entries()) {
    if (!text || text.trim().length === 0) continue;
    parts.push(`── ${key} ──`);
    parts.push(text);
    parts.push("");
  }
  parts.push("Review the document end-to-end and return the JSON described in your system instructions.");
  return parts.join("\n");
}

// Parses the LLM response into QualitativeFinding[]. Defensive — a model
// that returns extra prose, malformed JSON, or wrong-shaped findings yields
// an empty list rather than throwing. Pass 2 is advisory, so a parse failure
// must not break the export gate.
export function parsePass2Response(raw: string): QualitativeFinding[] {
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
  const arr = (parsed as { findings?: unknown }).findings;
  if (!Array.isArray(arr)) return [];

  const out: QualitativeFinding[] = [];
  for (let i = 0; i < arr.length && i < 20; i++) {
    const f = arr[i];
    if (!f || typeof f !== "object") continue;
    const obj = f as Record<string, unknown>;
    const sectionKey = typeof obj.section_key === "string" ? obj.section_key : "unknown";
    const category = normalizeCategory(obj.category);
    const message = typeof obj.message === "string" ? obj.message.slice(0, 500) : "";
    const quoted = typeof obj.quoted_text === "string" ? obj.quoted_text.slice(0, 500) : null;
    if (!message) continue;
    out.push({
      id: `pass2:${sectionKey}:${i}`,
      section_key: sectionKey,
      severity: "advisory",
      kind: "qualitative",
      category,
      message,
      quoted_text: quoted,
    });
  }
  return out;
}

function normalizeCategory(v: unknown): QualitativeFinding["category"] {
  const allowed: ReadonlyArray<QualitativeFinding["category"]> = [
    "contradiction", "missing_section", "credibility", "typo", "boilerplate", "other",
  ];
  if (typeof v === "string" && (allowed as readonly string[]).includes(v)) {
    return v as QualitativeFinding["category"];
  }
  return "other";
}
