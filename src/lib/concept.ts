// TIM-619: Concept workspace data shape + helpers.
// Stored in workspace_documents.content as jsonb where workspace_key='concept'.

export interface ConceptDocument {
  name: string;
  mission: string;
  target_market: string;
  differentiation: string;
  brand_voice: string;
}

export const EMPTY_CONCEPT: ConceptDocument = {
  name: "",
  mission: "",
  target_market: "",
  differentiation: "",
  brand_voice: "",
};

export const CONCEPT_FIELDS: ReadonlyArray<{
  key: keyof ConceptDocument;
  label: string;
  hint: string;
  placeholder: string;
  multiline: boolean;
  rows?: number;
}> = [
  {
    key: "name",
    label: "Shop name",
    hint: "Working title is fine. You can change it later.",
    placeholder: "e.g. Tide & Timber Coffee",
    multiline: false,
  },
  {
    key: "mission",
    label: "Mission",
    hint: "One or two sentences. What does this shop exist to do?",
    placeholder: "Serve a tight, daily-driven menu of espresso and slow-bar coffee to the people who walk past at 7am.",
    multiline: true,
    rows: 3,
  },
  {
    key: "target_market",
    label: "Target customer",
    hint: "Who is this shop for? The more specific, the better.",
    placeholder: "Morning commuters from the South End — under 40, willing to pay for quality, picks up daily.",
    multiline: true,
    rows: 3,
  },
  {
    key: "differentiation",
    label: "What makes you different",
    hint: "Name the one or two things competitors in this market cannot easily copy.",
    placeholder: "Direct-trade single-origin program; a roaster relationship locked in for 2 years.",
    multiline: true,
    rows: 3,
  },
  {
    key: "brand_voice",
    label: "Brand voice & pillars",
    hint: "How does the brand sound? Pick a handful of words that should always come through.",
    placeholder: "Warm, direct, no jargon. Pillars: craft, neighbourhood, daily ritual.",
    multiline: true,
    rows: 3,
  },
];

export function normalizeConcept(input: unknown): ConceptDocument {
  if (!input || typeof input !== "object") return { ...EMPTY_CONCEPT };
  const obj = input as Record<string, unknown>;
  const pick = (key: keyof ConceptDocument): string => {
    const value = obj[key];
    return typeof value === "string" ? value : "";
  };
  return {
    name: pick("name"),
    mission: pick("mission"),
    target_market: pick("target_market"),
    differentiation: pick("differentiation"),
    brand_voice: pick("brand_voice"),
  };
}

export function isConceptComplete(doc: ConceptDocument): boolean {
  return (
    doc.name.trim().length > 0 &&
    doc.mission.trim().length > 0 &&
    doc.target_market.trim().length > 0 &&
    doc.differentiation.trim().length > 0 &&
    doc.brand_voice.trim().length > 0
  );
}

export function formatConceptForAI(doc: ConceptDocument): string {
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) lines.push(`- **${label}**: ${trimmed}`);
  };
  push("Shop name", doc.name);
  push("Mission", doc.mission);
  push("Target customer", doc.target_market);
  push("Differentiation", doc.differentiation);
  push("Brand voice & pillars", doc.brand_voice);
  if (lines.length === 0) return "_no concept fields filled in yet_";
  return lines.join("\n");
}
