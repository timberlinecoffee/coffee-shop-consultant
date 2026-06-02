// TIM-1797: honor explicitly-stated prices in free-text equipment descriptions.
//
// The "Describe Your Setup" generation prompt asks the model for "realistic
// market prices". When the owner states an exact price for an item (e.g.
// "add an espresso machine at $24,000") the model would silently substitute its
// own estimate (~$9,000), writing a WRONG dollar figure into the financial plan.
//
// This deterministic post-pass re-binds an item's unit cost to the price the
// owner actually wrote, so a stated dollar figure round-trips faithfully:
// description -> AI generation -> preview -> committed equipment item.
//
// It only overrides when the description explicitly pairs a price with a phrase
// that matches a generated item; items with no stated price keep the model's
// estimate untouched.

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "at", "in", "on", "with",
  "my", "our", "one", "two", "three", "set", "unit", "units", "new",
]);

// Parse a single dollar amount into integer cents.
// Accepts "$24,000", "$24k", "$1,250.50", "24,000 dollars", "$24K".
export function parseDollarAmountToCents(raw: string): number | null {
  const m = raw
    .trim()
    .match(/\$?\s*([\d][\d,]*(?:\.\d{1,2})?)\s*([kK])?(?:\s*(?:dollars|usd|bucks))?/i);
  if (!m) return null;
  const digits = m[1].replace(/,/g, "");
  let dollars = Number(digits);
  if (!Number.isFinite(dollars)) return null;
  if (m[2]) dollars *= 1000; // "k" / "K" suffix
  return Math.round(dollars * 100);
}

interface PricedClause {
  text: string; // lowercased clause text
  cents: number;
}

// Split a description into clauses and extract any clause that names a price.
// Clauses are bounded by sentence/list separators so a price stays attached to
// the item it was written next to.
export function extractPricedClauses(description: string): PricedClause[] {
  // Split on list/sentence separators, but NOT on the "," or "." inside a number
  // (e.g. "$24,000" or "$18.50") — a comma is a separator only when not between
  // digits, and a period only at a sentence boundary (whitespace or end).
  const clauses = description
    .split(/[;\n]|\band\b|,(?!\d)|\.(?=\s|$)/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const out: PricedClause[] = [];
  for (const clause of clauses) {
    // Only treat $-prefixed or "<n> dollars/usd" amounts as explicit prices.
    // A bare number ("two EK43") is a quantity, not a price.
    const priceMatch = clause.match(
      /\$\s*[\d][\d,]*(?:\.\d{1,2})?\s*[kK]?|\b[\d][\d,]*(?:\.\d{1,2})?\s*(?:dollars|usd|bucks)\b/i,
    );
    if (!priceMatch) continue;
    const cents = parseDollarAmountToCents(priceMatch[0]);
    if (cents == null || cents <= 0) continue;
    out.push({ text: clause.toLowerCase(), cents });
  }
  return out;
}

// Significant (non-stopword, length>2) tokens of an item name.
function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Does this priced clause refer to this item name? True when the clause contains
// the full item name, or all of the item's significant tokens.
function clauseMatchesName(clauseText: string, name: string): boolean {
  const lowerName = name.trim().toLowerCase();
  if (lowerName && clauseText.includes(lowerName)) return true;
  const tokens = significantTokens(name);
  if (tokens.length === 0) return false;
  return tokens.every((t) => clauseText.includes(t));
}

export interface PricedRow {
  name: string;
  unit_cost_cents: number;
}

// Override each row's unit_cost_cents with the price the owner explicitly stated
// for that item, when one is present. Rows with no stated price are returned
// unchanged. When several priced clauses match a row, the most specific match
// (longest matched clause) wins.
export function applyExplicitPrices<T extends PricedRow>(
  description: string,
  rows: T[],
): T[] {
  const priced = extractPricedClauses(description);
  if (priced.length === 0) return rows;

  return rows.map((row) => {
    let best: PricedClause | null = null;
    for (const clause of priced) {
      if (!clauseMatchesName(clause.text, row.name)) continue;
      if (!best || clause.text.length > best.text.length) best = clause;
    }
    if (best && best.cents !== row.unit_cost_cents) {
      return { ...row, unit_cost_cents: best.cents };
    }
    return row;
  });
}
