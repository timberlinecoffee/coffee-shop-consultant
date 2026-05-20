// TIM-619 / TIM-834: Concept workspace data shape + helpers.
// Stored in workspace_documents.content as jsonb where workspace_key='concept'.
// V1 types kept for backward compat (onboarding-flow writes v1 format).

// ── V1 (legacy — kept for onboarding-flow.tsx) ───────────────────────────────

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

// ── V2 ───────────────────────────────────────────────────────────────────────

export type ConceptComponentId =
  | "shop_identity"
  | "vision"
  | "target_customer"
  | "differentiation"
  | "brand_voice"
  | "location"
  | "offering";

export interface ConceptComponentV2 {
  content: string;
  included: boolean;
}

export interface ConceptDocumentV2 {
  version: 2;
  components: Record<ConceptComponentId, ConceptComponentV2>;
}

export const EMPTY_CONCEPT_V2: ConceptDocumentV2 = {
  version: 2,
  components: {
    shop_identity:   { content: "", included: true },
    vision:          { content: "", included: true },
    target_customer: { content: "", included: true },
    differentiation: { content: "", included: true },
    brand_voice:     { content: "", included: true },
    location:        { content: "", included: false },
    offering:        { content: "", included: false },
  },
};

export const CONCEPT_COMPONENTS_V2: ReadonlyArray<{
  id: ConceptComponentId;
  label: string;
  hint: string;
  emptyPrompt: string;
  multiline: boolean;
  rows?: number;
  deferrable: boolean;
}> = [
  {
    id: "shop_identity",
    label: "Shop identity",
    hint: "Working title is fine. You can change it later.",
    emptyPrompt: "What are you thinking of calling it? A working name is enough to start.",
    multiline: false,
    deferrable: false,
  },
  {
    id: "vision",
    label: "Vision",
    hint: "What does this shop exist to do? One or two sentences.",
    emptyPrompt: "What is this shop for? Not the menu or the location — the reason it should exist.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "target_customer",
    label: "Target customer",
    hint: "Who is this shop for? The more specific, the better.",
    emptyPrompt: "Describe the person who walks in every single morning. Age, job, what they want, what they do not want.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "differentiation",
    label: "Differentiation",
    hint: "Name the one or two things competitors in this market cannot easily copy.",
    emptyPrompt: "What will make customers choose you over the place down the street? Think supplier relationships, people, atmosphere, expertise — things that take years to copy.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "brand_voice",
    label: "Brand voice",
    hint: "How does the brand sound? A handful of words that should always come through.",
    emptyPrompt: "Think about a few words your regulars might use to describe you. Or describe the shop you wish existed when you were just a customer.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "location",
    label: "Location",
    hint: "Neighbourhood, foot traffic, what drew you there.",
    emptyPrompt: "Where are you thinking of opening? Neighbourhood, street corner, or building type — early detail is better than none.",
    multiline: true,
    rows: 3,
    deferrable: true,
  },
  {
    id: "offering",
    label: "Offering",
    hint: "Core menu focus, price point, what you will and will not serve.",
    emptyPrompt: "What will you serve? A tight menu focus (espresso and slow bar only, no food) is as useful as a long list.",
    multiline: true,
    rows: 3,
    deferrable: true,
  },
];

export function normalizeConceptV2(input: unknown): ConceptDocumentV2 {
  if (!input || typeof input !== "object") return { ...EMPTY_CONCEPT_V2, components: { ...EMPTY_CONCEPT_V2.components } };
  const obj = input as Record<string, unknown>;

  if (obj.version === 2 && obj.components) {
    const stored = obj.components as Partial<Record<ConceptComponentId, ConceptComponentV2>>;
    const components = {
      shop_identity:   { ...EMPTY_CONCEPT_V2.components.shop_identity },
      vision:          { ...EMPTY_CONCEPT_V2.components.vision },
      target_customer: { ...EMPTY_CONCEPT_V2.components.target_customer },
      differentiation: { ...EMPTY_CONCEPT_V2.components.differentiation },
      brand_voice:     { ...EMPTY_CONCEPT_V2.components.brand_voice },
      location:        { ...EMPTY_CONCEPT_V2.components.location },
      offering:        { ...EMPTY_CONCEPT_V2.components.offering },
    };
    for (const id of Object.keys(components) as ConceptComponentId[]) {
      const s = stored[id];
      if (s) {
        components[id] = {
          content: typeof s.content === "string" ? s.content : "",
          included: typeof s.included === "boolean" ? s.included : components[id].included,
        };
      }
    }
    return { version: 2, components };
  }

  // v1 migration
  const pick = (key: string): string => {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  };
  return {
    version: 2,
    components: {
      shop_identity:   { content: pick("name"),          included: true },
      vision:          { content: pick("mission"),        included: true },
      target_customer: { content: pick("target_market"), included: true },
      differentiation: { content: pick("differentiation"), included: true },
      brand_voice:     { content: pick("brand_voice"),   included: true },
      location:        { content: "",                     included: false },
      offering:        { content: "",                     included: false },
    },
  };
}

export function isConceptV2Complete(doc: ConceptDocumentV2): boolean {
  return Object.values(doc.components).every(
    (c) => !c.included || c.content.trim().length > 0
  );
}

export function getConceptV2Progress(doc: ConceptDocumentV2): {
  filled: number;
  total: number;
} {
  const included = Object.values(doc.components).filter((c) => c.included);
  const filled = included.filter((c) => c.content.trim().length > 0);
  return { filled: filled.length, total: included.length };
}

export function formatConceptV2ForAI(doc: ConceptDocumentV2): string {
  const lines: string[] = [];
  for (const meta of CONCEPT_COMPONENTS_V2) {
    const c = doc.components[meta.id];
    if (c?.content?.trim()) {
      lines.push(`- **${meta.label}**: ${c.content.trim()}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "_no concept fields filled in yet_";
}

export function buildImprovePrompt(
  componentId: ConceptComponentId,
  componentLabel: string,
  currentContent: string,
  context: { shopName: string; vision: string; targetCustomer: string }
): string {
  return `You are helping a coffee shop owner sharpen their business concept document.

Component: ${componentLabel}
Current content: "${currentContent}"

Shop name: ${context.shopName || "(not set)"}
Vision: ${context.vision || "(not set)"}
Target customer: ${context.targetCustomer || "(not set)"}

Return a JSON object with exactly these fields:
{
  "rewrite": "One tightened rewrite of the current content. 1-3 sentences. Specific, direct, no filler.",
  "gaps": ["Gap question 1 (max 20 words)", "Gap question 2 (max 20 words)"],
  "competitorNote": "One sentence observation about what successful shops with this positioning do well. Return null if not applicable."
}

Rules:
- No em dashes
- No marketing language (do not use: unlock, elevate, leverage, embark, delve)
- Write like an experienced operator giving advice to a new owner
- The rewrite must be grounded in the current content, not a replacement concept
- Return only valid JSON, nothing else`;
}
