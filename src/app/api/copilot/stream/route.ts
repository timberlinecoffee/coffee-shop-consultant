// Streaming co-pilot route (SSE).
// TIM-866: unified usage messaging — paid gates on ai_credits_remaining.
// TIM-1902: free_trial users are now card-on-file trialists (7-day Stripe trial) granted
// 75 credits up front and metered on the same ai_credits_remaining balance as paid users.
// The legacy 5-message free-trial counter (COPILOT_FREE_TRIAL_LIMIT) has been retired.
// SSE event names: text | thinking | suggestions | status | error | done
// TIM-1670: web_search server tool wired in so competitor/local-market queries do genuine
// multi-source research (enumerate→verify→cite) instead of answering from priors; location
// candidates surfaced for grounding; the web_search tool is registered on isResearch turns; `status:searching` event.
// INVARIANT: the research directive is injected ONLY on isResearch turns (same gate as the
// web_search tool) — never tell the model it has a tool we didn't register, or it fabricates.
// TIM-1897: all turns run on Claude Haiku (src/lib/ai/models.ts) — no Sonnet routing, no extended thinking.
// TIM-1637: reorganize_equipment_list tool emits suggestions event when called.
// TIM-1638: timeline inconsistency — groundss answers in plan's targetLaunchDate; emits suggestions on mismatch.
// TIM-1648: propose_item tool lets Scout emit a structured menu-item proposal (beverage+recipe) into menu_pricing.

export const runtime = "nodejs" // service-role writes (ai_errors) need node; Edge has no advantage here
// TIM-1670: multi-search competitor/market research (web_search, up to 8 uses) plus
// synthesis can outrun the old 60s cap and time out mid-answer. Give research room.
export const maxDuration = 120

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { composePlanSnapshot } from "@/lib/copilot/composePlanSnapshot"
import {
  isSubscriptionActive,
  isBetaWaived,
  isTrialActive,
  effectivePlanForGating,
} from "@/lib/access"
import { COPILOT_NAME } from "@/lib/copilot/branding"
import { normalizeAIOutput } from "@/lib/normalize"
import { computeCreditCost, describeCreditCharge } from "@/lib/credits/cost"
import { PLATFORM_AI_MODEL } from "@/lib/ai/models"
import { loadPlanContext } from "@/lib/plan-context"
import { buildEquipmentCostProposal, isEquipmentCostChangeIntent, type EquipmentCostItem } from "@/lib/cross-workspace-apply"
import type { WorkspaceKey } from "@/types/supabase"
import type { NextRequest } from "next/server"

// ── Constants ────────────────────────────────────────────────────────────────

const TTFT_MS = 8_000
const GAP_MS = 20_000
// TIM-1746/TIM-1763: while a tool call streams its input (e.g. reorganize_equipment_list
// for a 100+ item equipment list), the model can go silent for >20s between
// content_block_start and the first input_json_delta chunk — the JSON array is composed
// before any partial_json is emitted. That gap is normal for large structured outputs, so
// use a wider watchdog window while inside a tool-input stream and keep the snappy 20s
// window for ordinary text/thinking stalls. Stays well under maxDuration (120s).
const TOOL_GAP_MS = 60_000
const HEARTBEAT_MS = 15_000

// Stable sections: cached with cache_control:ephemeral across the conversation.
const STABLE_IDENTITY = `You are ${COPILOT_NAME}, Timberline Coffee School's AI planning assistant. You are a knowledgeable friend who has helped dozens of people open successful coffee shops — not a professor, not a consultant charging by the hour.`

const STABLE_COACHING_STYLE = `## Coaching Style
- Warm, direct, conversational. Knowledgeable friend, not professor.
- Use coffee-specific examples and real-world analogies.
- Challenge assumptions constructively; push for specificity, don't accept vague answers.
- Reference their specific situation (budget, location, experience) to make advice concrete.
- 2–3 paragraphs max unless they ask for more.
- End every response with a specific question or clear next step.
- NEVER use the words: actually, genuinely, honestly, leverage, synergy, curated, unlock, elevate, embark, delve.
- NEVER hallucinate specific prices, addresses, suppliers, or statistics.
- You know coffee deeply; use that knowledge to challenge and refine their thinking.
- If their plan conflicts with their budget or location, say so directly but kindly.

## Problem → Recommendation Rule (always)
Whenever you flag a problem, risk, weakness, or gap, you MUST also give:
1. **A recommendation** — what to change to fix or mitigate it. Concrete, with numbers when possible. No vague verbs ("consider", "explore", "look into").
2. **A next step** — the single, named thing the owner can do this week (e.g. "Update your menu price grid: lattes from $5.25 to $5.65", not "think about pricing").
3. **A short why** — one sentence on why the recommendation should work.
Pure problem-listing without a fix is not acceptable. If you don't have enough context to give a concrete recommendation, ask for the missing detail.

## Generative Requests (always fulfill)
When the user explicitly asks you to design, draft, write, generate, name, or come up with something concrete (a beverage or drink, a recipe, menu copy, a role description, a description, a checklist), produce a complete, ready-to-use version. Do not refuse, and do not tell the user to do it themselves. "Design it for me" is a core reason people use you, not something to push back on.
- Lead with the finished thing (the drink with its build and ingredients, the recipe with quantities, the copy), then a short note on the choices you made.
- Make reasonable assumptions from their plan and profile instead of stalling on a clarifying question. If a key detail is missing, pick a sensible default, say what you assumed, and offer to adjust.
- Keep your coffee judgment: if what you produced has a real weakness, flag it and give the fix per the Problem → Recommendation Rule.
- Generating is not applying. You present the result for the user to review; saving it into their plan stays a separate, explicit step they accept, edit, or reject.`

// TIM-1670: research depth. Local market / competitor / supplier / pricing-benchmark
// questions cannot be answered from training priors — they go stale and miss obvious
// local players. INVARIANT: this directive is injected ONLY on turns where the web_search
// tool is actually registered (isResearch). Telling the model it has a tool it does not
// have makes it fabricate tool-call-shaped text and answer from priors — the exact failure
// this issue fixes. Directive presence ⟺ tool presence, always.
const RESEARCH_DIRECTIVE = `## Local & Market Research (use web_search — do NOT answer from memory)
You have a \`web_search\` tool. For any question that depends on real-world, location-specific, or current facts you MUST use it instead of answering from training data. This always includes:
- Competitor / market research ("who are my competitors", "what coffee shops are near me", "what's the market like here").
- Local suppliers, roasters, distributors, equipment vendors, real estate, or permits for the owner's area.
- Current prices, wages, rents, or benchmarks for a specific place.

### How to research competitors / local market (required depth)
Answering with "a couple of competitors" from memory is a failure. Do this instead:
1. **Ground in the owner's actual location and segment.** Use the specific address / neighborhood / city from their plan (see Local Market Context below) and their shop type and target customer. Never research a generic or guessed location.
2. **Enumerate broadly first.** Run several distinct searches, not one. Vary the angle: "coffee shops in {neighborhood/city}", "best coffee {city}", "cafes near {address}", "{city} specialty coffee roasters", map/directory style queries. Pull a candidate list of every plausible direct competitor — independents and chains both.
3. **Verify each candidate.** Confirm it actually exists, is currently open, and is genuinely a direct competitor (similar segment and trade area), not a distant or unrelated business.
4. **Then answer.** Return a reasonably complete list of the primary direct competitors — not just the first two or three. For each, give name, location/neighborhood, and a one-line read on positioning (price tier, specialty vs. grab-and-go, notable strength). Cite the actual source URL for each as a clickable markdown link (e.g. \`[Rosso Coffee](https://…)\`) using the real links your web_search returned — not just a site name in brackets.
5. **Be honest about coverage.** If results are thin for a small or rural area, say so and name what you did find, rather than padding with invented names. Never fabricate a competitor, address, or statistic — if a search did not surface it, do not assert it.

Keep the Problem → Recommendation Rule: after the competitor list, give the owner a concrete positioning takeaway and a named next step.`

// TIM-1714: apply directive — injected ONLY when offerProposeItemTool (same gate as
// registering propose_item). Directive presence ⟺ tool presence, always.
// Without this, the model hallucinates "Done. I've added…" in text when the user asks
// to apply something (e.g. "Add that beverage to my menu") because "Generating is not
// applying" in STABLE_COACHING_STYLE makes it treat the save as a user action — but it
// still writes a confident completion text without calling the tool.
const PROPOSE_ITEM_DIRECTIVE = `## Adding Items to the Menu (use propose_item tool — do NOT describe it in text)
You have a \`propose_item\` tool. When the owner asks you to add, save, apply, or put a beverage or menu item into their Menu & Pricing workspace — including when they refer back to something you designed earlier in this conversation (e.g. "add that to my menu", "save it", "put that beverage on the menu") — you MUST call the \`propose_item\` tool. Do NOT write a text-only response claiming the item was added. The tool emits a structured proposal the owner reviews and accepts or rejects before anything is saved. After calling the tool, briefly confirm what you proposed.`

// TIM-1798: cross-workspace cost-change directive — injected ONLY when
// offerEquipmentChangeTool (same gate as registering propose_equipment_change).
// Directive presence ⟺ tool presence, always. This is what lets Scout act on a
// request that spans suites ("reprice the espresso machine and update my
// financials") instead of refusing because it is "only in Equipment".
const EQUIPMENT_CHANGE_DIRECTIVE = `## Changing Equipment Costs (use propose_equipment_change — coordinated across workspaces)
You have a \`propose_equipment_change\` tool. When the owner asks you to set, change, raise, or lower the cost of an equipment item, or to add a new piece of equipment with a cost — INCLUDING when they also ask you to update the Financials, startup costs, or budget to match ("reprice the espresso machine to $11k and update my financials") — you MUST call \`propose_equipment_change\`. Do NOT refuse or say you can only edit the current workspace, and do NOT tell them to change Financials by hand.
- The equipment item's unit cost is the single source of truth: changing it automatically flows to the Financials equipment line and the startup-cost total. The tool builds ONE review proposal showing the equipment change AND the dependent Financials figures together; the owner accepts, edits, or rejects before anything is saved.
- For a reprice, pass the item's number (the I# value from the Equipment List below) and the new unit cost in cents. For a new item, pass action "add" with a name, category, and unit cost.
- After calling the tool, briefly confirm what you proposed in plain language.`

// ── Equipment reorganize types / helpers ─────────────────────────────────────

interface EquipmentItemCtx {
  id: string
  name: string
  section_id: string | null
  position: number
  category: string
  // TIM-1798: cost + quantity power the cross-workspace cost-change proposal
  // (equipment item ↔ Financials capex line ↔ startup-cost total).
  unit_cost_cents: number
  quantity: number
}

interface SectionCtx {
  id: string
  name: string
  position: number
}

// Minimal SuggestionPayload — mirrors AIReviewModal.tsx (server-safe copy).
interface SuggestionPayload {
  id: string
  fieldId: string
  fieldLabel: string
  originalValue: string
  proposedValue: string
  isStructured?: boolean
}

// TIM-1746: the reorganize_equipment_list tool addresses items/sections by their short
// numeric index (S#/I#), NOT their UUIDs. A 100+ item list emitted with full UUIDs for
// item_id AND section_id is ~40 tokens/item (~4–5k tokens) — the model plans the whole
// arrangement before emitting the first token, so time-to-first-tool-chunk exceeds even the
// 60s gap watchdog and the turn dies. Indices cut that to ~5 tokens/item, so generation
// starts streaming fast and finishes well under maxDuration. The server maps indices back to
// UUIDs (positions inferred from list order) in mapIndexedArrangement.
function formatEquipmentContext(items: EquipmentItemCtx[], sections: SectionCtx[]): string {
  const sectionIndex = new Map(sections.map((s, idx) => [s.id, idx]))
  const lines = [
    "Sections (assign items using the section number S#):",
    ...sections.map((s, idx) => `  S${idx}: ${s.name}`),
    "  (or null for unsectioned)",
    "",
    "Items (reference each by its item number I#, ordered by current position within section):",
    ...items.map((i, idx) => {
      const station = i.section_id
        ? sectionIndex.has(i.section_id)
          ? `S${sectionIndex.get(i.section_id)}`
          : "Unsectioned"
        : "Unsectioned"
      // TIM-1798: include current unit cost + quantity so propose_equipment_change
      // can reason about relative price changes ("make it 20% cheaper").
      const cost = `$${(i.unit_cost_cents / 100).toLocaleString("en-US")}`
      const qty = i.quantity > 1 ? ` ×${i.quantity}` : ""
      return `  I${idx}: ${i.name} | category: ${i.category} | unit cost: ${cost}${qty} | current section: ${station}`
    }),
  ]
  return lines.join("\n")
}

// TIM-1746: translate the model's compact index-based arrangement back into the
// {item_id, section_id, position} shape buildReorganizeSuggestions expects. Item/section
// indices map into the same arrays formatEquipmentContext numbered. Position is inferred
// from the order items appear within each section (the model lists them in target order), so
// the model never has to emit position integers — fewer tokens, fewer ways to get it wrong.
function mapIndexedArrangement(
  raw: { item: number; section: number | null }[],
  items: EquipmentItemCtx[],
  sections: SectionCtx[],
): { item_id: string; section_id: string | null; position: number }[] {
  const out: { item_id: string; section_id: string | null; position: number }[] = []
  const posBySection = new Map<string, number>() // key: section_id or "__null__"
  for (const r of raw) {
    const item = items[r.item]
    if (!item) continue // index out of range — skip rather than corrupt the arrangement
    const section = r.section == null ? null : (sections[r.section]?.id ?? null)
    const key = section ?? "__null__"
    const position = posBySection.get(key) ?? 0
    posBySection.set(key, position + 1)
    out.push({ item_id: item.id, section_id: section, position })
  }
  return out
}

// fieldId encodes the proposed assignment so onApply can act on it without parsing free-text.
// Format: "equipment-item:{item_id}:{section_id|null}:{position}"
// UUIDs contain only hyphens, not colons, so split(":") gives exactly 4 segments.
function buildReorganizeSuggestions(
  proposed: { item_id: string; section_id: string | null; position: number }[],
  items: EquipmentItemCtx[],
  sections: SectionCtx[],
): SuggestionPayload[] {
  const itemMap = new Map(items.map((i) => [i.id, i]))
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const suggestions: SuggestionPayload[] = []

  for (const p of proposed) {
    const item = itemMap.get(p.item_id)
    if (!item) continue
    if (item.section_id === p.section_id && item.position === p.position) continue

    const oldStation = item.section_id
      ? (sectionMap.get(item.section_id)?.name ?? "Unsectioned")
      : "Unsectioned"
    const newStation = p.section_id
      ? (sectionMap.get(p.section_id)?.name ?? "Unknown station")
      : "Unsectioned"

    suggestions.push({
      id: `eq-reorg-${item.id}`,
      fieldId: `equipment-item:${item.id}:${p.section_id ?? "null"}:${p.position}`,
      fieldLabel: item.name,
      originalValue: `${oldStation} · Position ${item.position + 1}`,
      proposedValue: `${newStation} · Position ${p.position + 1}`,
      isStructured: false,
    })
  }

  return suggestions
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// TIM-1638: heuristic to detect whether the user's message is about opening
// timeline or launch date — triggers the cross-plan inconsistency modal.
function isTimelineQuestion(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  return /\b(open(ing)?|launch(ing)?|timeline|when.{0,20}(open|start|launch)|target date|how (long|soon)|schedule)\b/i.test(lastUser)
}

// TIM-1638: also takes targetLaunchDate (authoritative, from opening_month_plan)
// so Scout answers timeline questions from the plan, not the stale onboarding field.
function buildDynamicPrompt(
  onboarding: Record<string, unknown>,
  planSnapshot: string,
  // TIM-1149: null = general (workspace-less) conversation.
  currentWorkspace: WorkspaceKey | null,
  locationCountry: string | null,
  targetLaunchDate: string | null,
): string {
  const shopType = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified")

  const workspaceLine = currentWorkspace
    ? `The user is working in: **${currentWorkspace.replace(/_/g, " ")}**`
    : `The user is in a **general** conversation, not bound to any specific workspace. Help them across the whole plan as needed.`

  // TIM-1638: surface the authoritative opening date prominently. The onboarding
  // "timeline" field is a stale categorical estimate from signup; the plan date is
  // what the user set in their Launch Plan and should always be preferred.
  const authoritativeDateLine = targetLaunchDate
    ? `**Target Opening Date (authoritative, from Launch Plan)**: ${targetLaunchDate}`
    : `**Target Opening Date (authoritative, from Launch Plan)**: not set — if the owner asks about their opening timeline, tell them to set it in their Launch Plan`

  return `## User Profile
- **Budget**: ${String(onboarding?.budget ?? "not specified")}
- **Location**: ${locationCountry ?? "not specified"}
- **Stage**: ${String(onboarding?.stage ?? "not specified")}
- **Motivation**: ${String(onboarding?.motivation ?? "not specified")}
- **Coffee experience**: ${String(onboarding?.coffee_experience ?? "not specified")}
- **Timeline (initial estimate from signup — may be stale)**: ${String(onboarding?.timeline ?? "not specified")}
- ${authoritativeDateLine}
- **Shop type**: ${shopType}

## Authoritative Data Rule
When asked about the opening timeline, target launch date, or when the shop will open:
- Use ONLY the "Target Opening Date" above — it is set by the owner in their Launch Plan.
- Do NOT answer from the stale "Timeline (initial estimate)" field.
- If the Target Opening Date conflicts with anything else in their plan, flag it clearly and recommend they reconcile it.

## Current Workspace
${workspaceLine}

## Their Plan So Far (all workspaces)
${planSnapshot}`
}

// ── propose_item tool (TIM-1648) ─────────────────────────────────────────────
// Offered on sonnet when the user's message contains explicit creation intent.
// Haiku-4-5 tool use is unreliable; model is forced to sonnet when this tool is registered.

const PROPOSE_ITEM_TOOL: Anthropic.Tool = {
  name: "propose_item",
  description:
    "Propose a new menu item (e.g. a beverage with a recipe) to add to the owner's " +
    "Menu & Pricing workspace. Call this ONLY when the owner explicitly asks you to " +
    "design, create, or add a specific item (e.g. 'design a lavender latte and add it " +
    "to my menu'). Do NOT call this for general discussion. After calling this tool, " +
    "summarise what you proposed in your text response.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Item name in Title Case (e.g. 'Honey Lavender Latte').",
      },
      category_name: {
        type: "string",
        description:
          "Menu category to place this in. Match an existing category " +
          "(e.g. 'Espresso', 'Brewed Coffee', 'Seasonal', 'Food', 'Retail'). " +
          "If none fits, choose the closest or use 'Seasonal'.",
      },
      description: {
        type: "string",
        description: "One-sentence description for the owner's internal notes.",
      },
      price_cents: {
        type: "number",
        description: "Suggested retail price in cents (e.g. 550 for $5.50).",
      },
      recipe_ingredients: {
        type: "array",
        description: "Ingredients used to make one serving.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Ingredient name in Title Case" },
            amount: { type: "number", description: "Amount per serving" },
            unit: {
              type: "string",
              enum: ["g", "ml", "oz", "each", "piece"],
              description: "Unit of measurement",
            },
          },
          required: ["name", "amount", "unit"],
        },
      },
      rationale: {
        type: "string",
        description: "One sentence explaining why this item fits their concept.",
      },
    },
    required: ["name", "category_name"],
  },
}

function shouldOfferProposeTool(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  // TIM-1714: "to my menu" / "to their menu" etc. broke the old regex which only handled
  // optional "the". Split into two independent patterns to avoid fragile phrase structure.
  // Apply intent: verb + any article/possessive + destination word anywhere in the message.
  const addToMenu = /\b(add|apply|put|save|insert|include|move)\b.{0,120}\b(menu|ingredients?)\b/i.test(lastUser)
  // Design/create intent: verb + item type anywhere in the message.
  const designItem = /\b(add|create|design|propose|make|build)\b.{0,80}\b(latte|espresso|cappuccino|cold brew|pour over|americano|macchiato|mocha|cortado|drink|beverage|item)\b/i.test(lastUser)
  return addToMenu || designItem
}

// ── propose_equipment_change tool (TIM-1798) ──────────────────────────────────
// Offered in the buildout_equipment workspace when the owner expresses intent to
// change an equipment cost or add equipment. Forces sonnet (haiku tool use is
// unreliable). Emits a coordinated cross-workspace proposal (equipment item +
// derived Financials line + startup-cost total) into the unified review modal.

const PROPOSE_EQUIPMENT_CHANGE_TOOL: Anthropic.Tool = {
  name: "propose_equipment_change",
  description:
    "Propose a coordinated change to an equipment item's cost that spans the " +
    "Equipment & Supplies and Financials workspaces. Call this when the owner asks " +
    "to set/raise/lower an equipment item's cost, or to add a new piece of equipment " +
    "with a cost — including when they also ask to update the Financials or startup " +
    "costs to match. The equipment unit cost is the single source of truth; the " +
    "Financials equipment line and startup-cost total are derived from it. Do NOT " +
    "call this for general discussion or for reordering the list (use " +
    "reorganize_equipment_list for ordering).",
  input_schema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["reprice", "add"],
        description: "'reprice' to change an existing item's unit cost; 'add' for a new item.",
      },
      item: {
        type: ["integer", "null"],
        description:
          "reprice only: the item number from the Equipment List (the I# value, e.g. 0 for I0). Null for 'add'.",
      },
      name: {
        type: "string",
        description:
          "Item name in Title Case. For reprice, the existing item's name; for add, the new item's name.",
      },
      category: {
        type: ["string", "null"],
        description:
          "add only: equipment category (e.g. 'Espresso', 'Grinder', 'Refrigeration', 'Furniture'). Null for reprice.",
      },
      quantity: {
        type: "integer",
        description: "Quantity for this item (default 1).",
      },
      unit_cost_cents: {
        type: "integer",
        description: "The proposed unit cost in cents (e.g. 1100000 for $11,000.00).",
      },
      rationale: {
        type: "string",
        description: "One sentence explaining the change.",
      },
    },
    required: ["action", "name", "unit_cost_cents"],
  },
}

// Offer the cost-change tool when the owner expresses cost-change / add-equipment
// intent. Kept deliberately broad on the cost side because the flagship case is a
// cross-suite ask ("...and update my financials"); the model still only calls the
// tool when the request is genuinely about an equipment cost.
function shouldOfferEquipmentChangeTool(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  // Intent detection is the pure, unit-tested isEquipmentCostChangeIntent (a prior
  // fragile inline regex silently dropped "reprice ... to $11,000" on prod).
  return isEquipmentCostChangeIntent(lastUser)
}

// TIM-1670: detect questions that need real web research (competitors, local market,
// suppliers, current prices/benchmarks) so we (a) route to the stronger model and
// (b) lengthen the no-data watchdog while web_search runs server-side.
function isResearchQuestion(messages: Array<{ role: string; content: string }>): boolean {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  // NOTE: plurals matter — "who are my competitors" is the single most common phrasing.
  // An earlier version used `competitor\b`, which failed on the trailing "s" and left
  // research turns on haiku with no search tool (the model then fabricated tool calls).
  return /\b(competitors?|competition|competitive|market (research|analysis|landscape|study)|who else|other (coffee )?(shops?|cafes?|roasters?)|(coffee )?(shops?|cafes?|roasters?) (near|around|in)|local (market|roaster|supplier|vendor|competition)|near ?by|in my area|around (me|here)|near me|going rate|market rate|benchmark|average (price|rent|wage|salary))\b/i.test(
    lastUser,
  )
}

// TIM-1670: the location_lease workspace_document is usually empty because real sites
// live in the location_candidates table, which composePlanSnapshot never reads. Surface
// the owner's actual site(s) so Scout grounds competitor research in a precise place.
interface LocationCandidateCtx {
  name: string
  address: string | null
  neighborhood: string | null
  status: string | null
}

function buildLocalMarketContext(
  candidates: LocationCandidateCtx[],
  locationCountry: string | null,
  shopType: string,
  targetCustomer: string,
  // TIM-1670: free-text location captured at signup (e.g. "Portland, OR"). Used as a
  // grounding fallback when no formal site candidate exists — most plans never add one.
  onboardingLocation: string | null,
): string {
  const lines: string[] = ["\n\n## Local Market Context (for web research grounding)"]
  if (candidates.length === 0) {
    if (onboardingLocation) {
      lines.push(
        `No formal site is shortlisted yet, but the owner's target area (from signup) is: **${onboardingLocation}**. Use this as the location for competitor/market research. If you need a tighter trade area, ask which neighborhood — but research this area first rather than refusing.`,
      )
    } else if (locationCountry) {
      lines.push(
        `No specific site is on the plan yet. Country: ${locationCountry}. If the owner asks for competitor/market research, first ask for their target city or neighborhood — a country alone is too broad to find direct competitors.`,
      )
    } else {
      lines.push(
        `No location is set on the plan yet. If the owner asks for competitor/market research, ask for their target city or neighborhood first — you cannot find direct competitors without it.`,
      )
    }
  } else {
    lines.push("Research competitors and the local market around these actual site(s) from the owner's plan:")
    for (const c of candidates) {
      const where = [c.neighborhood, c.address].filter(Boolean).join(", ")
      const status = c.status === "signed" ? " (signed lease)" : ""
      lines.push(`- ${c.name}${status}${where ? ` — ${where}` : ""}`)
    }
    if (locationCountry) lines.push(`Country: ${locationCountry}`)
  }
  lines.push(`Segment: ${shopType}. Target customer: ${targetCustomer || "not specified"}.`)
  lines.push(
    "When researching competitors, use these locations and this segment verbatim — do not substitute a generic or guessed location.",
  )
  return lines.join("\n")
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(sse("error", { code: "unauthorized", message: "Authentication required." }), {
      status: 401,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let planId: string
  // TIM-1149: workspaceKey may be null for general (workspace-less) conversations.
  let workspaceKey: WorkspaceKey | null
  let threadId: string | undefined
  let messages: Array<{ role: "user" | "assistant"; content: string }>

  try {
    const body = await request.json()
    planId = body.planId
    workspaceKey = body.workspaceKey ?? null
    threadId = body.threadId
    messages = body.messages
  } catch {
    return new Response(sse("error", { code: "bad_request", message: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  if (!planId || !messages?.length) {
    return new Response(
      sse("error", { code: "bad_request", message: "Missing required fields: planId, messages." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Credit/billing gate ──────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("users")
    .select("ai_credits_remaining, subscription_tier, subscription_status, paused_from_tier, onboarding_data, beta_waiver_until, trial_ends_at")
    .eq("id", user.id)
    .single()

  if (!profile) {
    return new Response(sse("error", { code: "quota", message: "Profile not found." }), {
      status: 404,
      headers: { "Content-Type": "text/event-stream" },
    })
  }

  // Map subscription_status to a paywall reason clients can use to pick the right modal variant.
  function paywallReason(status: string): "no_subscription" | "paused" | "expired" {
    if (status === "cancelled") return "paused"
    if (status === "expired") return "expired"
    return "no_subscription"
  }

  // TIM-925: Beta waiver — bypass all paywall/credit gates for the beta window.
  const isWaived = isBetaWaived(profile.beta_waiver_until)

  // TIM-1902: free_trial is now a card-on-file 7-day Stripe trial. Trialists
  // are gated on ai_credits_remaining just like paid users (75-credit grant
  // up front). If the trial window has expired but Stripe hasn't yet auto-
  // charged (subscription.updated still pending), block with the expired
  // paywall message so the user is funneled into the billing portal.
  const isTrial = profile.subscription_status === "free_trial"
  const isActive = isSubscriptionActive(profile.subscription_status)
  const trialWindowOpen = isTrial && isTrialActive(profile.trial_ends_at)

  if (!isWaived && isTrial && !trialWindowOpen) {
    return new Response(
      sse("error", { code: "paywall", reason: "expired", tier_required: "starter" }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  } else if (!isWaived && !isActive && !isTrial) {
    // Cancelled or expired subscriptions: paywall without trial messaging.
    return new Response(
      sse("error", { code: "paywall", reason: paywallReason(profile.subscription_status), tier_required: "starter" }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  } else if (!isWaived && !isTrial && profile.subscription_tier === "free") {
    // Active status but free tier — shouldn't normally occur; gate for safety.
    return new Response(
      sse("error", {
        code: "quota",
        message: `${COPILOT_NAME} requires a Starter or Pro plan. Upgrade to start coaching.`,
      }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // Beta-waived accounts skip credit deduction. All paid tiers have a defined monthly cap.
  const isUnlimited = isWaived

  if (!isUnlimited && (isTrial || profile.subscription_tier !== "free") && profile.ai_credits_remaining < 1) {
    // TIM-1902: trialists who burn their 75 credits hit out_of_credits the
    // same way Starter / Pro users do — Buy-more-credits is the escape valve.
    const tier = profile.subscription_tier as string
    const upgradeHint = isTrial
      ? "Top up credits or upgrade to keep planning during your trial."
      : tier === "starter"
        ? "Upgrade to Pro for more monthly credits, or your credits reset next month."
        : "Your credits reset at the start of next month."
    return new Response(
      // TIM-1687: distinct code so the client can offer Buy-more-credits alongside Upgrade.
      sse("error", {
        code: "out_of_credits",
        message: `You're out of Copilot credits for this month. ${upgradeHint}`,
      }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // ── Build prompt ────────────────────────────────────────────────────────────
  const svcClient = createServiceClient()
  const onboarding = (profile.onboarding_data as Record<string, unknown>) ?? {}

  // TIM-1418: Location is read live from plan_hiring_settings + location_candidates
  // instead of the frozen onboarding snapshot. Other onboarding fields here
  // (budget, stage, motivation, coffee_experience, timeline, shop_type) have no
  // live workspace equivalent and stay on onboarding_data.
  const [snapshotResult, planContext, locationsResult] = await Promise.all([
    composePlanSnapshot(planId, workspaceKey, svcClient),
    loadPlanContext(svcClient, user.id),
    // TIM-1670: real sites live here, not in the location_lease workspace_document.
    svcClient
      .from("location_candidates")
      .select("name, address, neighborhood, status")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position", { ascending: true }),
  ])
  const { snapshot: planSnapshot, targetLaunchDate } = snapshotResult

  // TIM-1638: detect timeline mismatch between the authoritative plan date and
  // the stale onboarding estimate. Emit the inconsistency suggestion only when
  // the user's message is about opening timeline — avoids noise on every turn.
  const onboardingTimeline = String(onboarding?.timeline ?? "").trim()
  const hasMismatch =
    !!targetLaunchDate &&
    !!onboardingTimeline &&
    onboardingTimeline !== "not specified" &&
    onboardingTimeline !== "" &&
    isTimelineQuestion(messages)

  // ── Equipment reorganize context (TIM-1637) ───────────────────────────────────
  // Fetch current equipment items + sections when in the buildout_equipment workspace
  // so Scout can emit a reorganize_equipment_list tool call with valid item/section UUIDs.
  let equipmentItems: EquipmentItemCtx[] = []
  let equipmentSections: SectionCtx[] = []
  if (workspaceKey === "buildout_equipment") {
    const [eqResult, secResult] = await Promise.all([
      svcClient
        .from("buildout_equipment_items")
        .select("id, name, section_id, position, category, unit_cost_cents, quantity")
        .eq("plan_id", planId)
        .eq("archived", false)
        .order("position"),
      svcClient
        .from("buildout_list_sections")
        .select("id, name, position")
        .eq("plan_id", planId)
        .eq("list_type", "equipment")
        .order("position"),
    ])
    equipmentItems = (eqResult.data ?? []) as EquipmentItemCtx[]
    equipmentSections = (secResult.data ?? []) as SectionCtx[]
  }

  const equipmentContextAddendum =
    workspaceKey === "buildout_equipment" && equipmentItems.length > 0
      ? `\n\n## Equipment List — Current Arrangement\nEach item and section below has a short number (I# / S#). The \`reorganize_equipment_list\` tool takes those numbers — pass the item number as \`item\` and the target section number as \`section\` (or null). Do NOT emit UUIDs.\n\n${formatEquipmentContext(equipmentItems, equipmentSections)}\n\n**Actions available:**\n- \`reorganize_equipment_list\` — call it ONLY when the user explicitly asks to reorganize, sort, reorder, or rearrange the equipment list. Never call it proactively. When you do call it, first send a brief text message explaining your grouping approach, then call the tool with all items in their proposed arrangement.\n- \`propose_equipment_change\` — call it when the user asks to change an item's cost or add a new item (pass the I# for a reprice). It updates the Financials equipment line and startup-cost total in the same reviewed proposal.`
      : ""

  // TIM-1670: ground competitor/market research in the owner's actual site(s) + segment.
  const shopTypeForCtx = Array.isArray(onboarding?.shop_type)
    ? (onboarding.shop_type as string[]).join(", ")
    : String(onboarding?.shop_type ?? "not specified")
  const onboardingLocation = String(onboarding?.location ?? "").trim() || null
  const localMarketAddendum = buildLocalMarketContext(
    (locationsResult.data ?? []) as LocationCandidateCtx[],
    planContext.location_country,
    shopTypeForCtx,
    planContext.target_customer,
    onboardingLocation,
  )

  const dynamicPrompt =
    buildDynamicPrompt(onboarding, planSnapshot, workspaceKey, planContext.location_country, targetLaunchDate) +
    localMarketAddendum +
    equipmentContextAddendum

  // ── Model routing ────────────────────────────────────────────────────────────
  // TIM-1897: board directive (Trent on TIM-1555) — ALL platform AI runs on Claude
  // Haiku, no Sonnet routing. The single model constant lives in src/lib/ai/models.ts.
  // What used to flip to Sonnet (large snapshots, 3+ workspace mentions, research,
  // propose_item tool) now stays on Haiku. Two carry-over effects of that switch:
  //   • Extended thinking is OFF — Haiku 4.5 does not support it (a `thinking` param
  //     would 400). Removed below.
  //   • Credit/cost metering is always the Haiku "default" tier (see cost block).
  // Research depth (TIM-1670) and propose_item tool reliability (TIM-1648) were the
  // original reasons for Sonnet; both are flagged to Trent on TIM-1897 as a quality
  // re-check, but the directive is Haiku-everywhere.
  const isResearch = isResearchQuestion(messages)
  // TIM-1955: "Deeper insights" (web-search-backed research) is a Pro feature.
  // Trialists are Pro per effectivePlanForGating (TIM-1902); beta-waived
  // accounts bypass the gate to keep internal testing seamless. When intent
  // is research but the gate fails, we strip the tool + directive and emit a
  // single in-stream notice — chat keeps working, just without live web
  // research. No 402.
  const tier = effectivePlanForGating(profile)
  const researchGateBypass = isBetaWaived(profile.beta_waiver_until)
  const isResearchAllowed = isResearch && (tier === "pro" || researchGateBypass)
  const researchBlocked = isResearch && !isResearchAllowed
  const offerProposeItemTool = shouldOfferProposeTool(messages)
  // TIM-1798: cross-workspace cost-change tool — only in the equipment workspace
  // with items present (it references items by their I# index) and on cost-change
  // intent. Per TIM-1897 (Haiku everywhere) this does NOT switch models; the tool
  // runs on the platform model like propose_item. Directive presence ⟺ tool presence.
  const offerEquipmentChangeTool =
    workspaceKey === "buildout_equipment" &&
    equipmentItems.length > 0 &&
    shouldOfferEquipmentChangeTool(messages)
  // TIM-1897: board directive — all platform AI runs on Claude Haiku, no Sonnet routing.
  const modelId = PLATFORM_AI_MODEL

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const body = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      let closed = false
      let firstToken = false
      let fullText = ""
      let inputTokens = 0
      let outputTokens = 0
      let cacheReadTokens = 0
      let cacheCreateTokens = 0
      let webSearchRequests = 0 // TIM-1670: billed at $10 / 1000 searches
      let toolCallCount = 0 // TIM-1671: discrete tool actions taken this turn (credit cost input)

      let heartbeatTimer: ReturnType<typeof setInterval> | null = null
      let ttftTimer: ReturnType<typeof setTimeout> | null = null
      let gapTimer: ReturnType<typeof setTimeout> | null = null

      // TIM-1637: track in-flight tool_use block for reorganize_equipment_list.
      let activeToolName: string | null = null
      let toolInputBuffer = ""

      const clearTimers = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        if (ttftTimer) clearTimeout(ttftTimer)
        if (gapTimer) clearTimeout(gapTimer)
      }

      const logError = async (code: string, message: string, upstreamStatus?: number) => {
        await svcClient.from("ai_errors").insert({
          user_id: user.id,
          workspace_key: workspaceKey,
          error_code: code,
          upstream_status: upstreamStatus ?? null,
          details: { message, modelId, planId },
        })
      }

      const closeWithError = async (code: string, message: string, upstreamStatus?: number) => {
        if (closed) return
        closed = true
        clearTimers()
        send(sse("error", { code, message }))
        await logError(code, message, upstreamStatus)
        send(sse("done", {}))
        controller.close()
      }

      const resetGapTimer = () => {
        if (gapTimer) clearTimeout(gapTimer)
        // Wider window while a tool call is streaming its input (activeToolName set): large
        // tool-input arrays can stall >20s between chunks without being a genuine failure.
        const windowMs = activeToolName ? TOOL_GAP_MS : GAP_MS
        gapTimer = setTimeout(() => {
          closeWithError(
            "timeout",
            `AI stream stalled. No data for ${Math.round(windowMs / 1000)} seconds. Please try again.`,
          )
        }, windowMs)
      }

      heartbeatTimer = setInterval(() => {
        if (!closed) send(`: ping\n\n`)
      }, HEARTBEAT_MS)

      ttftTimer = setTimeout(() => {
        if (!firstToken) {
          closeWithError("timeout", "No response from AI within 8 seconds. Please try again.")
        }
      }, TTFT_MS)

      try {
        // TIM-1955: research-intent turn from a Starter — emit a one-line
        // in-stream notice before any model output so the user sees the gate
        // immediately. The web_search tool and research directive are already
        // stripped above, so the model answers from priors. Counts as the
        // first token so the TTFT watchdog (8s) does not race a slow Haiku
        // cold-start that follows.
        if (researchBlocked) {
          const notice =
            "Deeper market research with live web sources is a Pro feature — [Upgrade](/pricing?ref=scout-research). For now I'm answering from what I already know.\n\n"
          fullText += notice
          send(sse("text", { delta: notice }))
          firstToken = true
          if (ttftTimer) clearTimeout(ttftTimer)
          resetGapTimer()
        }

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

        // System prompt cached as a single prefix. The cache breakpoint must sit on the
        // LAST system block so the cached prefix covers identity + style + the plan
        // snapshot (~2–7K tokens). The stable block alone is ~424 tokens — below the
        // 1024-token minimum cacheable prefix for Sonnet/Opus, so a breakpoint there
        // caches nothing (TIM-1263). The dynamic block is identical across turns within a
        // conversation unless the plan is edited, so turns 2+ hit the cache; an edit just
        // forces one fresh write at the same cost as no caching — strictly net-positive.
        const systemBlocks: Array<Anthropic.TextBlockParam & { cache_control?: Anthropic.CacheControlEphemeral }> = [
          {
            type: "text",
            // TIM-1670: research directive injected ONLY when isResearch (tool also registered).
            // TIM-1714: propose_item directive injected ONLY when offerProposeItemTool (tool also
            // registered). Directive presence ⟺ tool presence — never claim a tool we didn't pass.
            text: [
              STABLE_IDENTITY,
              STABLE_COACHING_STYLE,
              isResearchAllowed ? RESEARCH_DIRECTIVE : null,
              offerProposeItemTool ? PROPOSE_ITEM_DIRECTIVE : null,
              offerEquipmentChangeTool ? EQUIPMENT_CHANGE_DIRECTIVE : null,
            ].filter(Boolean).join("\n\n"),
          },
          {
            type: "text",
            text: dynamicPrompt,
            cache_control: { type: "ephemeral" },
          },
        ]

        const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        // TIM-1637: equipment reorganize tool — only registered when items exist.
        const equipmentTool: Anthropic.Tool | null =
          workspaceKey === "buildout_equipment" && equipmentItems.length > 0
            ? {
                name: "reorganize_equipment_list",
                description:
                  "Propose a new arrangement of equipment items across workstation sections. Only call this when the user explicitly asks to reorganize, sort, reorder, or rearrange the equipment list. Include ALL items in the output, even those not moving — this is a complete ordering.",
                input_schema: {
                  type: "object" as const,
                  properties: {
                    rationale: {
                      type: "string",
                      description: "1–2 sentences explaining the reorganization logic.",
                    },
                    items: {
                      type: "array",
                      description:
                        "Complete proposed arrangement — include every item exactly once, listed in the order it should appear within its section (the first item listed for a section is position 0, the next is position 1, and so on).",
                      items: {
                        type: "object",
                        properties: {
                          item: {
                            type: "integer",
                            description:
                              "Item number from the equipment list (the I# value, e.g. 0 for I0).",
                          },
                          section: {
                            type: ["integer", "null"],
                            description:
                              "Section number to place this item in (the S# value, e.g. 1 for S1), or null for unsectioned.",
                          },
                        },
                        required: ["item", "section"],
                      },
                    },
                  },
                  required: ["rationale", "items"],
                },
              }
            : null

        // TIM-1670: Anthropic-hosted web search for real multi-source research.
        // Registered ONLY on research-classified turns (competitors/local market/benchmarks),
        // not every turn — this bounds blast radius: if web search is ever disabled at the
        // org level (a 400 on any request that includes the tool), only research turns are
        // affected and normal chat keeps working. max_uses bounds cost ($10/1k searches) and
        // keeps multi-search research inside the function budget.
        const webSearchTool: Anthropic.WebSearchTool20250305 = {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
        }

        const tools: Anthropic.ToolUnion[] = [
          ...(isResearchAllowed ? [webSearchTool] : []),
          ...(equipmentTool ? [equipmentTool] : []),
          // TIM-1648: propose_item — offered on creation-intent messages. (TIM-1897: runs
          // on Haiku like everything else; tool-use reliability flagged to Trent.)
          ...(offerProposeItemTool ? [PROPOSE_ITEM_TOOL] : []),
          // TIM-1798: propose_equipment_change — coordinated cross-workspace cost change.
          ...(offerEquipmentChangeTool ? [PROPOSE_EQUIPMENT_CHANGE_TOOL] : []),
        ]

        // TIM-1798: on Haiku 4.5 (TIM-1897, platform model) tool_choice:auto does NOT
        // reliably call the tool — verified 0/5 fires on prod, so the cross-workspace
        // proposal never appeared. The owner's message already passed the deterministic
        // equipment cost/add intent gate (shouldOfferEquipmentChangeTool), so forcing
        // the tool is correct: it guarantees the proposal is produced for review.
        // Nothing auto-applies (the modal still gates every write), so a forced call is
        // safe. Force only when the equipment tool is the unambiguous action this turn
        // (not a research turn, where web_search must stay available under auto).
        const toolChoice: Anthropic.ToolChoice =
          offerEquipmentChangeTool && !isResearch
            ? { type: "tool", name: "propose_equipment_change" }
            : { type: "auto" }

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 16_000,
          // TIM-1897: no `thinking` — the platform runs on Haiku 4.5, which does not
          // support extended thinking (passing the param is a 400).
          system: systemBlocks as Anthropic.TextBlockParam[],
          messages: anthropicMessages,
          // Only send tools/tool_choice when at least one tool applies — an empty tools
          // array with tool_choice is rejected by the API.
          ...(tools.length > 0 ? { tools, tool_choice: toolChoice } : {}),
        })

        for await (const event of stream) {
          if (closed) break

          // TIM-1637: track tool_use block start/stop for equipment reorganization.
          if (event.type === "content_block_start") {
            const block = event.content_block
            if (block.type === "tool_use") {
              activeToolName = block.name
              toolInputBuffer = ""
              toolCallCount += 1 // TIM-1671: each tool action adds to the credit charge
              // TIM-1746: a tool call (e.g. reorganize_equipment_list) streams its input as
              // input_json_delta chunks with no text/thinking deltas. Treat the tool-block
              // start as live activity so neither the 8s TTFT nor the 20s gap watchdog kills a
              // legit long generation (a full equipment-to-stations arrangement is a large
              // JSON array that can take >20s to emit). The input_json_delta handler below
              // keeps the gap timer fed for the duration of the tool input.
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              // Let the client show an "organizing" affordance while the tool input streams.
              send(sse("status", { state: "organizing" }))
            } else if (block.type === "server_tool_use" || block.type === "web_search_tool_result") {
              // TIM-1670: web_search runs server-side BEFORE any text/thinking token.
              // Treat it as first activity so the 8s TTFT watchdog doesn't kill a legit
              // search, and reset the gap watchdog so multi-second searches don't trip it.
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              if (block.type === "server_tool_use") {
                // Let the client show a "searching the web" affordance.
                send(sse("status", { state: "searching" }))
              }
            }
          } else if (event.type === "content_block_stop") {
            if (activeToolName === "reorganize_equipment_list" && toolInputBuffer) {
              try {
                const toolInput = JSON.parse(toolInputBuffer) as {
                  rationale: string
                  items: { item: number; section: number | null }[]
                }
                const suggestions = buildReorganizeSuggestions(
                  mapIndexedArrangement(toolInput.items ?? [], equipmentItems, equipmentSections),
                  equipmentItems,
                  equipmentSections,
                )
                if (suggestions.length > 0) {
                  send(
                    sse("suggestions", {
                      suggestions,
                      context: {
                        workspace: "buildout_equipment",
                        section: toolInput.rationale,
                      },
                    }),
                  )
                }
              } catch {
                /* malformed tool JSON — skip silently */
              }
              activeToolName = null
              toolInputBuffer = ""
            } else if (activeToolName === "propose_item" && toolInputBuffer) {
              // TIM-1648: emit structured menu-item proposal for the Review modal.
              try {
                const toolInput = JSON.parse(toolInputBuffer) as {
                  name?: string
                  category_name?: string
                  description?: string
                  price_cents?: number
                  recipe_ingredients?: Array<{ name: string; amount: number; unit: string }>
                  rationale?: string
                }
                if (toolInput.name) {
                  const ingredientLines = (toolInput.recipe_ingredients ?? [])
                    .map((i) => `${i.name}: ${i.amount} ${i.unit}`)
                    .join(", ")
                  const priceDisplay = toolInput.price_cents
                    ? `$${(toolInput.price_cents / 100).toFixed(2)}`
                    : "Not set"
                  const proposedSummary = [
                    `Name: ${toolInput.name}`,
                    `Category: ${toolInput.category_name ?? ""}`,
                    `Price: ${priceDisplay}`,
                    toolInput.description ? `Description: ${toolInput.description}` : null,
                    ingredientLines ? `Ingredients: ${ingredientLines}` : null,
                    toolInput.rationale ? `Rationale: ${toolInput.rationale}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n")
                  send(sse("suggestions", {
                    suggestions: [
                      {
                        id: `propose-${crypto.randomUUID()}`,
                        fieldId: "new_menu_item",
                        fieldLabel: `New Item: ${toolInput.name}`,
                        originalValue: "",
                        proposedValue: JSON.stringify(toolInput),
                        isStructured: false,
                        _displayHint: proposedSummary,
                      },
                    ],
                    context: {
                      workspace: "menu_pricing",
                      section: toolInput.category_name ?? "Menu",
                    },
                  }))
                }
              } catch {
                /* malformed tool JSON — skip silently */
              }
              activeToolName = null
              toolInputBuffer = ""
            } else if (activeToolName === "propose_equipment_change" && toolInputBuffer) {
              // TIM-1798: build the coordinated cross-workspace proposal (equipment
              // item + derived Financials line + startup-cost total) and emit it.
              try {
                const toolInput = JSON.parse(toolInputBuffer) as {
                  action?: "reprice" | "add"
                  item?: number | null
                  name?: string
                  category?: string | null
                  quantity?: number
                  unit_cost_cents?: number
                  rationale?: string
                }
                const action = toolInput.action === "add" ? "add" : "reprice"
                const idx = typeof toolInput.item === "number" ? toolInput.item : null
                const target = idx != null ? equipmentItems[idx] : undefined
                const name = toolInput.name ?? target?.name ?? ""
                const unitCost =
                  typeof toolInput.unit_cost_cents === "number" ? toolInput.unit_cost_cents : NaN
                // Need a name and a valid cost to build a coherent proposal.
                if (name && Number.isFinite(unitCost)) {
                  const currentItems: EquipmentCostItem[] = equipmentItems.map((i) => ({
                    id: i.id,
                    name: i.name,
                    quantity: i.quantity ?? 1,
                    unit_cost_cents: i.unit_cost_cents ?? 0,
                  }))
                  const proposal = buildEquipmentCostProposal({
                    change: {
                      action,
                      item_id: target?.id ?? null,
                      name,
                      category: toolInput.category ?? null,
                      // Omit when the model didn't state one so a reprice preserves
                      // the existing item's quantity (engine resolves the default).
                      quantity: typeof toolInput.quantity === "number" ? toolInput.quantity : undefined,
                      new_unit_cost_cents: Math.round(unitCost),
                    },
                    currentItems,
                  })
                  if (proposal.suggestions.length > 0) {
                    send(sse("suggestions", {
                      suggestions: proposal.suggestions,
                      context: proposal.context,
                    }))
                  }
                }
              } catch {
                /* malformed tool JSON — skip silently */
              }
              activeToolName = null
              toolInputBuffer = ""
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "input_json_delta") {
              // TIM-1746: tool-input streaming is real activity. Reset the gap watchdog on
              // every chunk so a long tool call (full equipment-to-stations arrangement) is
              // not killed mid-generation with "Took too long". Mark firstToken in case the
              // model goes straight to a tool with no preceding text/thinking deltas.
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              toolInputBuffer += event.delta.partial_json
            } else if (event.delta.type === "thinking_delta") {
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              send(sse("thinking", { delta: event.delta.thinking }))
            } else if (event.delta.type === "text_delta") {
              if (!firstToken) {
                firstToken = true
                if (ttftTimer) clearTimeout(ttftTimer)
              }
              resetGapTimer()
              fullText += event.delta.text
              send(sse("text", { delta: event.delta.text }))
            }
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens = event.usage.output_tokens ?? 0
            // TIM-1670: server-tool usage (web searches) is reported on the final usage.
            webSearchRequests = event.usage.server_tool_use?.web_search_requests ?? webSearchRequests
          } else if (event.type === "message_start" && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens ?? 0
            cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0
            cacheCreateTokens = event.message.usage.cache_creation_input_tokens ?? 0
          }
        }

        if (!closed) {
          clearTimers()
          closed = true

          // Persist completed turn (only on clean stream close — dropped on disconnect).
          // TIM-1897: all turns run on Haiku 4.5 = $0.80/$4.00 per M (no Sonnet tier).
          // input_tokens already excludes cached tokens; cache reads bill at 0.1x and cache
          // writes at 1.25x the base input rate, so fold them in to keep cost_usd honest.
          const costPerInputM = 0.8
          const costPerOutputM = 4
          const costUsd =
            (inputTokens * costPerInputM +
              cacheReadTokens * costPerInputM * 0.1 +
              cacheCreateTokens * costPerInputM * 1.25 +
              outputTokens * costPerOutputM) /
              1_000_000 +
            // TIM-1670: web search billed at $10 per 1,000 requests.
            webSearchRequests * 0.01

          // TIM-1671: variable credit charge. Credits scale with work done this
          // turn (output volume, model tier, web research, tool actions) rather
          // than a flat 1-per-message. Cost model + launch-default pricing live
          // in src/lib/credits/cost.ts (flagged for product calibration).
          const creditBreakdown = computeCreditCost({
            // TIM-1897: Haiku-everywhere → always the "default" (Haiku) cost basis.
            modelTier: "default",
            outputTokens,
            webSearchRequests,
            toolCalls: toolCallCount,
          })
          const creditCost = creditBreakdown.credits

          const effectiveThreadId = threadId ?? crypto.randomUUID()

          const existingQuery = supabase
            .from("ai_conversations")
            .select("id, credits_used, cost_usd")
            .eq("plan_id", planId)
            .eq("thread_id", effectiveThreadId)
          const { data: existing } = await (workspaceKey === null
            ? existingQuery.is("workspace_key", null)
            : existingQuery.eq("workspace_key", workspaceKey)
          ).maybeSingle()

          // Normalize at persist-time (TIM-1365): tokens are streamed raw; normalize the assembled text before storing.
          const updatedMessages = [...messages, { role: "assistant", content: normalizeAIOutput(fullText) }]

          if (existing) {
            await supabase
              .from("ai_conversations")
              .update({
                messages: updatedMessages,
                credits_used: existing.credits_used + creditCost,
                cost_usd: (Number(existing.cost_usd) || 0) + costUsd,
                last_message_at: new Date().toISOString(),
                model_used: modelId,
              })
              .eq("id", existing.id)
          } else {
            await supabase.from("ai_conversations").insert({
              plan_id: planId,
              workspace_key: workspaceKey,
              thread_id: effectiveThreadId,
              messages: updatedMessages,
              credits_used: creditCost,
              cost_usd: costUsd,
              last_message_at: new Date().toISOString(),
              model_used: modelId,
            })
          }

          // TIM-1671: track post-turn credit balance so the chat meter can update
          // live from the `done` event. null when the account is not on the credit
          // model (beta-waived / unlimited).
          // TIM-1902: trialists are now on the credit model too — debited from
          // their 75-credit grant exactly like paid users.
          let creditsRemaining: number | null = null

          if (!isUnlimited) {
            // Floor at 0 — a single heavy turn can cost more than the remaining
            // balance; we let it finish (already streamed) but never go negative.
            creditsRemaining = Math.max(0, profile.ai_credits_remaining - creditCost)
            await supabase
              .from("users")
              .update({ ai_credits_remaining: creditsRemaining })
              .eq("id", user.id)

            await supabase.from("credit_transactions").insert({
              user_id: user.id,
              amount: -creditCost,
              type: "usage",
              description: describeCreditCharge(
                workspaceKey ?? "general",
                creditBreakdown,
                webSearchRequests,
                toolCallCount,
              ),
            })
          }

          // TIM-1638: emit a cross-plan inconsistency suggestion when the owner's
          // authoritative launch date and their stale onboarding timeline both exist
          // and the user's message is about opening timeline.
          if (hasMismatch && targetLaunchDate) {
            send(sse("suggestions", {
              suggestions: [
                {
                  id: `inconsistency-timeline-${crypto.randomUUID()}`,
                  fieldId: "timeline_mismatch",
                  fieldLabel: "Opening Timeline Mismatch",
                  originalValue: `Profile estimate (from signup): "${onboardingTimeline}"`,
                  proposedValue: `Launch Plan target date: ${targetLaunchDate}`,
                  isStructured: false,
                } satisfies SuggestionPayload,
              ],
              context: {
                workspace: "opening_month_plan",
                section: "Launch Configuration",
              },
            }))
          }

          // TIM-1902: trialRemaining is no longer a message-count — it is now
          // the ai_credits_remaining balance for trialists, which the live
          // creditsRemaining field below already carries. Kept null on the
          // done event for clients that still read it, until they migrate.
          send(sse("done", {
            threadId: effectiveThreadId,
            modelUsed: modelId,
            trialRemaining: null,
            // TIM-1671: live credit meter — what this turn cost and what's left.
            creditsSpent: creditsRemaining === null ? null : creditCost,
            creditsRemaining,
          }))
          controller.close()
        }
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "status" in err ? Number((err as { status: number }).status) : undefined
        await closeWithError("upstream_error", "AI service temporarily unavailable. Please try again.", status)
      }
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
