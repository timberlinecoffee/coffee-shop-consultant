// TIM-1322: Menu engineering for a pre-launch planning tool.
//
// Groundwork has no POS/sales history, so "popularity" is the owner's own
// estimate (low / medium / high), not measured sales. Profitability is the
// gross margin already computed from price - COGS. We combine the two on the
// classic menu-engineering matrix, but split each axis at the owner's *own
// menu average* (the textbook "more/less than the rest of your menu" method)
// so the guidance adapts to whatever menu they build.
//
// Quadrants (high/low margin x more/less popular):
//   Star      high margin  + more popular  -> feature it
//   Plowhorse low margin   + more popular  -> re-price or trim cost
//   Puzzle    high margin  + less popular  -> reposition / market harder
//   Dog       low margin   + less popular  -> consider cutting

export type ExpectedPopularity = "low" | "medium" | "high";

export const POPULARITY_OPTIONS: { value: ExpectedPopularity; label: string }[] =
  [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ];

export function popularityScore(p: ExpectedPopularity | null | undefined): number | null {
  if (p === "low") return 1;
  if (p === "medium") return 2;
  if (p === "high") return 3;
  return null;
}

export function popularityLabel(p: ExpectedPopularity | null | undefined): string {
  if (p === "low") return "Low";
  if (p === "medium") return "Medium";
  if (p === "high") return "High";
  return "Not set";
}

export type Quadrant = "star" | "plowhorse" | "puzzle" | "dog";

// Plain-English, jargon-free guidance for a first-time owner. No em dashes per
// the product voice mandate.
export const QUADRANT_META: Record<
  Quadrant,
  { label: string; tagline: string; recommendation: string }
> = {
  star: {
    label: "Star",
    tagline: "Popular and profitable",
    recommendation:
      "A favorite that also makes good money. Feature it on your menu and in promos.",
  },
  plowhorse: {
    label: "Plowhorse",
    tagline: "Popular but thin margin",
    recommendation:
      "People will order it, but you keep little per sale. Nudge the price up or trim the recipe cost.",
  },
  puzzle: {
    label: "Puzzle",
    tagline: "Profitable but slow",
    recommendation:
      "Makes good money but may not sell itself. Give it a better spot on the menu or talk it up.",
  },
  dog: {
    label: "Dog",
    tagline: "Slow and low margin",
    recommendation:
      "Likely a slow seller that earns little. Consider reworking it or dropping it.",
  },
};

// Structural input so the helpers are testable with plain fixtures and accept
// the live MenuItemWithCogs rows unchanged.
export type MenuEngInput = {
  id: string;
  name: string;
  price_cents: number;
  cogs_cents: number | null;
  computed_cogs_cents?: number | null;
  expected_popularity: ExpectedPopularity | null;
  archived?: boolean;
};

// Recipe-computed COGS wins; fall back to a manually entered COGS; else 0.
export function effectiveCogsCents(item: MenuEngInput): number {
  if (typeof item.computed_cogs_cents === "number" && item.computed_cogs_cents > 0) {
    return item.computed_cogs_cents;
  }
  return item.cogs_cents ?? 0;
}

export function grossMarginPct(item: MenuEngInput): number | null {
  const cogs = effectiveCogsCents(item);
  if (item.price_cents <= 0 || cogs <= 0) return null;
  return ((item.price_cents - cogs) / item.price_cents) * 100;
}

export type RankedItem = {
  id: string;
  name: string;
  priceCents: number;
  cogsCents: number;
  gpCents: number;
  marginPct: number;
};

// Most -> least profitable, by gross margin %, tie-broken by gross profit $.
// Only items with both a price and a known cost can be ranked.
export function marginRanking(items: MenuEngInput[]): RankedItem[] {
  return items
    .filter((i) => !i.archived)
    .map((i) => {
      const marginPct = grossMarginPct(i);
      if (marginPct === null) return null;
      const cogs = effectiveCogsCents(i);
      return {
        id: i.id,
        name: i.name,
        priceCents: i.price_cents,
        cogsCents: cogs,
        gpCents: i.price_cents - cogs,
        marginPct,
      };
    })
    .filter((r): r is RankedItem => r !== null)
    .sort((a, b) => b.marginPct - a.marginPct || b.gpCents - a.gpCents);
}

export type MissingField = "price" | "cost" | "popularity";

export type ClassifiedItem = {
  id: string;
  name: string;
  marginPct: number;
  gpCents: number;
  popularity: ExpectedPopularity;
  popScore: number;
  highMargin: boolean;
  highPopularity: boolean;
  quadrant: Quadrant;
  recommendation: string;
};

export type NeedsInfoItem = { id: string; name: string; missing: MissingField[] };

export type MenuEngineering = {
  classified: ClassifiedItem[];
  needsInfo: NeedsInfoItem[];
  thresholds: { avgMarginPct: number; avgPopScore: number } | null;
  counts: Record<Quadrant, number>;
};

function quadrantFor(highMargin: boolean, highPopularity: boolean): Quadrant {
  if (highMargin && highPopularity) return "star";
  if (!highMargin && highPopularity) return "plowhorse";
  if (highMargin && !highPopularity) return "puzzle";
  return "dog";
}

export function classifyMenu(items: MenuEngInput[]): MenuEngineering {
  const active = items.filter((i) => !i.archived);

  // Split classifiable vs. needs-info.
  const ready: { item: MenuEngInput; marginPct: number; popScore: number }[] = [];
  const needsInfo: NeedsInfoItem[] = [];

  for (const item of active) {
    const marginPct = grossMarginPct(item);
    const popScore = popularityScore(item.expected_popularity);
    if (marginPct !== null && popScore !== null) {
      ready.push({ item, marginPct, popScore });
      continue;
    }
    const missing: MissingField[] = [];
    if (item.price_cents <= 0) missing.push("price");
    if (effectiveCogsCents(item) <= 0) missing.push("cost");
    if (popScore === null) missing.push("popularity");
    needsInfo.push({ id: item.id, name: item.name, missing });
  }

  const counts: Record<Quadrant, number> = { star: 0, plowhorse: 0, puzzle: 0, dog: 0 };

  if (ready.length === 0) {
    return { classified: [], needsInfo, thresholds: null, counts };
  }

  // Split each axis at this menu's own average (textbook menu engineering).
  const avgMarginPct =
    ready.reduce((s, r) => s + r.marginPct, 0) / ready.length;
  const avgPopScore = ready.reduce((s, r) => s + r.popScore, 0) / ready.length;

  const classified: ClassifiedItem[] = ready.map(({ item, marginPct, popScore }) => {
    // Ties (== average) go to the more favorable side.
    const highMargin = marginPct >= avgMarginPct;
    const highPopularity = popScore >= avgPopScore;
    const quadrant = quadrantFor(highMargin, highPopularity);
    counts[quadrant] += 1;
    const cogs = effectiveCogsCents(item);
    return {
      id: item.id,
      name: item.name,
      marginPct,
      gpCents: item.price_cents - cogs,
      popularity: item.expected_popularity as ExpectedPopularity,
      popScore,
      highMargin,
      highPopularity,
      quadrant,
      recommendation: QUADRANT_META[quadrant].recommendation,
    };
  });

  return {
    classified,
    needsInfo,
    thresholds: { avgMarginPct, avgPopScore },
    counts,
  };
}
