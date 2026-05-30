// TIM-619 / TIM-834 / TIM-879: Concept workspace data shape + helpers.
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
    placeholder: "e.g. Field Notes Coffee",
    multiline: false,
  },
  {
    key: "mission",
    label: "Mission",
    hint: "One or two sentences. What does this shop exist to do?",
    placeholder: "Be the place on Trumbull where the neighborhood actually lands: espresso in the morning, a table for the afternoon, 300 books on the shelf you can borrow if you want.",
    multiline: true,
    rows: 3,
  },
  {
    key: "target_market",
    label: "Target Customer Personas",
    hint: "Who is this shop for? The more specific, the better.",
    placeholder: "Woodbridge residents who walk over before work, remote workers who need a table until noon, and the Cass Tech teachers who stop in before first period. Most are on a first-name basis within two weeks.",
    multiline: true,
    rows: 3,
  },
  {
    key: "differentiation",
    label: "What makes you different",
    hint: "Name the one or two things competitors in this market cannot easily copy.",
    placeholder: "The only café on this stretch of Trumbull with a lending library, 300 books, borrow-and-return, no card needed. All beans from Detroit City Coffee, which means I can walk the roastery in fifteen minutes if something's off.",
    multiline: true,
    rows: 3,
  },
  {
    key: "brand_voice",
    label: "Brand voice & pillars",
    hint: "How does the brand sound? Pick a handful of words that should always come through.",
    placeholder: "Unhurried, local, zero coffee-snob energy. Pillars: the neighborhood table, honest coffee, the regulars who know your name.",
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

// ── Persona types (TIM-879) ──────────────────────────────────────────────────

export type PersonaAgeRange = "18-25" | "25-35" | "35-50" | "50+";
export type PersonaIncomeRange = "under-40k" | "40k-80k" | "80k-120k" | "over-120k";
export type PersonaVisitFrequency = "daily" | "several-per-week" | "weekly" | "occasional";
export type PersonaSpendPerVisit = "under-6" | "6-10" | "10-15" | "over-15";
export type PersonaValue =
  | "price"
  | "speed"
  | "atmosphere"
  | "craft"
  | "community"
  | "convenience"
  | "consistency";

export interface CustomerPersona {
  id: string;
  name: string;
  photo?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  ageRange?: PersonaAgeRange;
  occupation?: string;
  incomeRange?: PersonaIncomeRange;
  dailyContext?: string;
  whyTheyVisit: string;
  painPoints?: string;
  // TIM-1476: what this persona typically orders when they visit. Free text,
  // captures drink + food/pastry behavior so the menu and pricing decisions
  // have a real customer behavior to point at.
  typicalOrder?: string;
  values?: PersonaValue[];
  visitFrequency?: PersonaVisitFrequency;
  spendPerVisit?: PersonaSpendPerVisit;
  notes?: string;
}

export const PERSONA_AGE_RANGE_LABELS: Record<PersonaAgeRange, string> = {
  "18-25": "18-25",
  "25-35": "25-35",
  "35-50": "35-50",
  "50+": "50+",
};

export const PERSONA_INCOME_RANGE_LABELS: Record<PersonaIncomeRange, string> = {
  "under-40k": "Under $40k",
  "40k-80k": "$40k to $80k",
  "80k-120k": "$80k to $120k",
  "over-120k": "Over $120k",
};

export const PERSONA_VISIT_FREQUENCY_LABELS: Record<PersonaVisitFrequency, string> = {
  "daily": "Every day",
  "several-per-week": "A few times a week",
  "weekly": "Once a week",
  "occasional": "Now and then",
};

export const PERSONA_SPEND_LABELS: Record<PersonaSpendPerVisit, string> = {
  "under-6": "Under $6",
  "6-10": "$6 to $10",
  "10-15": "$10 to $15",
  "over-15": "Over $15",
};

export const PERSONA_VALUE_LABELS: Record<PersonaValue, string> = {
  "price": "Price",
  "speed": "Speed",
  "atmosphere": "Atmosphere",
  "craft": "Craft",
  "community": "Community",
  "convenience": "Convenience",
  "consistency": "Consistency",
};

export const PERSONA_VALUE_OPTIONS: PersonaValue[] = [
  "price", "speed", "atmosphere", "craft", "community", "convenience", "consistency",
];

export const MAX_PERSONAS = 5;

export function createPersonaId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `persona-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setPersonaPrimary(personas: CustomerPersona[], targetId: string): CustomerPersona[] {
  return personas.map((p) => ({ ...p, isPrimary: p.id === targetId }));
}

function isValidPersona(v: unknown): v is CustomerPersona {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.isPrimary === "boolean";
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
  personas?: CustomerPersona[];
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
    hint: "Working title is fine. You can change it later, but pick something specific enough that it points at a real shop instead of a placeholder.",
    emptyPrompt: "What are you thinking of calling it? A working name is enough to start.",
    multiline: false,
    deferrable: false,
  },
  {
    id: "vision",
    label: "Vision",
    hint: "What does this shop exist to do? One or two sentences. Not the menu, not the buildout, the reason a customer should care it exists at all.",
    emptyPrompt: "What is this shop for? Not the menu or the location. The reason it should exist.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "target_customer",
    label: "Target Customer Personas",
    hint: "Personas are the real people you are making decisions for. The clearer they are, the easier every menu, pricing, and hours call gets.",
    emptyPrompt: "Add your first customer persona to describe the real person you are making decisions for.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "differentiation",
    label: "Differentiation",
    hint: "Name one or two things competitors in this market cannot easily copy. Supplier relationships, people, atmosphere, or expertise that takes years to build beat anything you can advertise.",
    emptyPrompt: "What will make customers choose you over the place down the street? Think supplier relationships, people, atmosphere, expertise. Things that take years to copy.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "brand_voice",
    label: "Brand voice",
    hint: "How should the brand sound? A handful of words that should always come through in your signs, menu copy, and the way you greet a regular.",
    emptyPrompt: "Think about a few words your regulars might use to describe you. Or describe the shop you wish existed when you were just a customer.",
    multiline: true,
    rows: 3,
    deferrable: false,
  },
  {
    id: "location",
    label: "Location",
    hint: "Neighbourhood, foot traffic, and what drew you there. Even a rough area or building type now will make the lease, buildout, and operations workspaces sharper later.",
    emptyPrompt: "Where are you thinking of opening? Neighbourhood, street corner, or building type. Early detail is better than none.",
    multiline: true,
    rows: 3,
    deferrable: true,
  },
  {
    id: "offering",
    label: "Offering",
    hint: "Core menu focus, price point, and what you will and will not serve. A tight focus (espresso and slow bar only, no food) is as useful as a long list.",
    emptyPrompt: "What will you serve? A tight menu focus (espresso and slow bar only, no food) is as useful as a long list.",
    multiline: true,
    rows: 3,
    deferrable: true,
  },
];

export function normalizeConceptV2(input: unknown): ConceptDocumentV2 {
  if (!input || typeof input !== "object") {
    return { ...EMPTY_CONCEPT_V2, components: { ...EMPTY_CONCEPT_V2.components } };
  }
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

    // Read stored personas
    let personas: CustomerPersona[] | undefined;
    if (Array.isArray(obj.personas)) {
      const valid = obj.personas.filter(isValidPersona) as CustomerPersona[];
      if (valid.length > 0) personas = valid;
    }

    // Migration: if no personas yet but target_customer.content is non-empty, seed a stub persona
    if (!personas && components.target_customer.content.trim().length > 0) {
      const now = new Date().toISOString();
      personas = [{
        id: createPersonaId(),
        name: "My Customer",
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
        whyTheyVisit: "",
        notes: components.target_customer.content,
      }];
    }

    return { version: 2, components, personas };
  }

  // V1 migration
  const pick = (key: string): string => {
    const v = (obj as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  };
  const targetMarket = pick("target_market");
  let personas: CustomerPersona[] | undefined;
  if (targetMarket.trim().length > 0) {
    const now = new Date().toISOString();
    personas = [{
      id: createPersonaId(),
      name: "My Customer",
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
      whyTheyVisit: "",
      notes: `[Migrated from V1 target_market field]\n${targetMarket}`,
    }];
  }
  return {
    version: 2,
    components: {
      shop_identity:   { content: pick("name"),           included: true },
      vision:          { content: pick("mission"),         included: true },
      target_customer: { content: targetMarket,            included: true },
      differentiation: { content: pick("differentiation"), included: true },
      brand_voice:     { content: pick("brand_voice"),    included: true },
      location:        { content: "",                      included: false },
      offering:        { content: "",                      included: false },
    },
    personas,
  };
}

function isTargetCustomerFilled(doc: ConceptDocumentV2): boolean {
  return (
    (doc.personas !== undefined && doc.personas.length > 0) ||
    doc.components.target_customer.content.trim().length > 0
  );
}

export function isConceptV2Complete(doc: ConceptDocumentV2): boolean {
  return (Object.entries(doc.components) as [ConceptComponentId, ConceptComponentV2][]).every(
    ([id, c]) => {
      if (!c.included) return true;
      if (id === "target_customer") return isTargetCustomerFilled(doc);
      return c.content.trim().length > 0;
    }
  );
}

export function getConceptV2Progress(doc: ConceptDocumentV2): {
  filled: number;
  total: number;
} {
  let filled = 0;
  let total = 0;
  for (const [id, c] of Object.entries(doc.components) as [ConceptComponentId, ConceptComponentV2][]) {
    if (!c.included) continue;
    total++;
    if (id === "target_customer") {
      if (isTargetCustomerFilled(doc)) filled++;
    } else {
      if (c.content.trim().length > 0) filled++;
    }
  }
  return { filled, total };
}

export function formatConceptV2ForAI(doc: ConceptDocumentV2): string {
  const lines: string[] = [];
  for (const meta of CONCEPT_COMPONENTS_V2) {
    const c = doc.components[meta.id];
    if (!c) continue;

    if (meta.id === "target_customer") {
      if (doc.personas && doc.personas.length > 0) {
        const primary = doc.personas.find((p) => p.isPrimary) ?? doc.personas[0];
        lines.push(`- **Target Customer Personas** (${doc.personas.length} total; primary: ${primary.name}):`);
        doc.personas.forEach((p, i) => {
          lines.push(`  ${i + 1}. ${p.name}${p.isPrimary ? " (primary)" : ""}`);
          if (p.whyTheyVisit.trim()) lines.push(`     - Why they come: ${p.whyTheyVisit}`);
          if (p.typicalOrder?.trim()) lines.push(`     - Typical order: ${p.typicalOrder.trim()}`);
          if (p.values && p.values.length > 0) {
            lines.push(`     - Values: ${p.values.map((v) => PERSONA_VALUE_LABELS[v]).join(", ")}`);
          }
          const freq = p.visitFrequency ? PERSONA_VISIT_FREQUENCY_LABELS[p.visitFrequency] : null;
          const spend = p.spendPerVisit ? PERSONA_SPEND_LABELS[p.spendPerVisit] : null;
          if (freq || spend) {
            const parts = [freq && `visits: ${freq}`, spend && `spends ${spend}`].filter(Boolean);
            lines.push(`     - ${parts.join(", ")}`);
          }
        });
      } else if (c.content?.trim()) {
        lines.push(`- **Target Customer Personas**: ${c.content.trim()}`);
      }
    } else if (c.content?.trim()) {
      lines.push(`- **${meta.label}**: ${c.content.trim()}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "_no concept fields filled in yet_";
}

// TIM-893: seed prompt for the per-field "Ask Co-pilot" buttons.
// Written from the owner's POV so it drops cleanly into the drawer input.
// Keep it conversational; the AI sees the full plan snapshot separately.
export function buildFieldPrompt(
  componentLabel: string,
  currentContent: string
): string {
  const trimmed = currentContent.trim();
  if (!trimmed) {
    return `I'm working on the "${componentLabel}" section of my concept and haven't written anything yet. Ask me a couple of grounding questions so I can get a first draft down.`;
  }
  return `I'm working on the "${componentLabel}" section of my concept. Here's what I have so far:\n\n"${trimmed}"\n\nWhere is this tight, where is it vague? Push back on anything that sounds generic and help me make it more specific to my plan.`;
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
