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

// TIM-2340: user-entered competitor. Narrative is allowed to name only these
// businesses. Empty list + no_direct_competitors_identified=false means the
// LLM must discuss competition qualitatively without naming specific shops.
export interface ConceptCompetitor {
  id: string;
  name: string;
  address?: string;
  what_they_do_well?: string;
  gaps?: string;
}

export interface ConceptDocumentV2 {
  version: 2;
  components: Record<ConceptComponentId, ConceptComponentV2>;
  personas?: CustomerPersona[];
  // TIM-2340: user-entered competitor list (optional — UI ships separately).
  competitors?: ConceptCompetitor[];
  // TIM-2340: explicit toggle for "no direct competitors". Distinguishes
  // "user said none" from "user hasn't filled this in yet" so the narrative
  // can state it plainly when true.
  no_direct_competitors_identified?: boolean;
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
    // TIM-1476: reframed from "what can't a competitor copy" to the
    // customer-behavior framing the founder requested.
    label: "Differentiation",
    hint: "What makes customers walk past other coffee shops to come to yours? Think about something specific to you: a relationship, an atmosphere, a sourcing choice, a person. The answer should feel like a story, not a strategy.",
    emptyPrompt: "What makes customers walk past the other coffee shops to come to yours? Think about the thing that's specific to you: a relationship, an atmosphere, a person.",
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
    hint: "Neighbourhood, foot traffic, and what drew you there. Even a rough area or building type now will make the lease, buildout, and operations workspaces sharper later. You can skip this for now and come back.",
    emptyPrompt: "Where are you thinking of opening? Neighbourhood, street corner, or building type. Early detail is better than none.",
    multiline: true,
    rows: 3,
    // deferrable keeps the In doc / Skip toggle so users can exclude it from
    // the printed doc; TIM-1476 removed the visual dimming separately.
    deferrable: true,
  },
  {
    id: "offering",
    label: "Offering",
    hint: "Core menu focus, price point, and what you will and will not serve. A tight focus (espresso and slow bar only, no food) is as useful as a long list. Leave blank and return when you are ready.",
    emptyPrompt: "What will you serve? A tight menu focus (espresso and slow bar only, no food) is as useful as a long list.",
    multiline: true,
    rows: 3,
    deferrable: true,
  },
];

// TIM-2505: shop-type-aware overrides for hint and emptyPrompt.
// Keyed by onboarding display strings. "Full cafe with food" falls back to defaults.
// Both "Mobile cart or kiosk" and "Mobile cart or pop-up" map to mobile variants.
type ConceptVariant = { hint?: string; emptyPrompt?: string };
type ConceptVariantMap = Partial<Record<ConceptComponentId, ConceptVariant>>;

const MOBILE_CART_VARIANTS: ConceptVariantMap = {
  shop_identity: {
    hint: "Working name for the cart or pop-up. It needs to fit on a sandwich board, a vinyl wrap, and a social handle at the same time. Short and easy to say out loud is more useful than clever.",
    emptyPrompt: "What are you calling it? Something easy to say at a market and easy to find on Instagram is a good target.",
  },
  vision: {
    hint: "What does this cart exist to do? Where you set up, how long you operate there, and why someone comes out of their way to find you are all part of the answer.",
    emptyPrompt: "What does the cart exist to do? Where will you operate, and what does a perfect transaction look like for you and the customer?",
  },
  target_customer: {
    hint: "Who is lining up at your pitch spot? Farmers market regulars, office workers near your daily stop, walkers passing through? Describe the person who shows up consistently and tells their friends, not every possible customer.",
    emptyPrompt: "Who is your customer? Not everyone at the market. The specific person who comes back every week and brings someone new.",
  },
  differentiation: {
    hint: "What makes someone seek you out instead of walking past? On wheels, you cannot rely on location alone. Sourcing, the interaction, a signature drink, or a quality level no one nearby matches can all be the answer.",
    emptyPrompt: "What do you do that the other cart or the nearest chain does not? What makes someone decide to find you at a different market when you rotate?",
  },
  brand_voice: {
    hint: "How should the cart sound on Instagram, on the sandwich board, and in the first 30 seconds with a new customer? Mobile operators are often the brand in a way a fixed location is not.",
    emptyPrompt: "A few words that should always come through: on social, on signage, and in the way you talk to someone buying coffee for the first time.",
  },
  location: {
    hint: "List your pitch spots: daily corner, weekly market, event rotation. Include your setup (trailer, pushcart, converted van) and permit status if known. Even rough details now make operations and financial planning sharper later.",
    emptyPrompt: "Where do you operate? List your primary pitch or rotation schedule. Include your setup type and permit status, even if it is still in progress.",
  },
  offering: {
    hint: "Cart menus are tight by necessity. How many drinks, at most? Any grab-and-go food or coffee only? A tight menu is faster and more consistent. One signature item drives repeat customers.",
    emptyPrompt: "What do you serve? Espresso drinks, drip, cold brew, pastries? Think about what you can execute through a window or at a table setup with your current equipment.",
  },
};

export const SHOP_TYPE_CONCEPT_VARIANTS: Record<string, ConceptVariantMap> = {
  "Mobile cart or pop-up": MOBILE_CART_VARIANTS,
  "Mobile cart or kiosk": MOBILE_CART_VARIANTS,
  "Drive-through": {
    shop_identity: {
      hint: "Short and legible from a moving car. It also needs to work on a menu board and as verbal shorthand. If someone can say it in two seconds, you are in good shape.",
      emptyPrompt: "What is the name? Short enough to read from a car and easy enough that someone can recommend it without spelling it out.",
    },
    vision: {
      hint: "What does this drive-through exist to do? Speed and quality are not at odds, but your vision should say which one you lead with and what that means for how you run the place.",
      emptyPrompt: "What does this drive-through exist to do? What does a perfect transaction look like for the customer and for you?",
    },
    target_customer: {
      hint: "Who is in your queue? Morning commuters, school drop-off parents, construction crews? Drive-throughs serve a very specific rhythm of day. Describe the person who comes through at 7am five days a week.",
      emptyPrompt: "Who is your customer? The person who comes through on a schedule, not the occasional visitor. What is their morning like before they reach your window?",
    },
    differentiation: {
      hint: "Speed and consistency are expected at a drive-through. What do you offer that the chain two blocks away does not? Quality, local sourcing, a real interaction, or a price point that makes daily visits make sense are all worth naming.",
      emptyPrompt: "What makes customers come here instead of the chain? Speed is table stakes. What is the thing that makes them prefer you once they have tried both?",
    },
    brand_voice: {
      hint: "You have a window and maybe 45 seconds. What should that feel like? Warm, efficient, personal? Think about the regulars who come through five days a week and what they should feel every time.",
      emptyPrompt: "How should the interaction feel? The menu board, the intercom, the window handoff. What comes through consistently across all of it?",
    },
    location: {
      hint: "Describe the site: traffic volume, street visibility, queuing lane length, how cars enter and exit. What drew you to this spot? Specific details now make the operations and buildout planning sharper later.",
      emptyPrompt: "Describe the site. Traffic flow, how many cars can queue, visibility from the road, and what is nearby. Early detail is better than none.",
    },
    offering: {
      hint: "Shorter menus are faster windows. What are the five drinks you will always carry, and is there a seasonal item? Think through whether food is worth the added complexity for your throughput goals.",
      emptyPrompt: "What do you serve? A drive-through menu that is too long slows the queue. What are the core drinks, and is there grab-and-go food?",
    },
  },
  "Roastery cafe": {
    shop_identity: {
      hint: "Does the name lead with the roasting, the cafe, or both? Names that signal craft and origin tend to attract the accounts and customers who will pay for quality. Working title is fine as long as it points at something real.",
      emptyPrompt: "What are you calling it? Does the name signal the roasting side, the cafe side, or both? A working title that points somewhere specific is enough.",
    },
    vision: {
      hint: "What does the roastery and cafe combination exist to do? Is the cafe a showcase for the roasting, or is the roastery the badge of quality behind the cafe? Being clear about which one leads shapes every decision from layout to pricing to sales channels.",
      emptyPrompt: "What does this place exist to do? Is the cafe the main event with roasting as the differentiator, or is production the engine and the cafe the front window?",
    },
    target_customer: {
      hint: "Are you selling to walk-in cafe customers, wholesale accounts (restaurants, offices), or both? Each group wants something different. Coffee people who want to taste the sourcing, buyers who need reliability at volume, and locals who just want a good morning cup are three different customers.",
      emptyPrompt: "Who are your customers? Wholesale buyers, specialty coffee people, or the neighborhood? Be specific about which one you are building the experience for first.",
    },
    differentiation: {
      hint: "What makes your roastery distinct from others who also claim craft and transparency? Direct-trade sourcing, micro-lot experiments, a specific origin focus, a visible production process? Watching a roast happen has a pull that packaging alone cannot replicate.",
      emptyPrompt: "What makes your roasting distinct? The sourcing, a process, an origin focus? And what do walk-in customers experience here that they would not get from just buying a bag online?",
    },
    brand_voice: {
      hint: "Does the roastery voice sound like craft production, education, or community? The tone that works for a wholesale pitch sheet is different from the one that works on a cafe menu board. Where do they overlap?",
      emptyPrompt: "How should the brand sound? On the bag, in the cafe, and in a pitch to a restaurant buyer. What comes through consistently across all three?",
    },
    location: {
      hint: "Is the roasting floor customer-facing? Watching the roast is a draw, but production airflow and noise have spatial requirements. Describe the split between production and customer-facing space, even roughly.",
      emptyPrompt: "Where does the roasting happen relative to the cafe? Is the floor visible from the bar? Is there a cupping room? A rough layout in words is useful here.",
    },
    offering: {
      hint: "Three potential revenue streams: retail bags, wholesale accounts, cafe by the cup. Which one is the primary business and which ones support it? Pricing should match the tier you are targeting for each channel.",
      emptyPrompt: "What do you sell and to whom? Retail bags, wholesale accounts, cafe drinks, or all three? Which one is the engine the others depend on?",
    },
  },
  "Espresso bar (drinks only)": {
    shop_identity: {
      hint: "Something that works on a single-panel sign and fits a tight footprint. If someone can describe it to a friend in five words, you are in good shape.",
      emptyPrompt: "What is the name? Think about how it reads on a sign above the bar and how it shows up in a Google Maps pin.",
    },
    vision: {
      hint: "No food is a choice, not a limitation. What does this bar exist to do with a drinks-only focus? Craft at speed, a specific extraction program, a community built around the bar itself?",
      emptyPrompt: "What does this bar exist to do? No food means something specific. What does the drinks-only focus unlock for you?",
    },
    target_customer: {
      hint: "Who is standing at the bar or lined up at the window? Coffee people who want to talk about the origin, morning commuters who need the best latte on their block, or both? The drinks-only constraint makes your customer's reason for being here sharper.",
      emptyPrompt: "Who is your customer? The regular who comes every morning and the curious first-timer who saw you on Instagram. Describe both.",
    },
    differentiation: {
      hint: "With no food, the coffee has to fully earn the visit. What about your extraction method, sourcing, staff knowledge, or bar experience makes that true?",
      emptyPrompt: "What makes someone come here instead of a place with both coffee and food? The drinks have to completely justify the stop.",
    },
    brand_voice: {
      hint: "Drinks-only often signals craft seriousness. How do you carry that without making a casual customer feel like they need to study before ordering? Knowledgeable but not cold is a hard voice to hold. Describe what it sounds like for your bar.",
      emptyPrompt: "How does the bar sound? On the board, in the way your staff talks about what they are pouring, in the way you greet someone who has never been before.",
    },
    location: {
      hint: "Espresso bars often run under 500 sq ft. Describe the footprint, the foot traffic pattern, and whether you are standing-only, a few stools, or a walk-up window. Even rough detail now makes later planning sharper.",
      emptyPrompt: "Where is this and what does the footprint look like? Walk-up window, standing bar, or a few seats? Describe the physical situation, even if it is early.",
    },
    offering: {
      hint: "Espresso, drip, cold brew with a tight menu and high quality on each item. Is there a specialty extraction method (slow bar, siphon) or a rotating single-origin program? The offering section should show the quality bar, not just the item list.",
      emptyPrompt: "What do you serve? List the drink types and any specialty extraction. No food means the drinks program is the whole story.",
    },
  },
};

// Resolve the effective component metadata based on the owner's shop type(s).
// Multi-select: if only one type is selected, use its variants. If more than one
// are selected, use the first non-"Full cafe with food" type that has a variant;
// fall back to defaults if no clear winner. Co-working / Hybrid space content
// is ready but not yet wired (type not in onboarding — see TIM-2505 task 5).
export function resolveConceptComponents(
  shopType: string | string[] | null | undefined,
): ReadonlyArray<(typeof CONCEPT_COMPONENTS_V2)[number]> {
  let effectiveType: string | null = null;

  if (Array.isArray(shopType)) {
    if (shopType.length === 1) {
      effectiveType = shopType[0];
    } else if (shopType.length > 1) {
      // Pick the first non-default type that has a known variant.
      effectiveType =
        shopType.find(
          (t) => t !== "Full cafe with food" && SHOP_TYPE_CONCEPT_VARIANTS[t],
        ) ?? null;
    }
  } else if (typeof shopType === "string") {
    effectiveType = shopType;
  }

  if (!effectiveType || !SHOP_TYPE_CONCEPT_VARIANTS[effectiveType]) {
    return CONCEPT_COMPONENTS_V2;
  }

  const variantMap = SHOP_TYPE_CONCEPT_VARIANTS[effectiveType];
  return CONCEPT_COMPONENTS_V2.map((meta) => {
    const override = variantMap[meta.id];
    if (!override) return meta;
    return { ...meta, ...override };
  });
}

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

    // TIM-2340: read competitors[] + no_direct_competitors_identified.
    // Defensive — array entries that don't carry a name are dropped silently
    // so a half-saved row never crashes the prompt builder.
    let competitors: ConceptCompetitor[] | undefined;
    if (Array.isArray(obj.competitors)) {
      const valid = (obj.competitors as unknown[])
        .map((c) => (c && typeof c === "object" ? c as Record<string, unknown> : null))
        .filter((c): c is Record<string, unknown> => c !== null && typeof c.name === "string" && c.name.trim().length > 0)
        .map<ConceptCompetitor>((c, idx) => ({
          id: typeof c.id === "string" && c.id.trim().length > 0 ? c.id : `competitor-${idx}`,
          name: String(c.name).trim(),
          address: typeof c.address === "string" ? c.address : undefined,
          what_they_do_well: typeof c.what_they_do_well === "string" ? c.what_they_do_well : undefined,
          gaps: typeof c.gaps === "string" ? c.gaps : undefined,
        }));
      if (valid.length > 0) competitors = valid;
    }
    const noDirect = typeof obj.no_direct_competitors_identified === "boolean"
      ? obj.no_direct_competitors_identified
      : undefined;

    return {
      version: 2,
      components,
      personas,
      ...(competitors ? { competitors } : {}),
      ...(noDirect !== undefined ? { no_direct_competitors_identified: noDirect } : {}),
    };
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
  const differentiationNote = componentId === "differentiation"
    ? "\nFor the Differentiation field: the framing is what makes customers walk past other coffee shops to come to this one. Rewrite through that lens, not from a competitive-strategy angle.\n"
    : "";

  return `You are helping a coffee shop owner sharpen their business concept document.
${differentiationNote}
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
