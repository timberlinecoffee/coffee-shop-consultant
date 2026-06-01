// TIM-1688: General cross-workspace consistency engine.
//
// A handful of business facts (monthly rent, square footage, opening date, …)
// are entered in more than one workspace. When the owner edits one home but not
// the others the plan silently disagrees with itself. This engine detects those
// disagreements, asks the owner which value is canonical, and applies the chosen
// value to every home at once.
//
// It is the *general* engine built on top of the existing narrow primitives —
// it does NOT duplicate them:
//   - TIM-1638 detected ONE hard-coded conflict (onboarding timeline vs launch
//     date) inline in the copilot stream route.
//   - TIM-1648 is the apply mechanism (write a chat-proposed value into a target
//     section, reviewed in AIReviewModal before anything is saved).
//   - src/lib/org-sync.ts is the narrow salaries<->hiring diff/apply precedent.
//
// Detection and apply here are registry-driven: register a fact plus its homes
// and the whole detect → prompt → apply loop covers it for free.
//
// This module is PURE. It never reads or writes the database. The data layer
// (the /api/copilot/consistency route) is responsible for reading each home's
// current value into a FactReading and for executing the ApplyOps this engine
// produces. Nothing is ever auto-applied: the engine only surfaces conflicts and
// builds an apply plan; the caller must route the owner's choice through the
// review/confirm UX (AIReviewModal) before writing. (per feedback: AI never
// auto-applies — always confirm.)

// ── Fact model ────────────────────────────────────────────────────────────────

// How a fact's value is typed, compared, and formatted for display.
export type FactUnit = "currency_cents" | "integer" | "date_iso" | "text";

export type FactValue = number | string;

export interface FactDefinition {
  id: string;
  label: string;
  unit: FactUnit;
  // The home whose value is offered as the recommended canonical default when
  // prompting (the most authoritative source for this fact). Optional.
  authoritativeLocationId?: string;
  // currency_cents/integer only: two readings within this absolute tolerance are
  // treated as the same value (coarse budget figure vs precise entry). 0 = exact.
  tolerance?: number;
}

// A place a fact lives. The data layer owns the actual read + write against the
// real table/document; this only describes the home so detection can label it
// and apply can target it.
export interface FactLocation {
  id: string; // unique, conventionally `${factId}:${workspaceKey}`
  factId: string;
  workspaceKey: string;
  workspaceLabel: string;
  locationLabel: string; // the exact field, e.g. "Chosen location rent"
  writable: boolean; // false = read-only home (prose, signup snapshot, …)
}

// The current value of a fact at one home, read by the data layer. A null value
// means the home exists but has nothing set yet — it does not participate in a
// conflict and is not an apply target unless it is writable.
export interface FactReading {
  locationId: string;
  factId: string;
  value: FactValue | null;
}

// ── Registry ──────────────────────────────────────────────────────────────────
//
// Grounded in real, structured, writable homes verified in the schema:
//   - monthly_rent: location_candidates.asking_rent_cents (Location & Lease) and
//     the financial_models rent operating line (Financials). Two writable homes
//     in two workspaces — the flagship cross-workspace fact.
//   - square_footage: location_candidates.sq_ft (Location & Lease).
//   - opening_date: opening_month_plan targetLaunchDate (Opening Month Plan).
//
// A fact only ever raises a conflict once two or more of its homes hold a value,
// so single-home facts are registered to document intent and light up the moment
// a second structured home is added. Adding a fact is a single entry here plus a
// reader/writer in the data layer.

export const FACTS: FactDefinition[] = [
  {
    id: "monthly_rent",
    label: "Monthly Rent",
    unit: "currency_cents",
    authoritativeLocationId: "monthly_rent:location_lease",
    tolerance: 0,
  },
  {
    id: "square_footage",
    label: "Square Footage",
    unit: "integer",
    authoritativeLocationId: "square_footage:location_lease",
    tolerance: 0,
  },
  {
    id: "opening_date",
    label: "Opening Date",
    unit: "date_iso",
    authoritativeLocationId: "opening_date:opening_month_plan",
  },
];

export const FACT_LOCATIONS: FactLocation[] = [
  {
    id: "monthly_rent:location_lease",
    factId: "monthly_rent",
    workspaceKey: "location_lease",
    workspaceLabel: "Location & Lease",
    locationLabel: "Chosen location asking rent",
    writable: true,
  },
  {
    id: "monthly_rent:financials",
    factId: "monthly_rent",
    workspaceKey: "financials",
    workspaceLabel: "Financials",
    locationLabel: "Rent operating line",
    writable: true,
  },
  {
    id: "square_footage:location_lease",
    factId: "square_footage",
    workspaceKey: "location_lease",
    workspaceLabel: "Location & Lease",
    locationLabel: "Chosen location square footage",
    writable: true,
  },
  {
    id: "opening_date:opening_month_plan",
    factId: "opening_date",
    workspaceKey: "opening_month_plan",
    workspaceLabel: "Opening Month Plan",
    locationLabel: "Target launch date",
    writable: true,
  },
];

const FACT_BY_ID = new Map(FACTS.map((f) => [f.id, f]));
const LOCATION_BY_ID = new Map(FACT_LOCATIONS.map((l) => [l.id, l]));

export function getFact(factId: string): FactDefinition | undefined {
  return FACT_BY_ID.get(factId);
}

export function getLocation(locationId: string): FactLocation | undefined {
  return LOCATION_BY_ID.get(locationId);
}

export function locationsForFact(factId: string): FactLocation[] {
  return FACT_LOCATIONS.filter((l) => l.factId === factId);
}

// ── Value handling (unit-aware) ───────────────────────────────────────────────

// Stable comparison key. Two readings collide iff their keys are equal. Currency
// and integer honor the fact's tolerance; dates compare on YYYY-MM-DD; text is
// trimmed + lowercased.
export function comparisonKey(unit: FactUnit, value: FactValue, tolerance = 0): string {
  switch (unit) {
    case "currency_cents":
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return `nan:${String(value)}`;
      if (tolerance > 0) return `bucket:${Math.round(n / tolerance)}`;
      return `num:${Math.round(n)}`;
    }
    case "date_iso": {
      const s = String(value).trim().slice(0, 10);
      return `date:${s}`;
    }
    case "text":
      return `text:${String(value).trim().toLowerCase().replace(/\s+/g, " ")}`;
  }
}

export function formatFactValue(unit: FactUnit, value: FactValue): string {
  switch (unit) {
    case "currency_cents": {
      const cents = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(cents)) return String(value);
      return `$${(cents / 100).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    case "integer": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return String(value);
      return Math.round(n).toLocaleString("en-US");
    }
    case "date_iso":
      return String(value).trim().slice(0, 10);
    case "text":
      return String(value).trim();
  }
}

// Parse a user-entered/edited string from the review modal back into a typed
// value for apply. Returns null when the input cannot be parsed for the unit.
export function parseFactValue(unit: FactUnit, raw: string): FactValue | null {
  const s = raw.trim();
  if (s === "") return null;
  switch (unit) {
    case "currency_cents": {
      const cleaned = s.replace(/[$,\s]/g, "");
      const dollars = Number(cleaned);
      if (!Number.isFinite(dollars)) return null;
      return Math.round(dollars * 100);
    }
    case "integer": {
      const n = Number(s.replace(/[,\s]/g, ""));
      if (!Number.isFinite(n)) return null;
      return Math.round(n);
    }
    case "date_iso": {
      const m = s.match(/^\d{4}-\d{2}-\d{2}/);
      return m ? m[0] : null;
    }
    case "text":
      return s;
  }
}

// ── Detection ─────────────────────────────────────────────────────────────────

export interface ConflictValueGroup {
  value: FactValue;
  display: string;
  // Homes (location ids) that hold this value, with their human labels.
  locations: Array<{ locationId: string; workspaceLabel: string; locationLabel: string }>;
}

export interface FactConflict {
  factId: string;
  factLabel: string;
  unit: FactUnit;
  // ≥2 distinct value groups, ordered with the recommended/authoritative value
  // first, then by descending number of homes holding it.
  groups: ConflictValueGroup[];
  // The value offered as the default canonical choice (authoritative home's value
  // when present, else the most widely held value).
  recommendedValue: FactValue;
  // Every writable home for this fact — the apply targets once a choice is made.
  writableLocationIds: string[];
}

// Detect conflicts across the supplied readings. A fact conflicts when two or
// more of its homes hold values that do not collide under the unit's comparison
// key. Readings with null/absent values are ignored. Unknown fact/location ids
// are skipped (registry is the source of truth).
export function detectConflicts(readings: FactReading[]): FactConflict[] {
  const byFact = new Map<string, FactReading[]>();
  for (const r of readings) {
    if (r.value === null || r.value === undefined) continue;
    if (!FACT_BY_ID.has(r.factId)) continue;
    if (!LOCATION_BY_ID.has(r.locationId)) continue;
    const list = byFact.get(r.factId) ?? [];
    list.push(r);
    byFact.set(r.factId, list);
  }

  const conflicts: FactConflict[] = [];
  // Iterate in registry order for deterministic output.
  for (const fact of FACTS) {
    const factReadings = byFact.get(fact.id);
    if (!factReadings || factReadings.length < 2) continue;

    const groupsByKey = new Map<string, ConflictValueGroup>();
    for (const r of factReadings) {
      const key = comparisonKey(fact.unit, r.value as FactValue, fact.tolerance ?? 0);
      const loc = LOCATION_BY_ID.get(r.locationId)!;
      const existing = groupsByKey.get(key);
      const entry = {
        locationId: r.locationId,
        workspaceLabel: loc.workspaceLabel,
        locationLabel: loc.locationLabel,
      };
      if (existing) {
        existing.locations.push(entry);
      } else {
        groupsByKey.set(key, {
          value: r.value as FactValue,
          display: formatFactValue(fact.unit, r.value as FactValue),
          locations: [entry],
        });
      }
    }

    // No conflict when every home agrees (single group).
    if (groupsByKey.size < 2) continue;

    const groups = [...groupsByKey.values()];

    // Recommended value: authoritative home's value if it is one of the readings,
    // else the most widely held value.
    let recommendedValue: FactValue;
    const authReading = fact.authoritativeLocationId
      ? factReadings.find((r) => r.locationId === fact.authoritativeLocationId)
      : undefined;
    if (authReading) {
      recommendedValue = authReading.value as FactValue;
    } else {
      recommendedValue = [...groups].sort((a, b) => b.locations.length - a.locations.length)[0]
        .value;
    }

    const recKey = comparisonKey(fact.unit, recommendedValue, fact.tolerance ?? 0);
    groups.sort((a, b) => {
      const aRec = comparisonKey(fact.unit, a.value, fact.tolerance ?? 0) === recKey ? 1 : 0;
      const bRec = comparisonKey(fact.unit, b.value, fact.tolerance ?? 0) === recKey ? 1 : 0;
      if (aRec !== bRec) return bRec - aRec;
      return b.locations.length - a.locations.length;
    });

    conflicts.push({
      factId: fact.id,
      factLabel: fact.label,
      unit: fact.unit,
      groups,
      recommendedValue,
      writableLocationIds: locationsForFact(fact.id)
        .filter((l) => l.writable)
        .map((l) => l.id),
    });
  }

  return conflicts;
}

// ── Apply plan ────────────────────────────────────────────────────────────────

export interface ApplyOp {
  locationId: string;
  factId: string;
  workspaceKey: string;
  value: FactValue;
}

// Build the set of writes that propagate `canonicalValue` to every writable home
// for the fact. The data layer executes these against the real homes (reusing the
// per-workspace save endpoints — the TIM-1648 apply path). Homes already holding
// the canonical value are skipped so apply is a no-op when nothing changed.
export function buildApplyPlan(
  factId: string,
  canonicalValue: FactValue,
  currentReadings: FactReading[],
): ApplyOp[] {
  const fact = FACT_BY_ID.get(factId);
  if (!fact) return [];
  const tol = fact.tolerance ?? 0;
  const canonKey = comparisonKey(fact.unit, canonicalValue, tol);
  const readingByLoc = new Map(currentReadings.map((r) => [r.locationId, r] as const));

  const ops: ApplyOp[] = [];
  for (const loc of locationsForFact(factId)) {
    if (!loc.writable) continue;
    const cur = readingByLoc.get(loc.id);
    if (
      cur &&
      cur.value !== null &&
      cur.value !== undefined &&
      comparisonKey(fact.unit, cur.value as FactValue, tol) === canonKey
    ) {
      continue; // already canonical
    }
    ops.push({ locationId: loc.id, factId, workspaceKey: loc.workspaceKey, value: canonicalValue });
  }
  return ops;
}

// ── Review/confirm bridge (reuse AIReviewModal) ───────────────────────────────

// Shape that matches AIReviewModal's SuggestionPayload so a conflict can be
// surfaced through the existing review/confirm UX without a bespoke modal. The
// owner reviews the conflicting values, edits/confirms the canonical value, and
// only then is the apply plan executed. `proposedValue` defaults to the
// recommended (authoritative) value; the owner can override it.
export interface ConsistencySuggestion {
  id: string;
  fieldId: string; // the factId — the apply route maps this back to homes
  fieldLabel: string;
  originalValue: string; // summary of the conflicting homes
  proposedValue: string; // recommended canonical value, editable
  isStructured: false;
}

export function conflictToSuggestion(conflict: FactConflict): ConsistencySuggestion {
  const summary = conflict.groups
    .map(
      (g) =>
        `${g.display} (${g.locations.map((l) => l.workspaceLabel).join(", ")})`,
    )
    .join("  ·  ");
  return {
    id: `consistency-${conflict.factId}`,
    fieldId: conflict.factId,
    fieldLabel: `${conflict.factLabel} disagrees across workspaces`,
    originalValue: summary,
    proposedValue: formatFactValue(conflict.unit, conflict.recommendedValue),
    isStructured: false,
  };
}
