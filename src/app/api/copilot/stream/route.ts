// Streaming co-pilot route with thinking, model routing, and SSE.
// TIM-866: unified usage messaging — free_trial gets 5 trial messages; paid gates on ai_credits_remaining.
// SSE event names: text | thinking | suggestions | status | error | done
// TIM-1670: web_search server tool wired in so competitor/local-market queries do genuine
// multi-source research (enumerate→verify→cite) instead of answering from priors; location
// candidates surfaced for grounding; research queries route to sonnet; `status:searching` event.
// INVARIANT: the research directive is injected ONLY on isResearch turns (same gate as the
// web_search tool) — never tell the model it has a tool we didn't register, or it fabricates.
// Model routing (TIM-1272): haiku-4-5 default; sonnet-4-6 when snapshot >8000 tokens OR 3+ workspace mentions OR a research query.
// Thinking is only enabled on the sonnet tier (haiku-4-5 does not support extended thinking).
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
import { isSubscriptionActive, isBetaWaived, COPILOT_FREE_TRIAL_LIMIT } from "@/lib/access"
import { COPILOT_NAME } from "@/lib/copilot/branding"
import { normalizeAIOutput } from "@/lib/normalize"
import { computeCreditCost, describeCreditCharge } from "@/lib/credits/cost"
import { loadPlanContext } from "@/lib/plan-context"
import type { WorkspaceKey } from "@/types/supabase"
import type { NextRequest } from "next/server"

// ── Constants ────────────────────────────────────────────────────────────────

const FREE_TRIAL_COPILOT_LIMIT = 5

const WORKSPACE_KEYS: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "opening_month_plan",
  "hiring",
  "marketing",
  "suppliers",
]

const TTFT_MS = 8_000
const GAP_MS = 20_000
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

// ── Equipment reorganize types / helpers ─────────────────────────────────────

interface EquipmentItemCtx {
  id: string
  name: string
  section_id: string | null
  position: number
  category: string
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

function formatEquipmentContext(items: EquipmentItemCtx[], sections: SectionCtx[]): string {
  const sectionMap = new Map(sections.map((s) => [s.id, s]))
  const lines = [
    "Sections:",
    ...sections.map((s) => `  ${s.name} (id: ${s.id})`),
    "",
    "Items (ordered by position within their current section):",
    ...items.map((i) => {
      const station = i.section_id
        ? (sectionMap.get(i.section_id)?.name ?? "Unsectioned")
        : "Unsectioned"
      return `  - ${i.name} | category: ${i.category} | station: ${station} | section_id: ${i.section_id ?? "null"} | item_id: ${i.id} | position: ${i.position}`
    }),
  ]
  return lines.join("\n")
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

function countWorkspaceMentions(messages: Array<{ role: string; content: string }>): number {
  const lastUser = messages.filter((m) => m.role === "user").pop()?.content ?? ""
  const lower = lastUser.toLowerCase()
  return WORKSPACE_KEYS.filter(
    (k) => lower.includes(k.replace(/_/g, " ")) || lower.includes(k.replace(/_/g, "")),
  ).length
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
    .select("ai_credits_remaining, copilot_trial_messages_used, subscription_tier, subscription_status, onboarding_data, beta_waiver_until")
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

  const isTrial = profile.subscription_status === "free_trial"
  const isActive = isSubscriptionActive(profile.subscription_status)

  // Free trial: allow up to FREE_TRIAL_COPILOT_LIMIT messages before showing paywall.
  // Beta-waived accounts skip the trial gate.
  if (!isWaived && isTrial) {
    const used = profile.copilot_trial_messages_used ?? 0
    const remaining = FREE_TRIAL_COPILOT_LIMIT - used
    if (remaining <= 0) {
      return new Response(
        sse("error", {
          code: "trial_exhausted",
          message: "You've used your 5 trial messages — upgrade to keep planning with Copilot.",
          trialUsed: used,
          trialLimit: FREE_TRIAL_COPILOT_LIMIT,
        }),
        { status: 402, headers: { "Content-Type": "text/event-stream" } },
      )
    }
  } else if (!isWaived && !isActive) {
    // Cancelled or expired subscriptions: paywall without trial messaging.
    return new Response(
      sse("error", { code: "paywall", reason: paywallReason(profile.subscription_status), tier_required: "starter" }),
      { status: 402, headers: { "Content-Type": "text/event-stream" } },
    )
  } else if (!isWaived && profile.subscription_tier === "free") {
    // Active status but free tier — shouldn't normally occur; gate for safety.
    return new Response(
      sse("error", {
        code: "quota",
        message: `${COPILOT_NAME} requires a Starter, Growth, or Pro plan. Upgrade to start coaching.`,
      }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } },
    )
  }

  // Beta-waived accounts skip credit deduction. All paid tiers have a defined monthly cap.
  const isUnlimited = isWaived

  if (!isTrial && !isUnlimited && profile.subscription_tier !== "free" && profile.ai_credits_remaining < 1) {
    const tier = profile.subscription_tier as string
    const upgradeHint =
      tier === "starter"
        ? "Upgrade to Growth for more monthly credits, or your credits reset next month."
        : tier === "growth"
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
  const { snapshot: planSnapshot, estimatedTokens: snapshotTokens, targetLaunchDate } = snapshotResult

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
        .select("id, name, section_id, position, category")
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
      ? `\n\n## Equipment List — Current Arrangement\nThe exact item IDs and section IDs below are required for the \`reorganize_equipment_list\` tool. Use them verbatim.\n\n${formatEquipmentContext(equipmentItems, equipmentSections)}\n\n**Action available:** \`reorganize_equipment_list\` — call it ONLY when the user explicitly asks to reorganize, sort, reorder, or rearrange the equipment list. Never call it proactively. When you do call it, first send a brief text message explaining your grouping approach, then call the tool with all items in their proposed arrangement.`
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
  // TIM-1272: align routing with cost model (cheap → haiku, complex → sonnet).
  // "Complex" = snapshot >8000 tokens OR user mentions 3+ workspaces in one turn.
  // TIM-1670: research questions (competitors/local market) also route to sonnet —
  // they need multi-step web_search + synthesis, which haiku handles poorly.
  // Haiku 4.5 does not support extended thinking; thinking is only enabled for sonnet tier.
  // TIM-1648: also force sonnet when offering propose_item tool (haiku tool use is unreliable).
  const workspaceMentions = countWorkspaceMentions(messages)
  const isResearch = isResearchQuestion(messages)
  const offerProposeItemTool = shouldOfferProposeTool(messages)
  const useComplexModel = snapshotTokens > 8_000 || workspaceMentions >= 3 || isResearch
  const modelId = (useComplexModel || offerProposeItemTool) ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001"

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
        gapTimer = setTimeout(() => {
          closeWithError("timeout", "AI stream stalled. No data for 20 seconds. Please try again.")
        }, GAP_MS)
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
              isResearch ? RESEARCH_DIRECTIVE : null,
              offerProposeItemTool ? PROPOSE_ITEM_DIRECTIVE : null,
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
                        "Complete proposed arrangement. Position is 0-based within each section.",
                      items: {
                        type: "object",
                        properties: {
                          item_id: {
                            type: "string",
                            description: "Equipment item UUID — verbatim from the equipment list.",
                          },
                          section_id: {
                            type: ["string", "null"],
                            description: "Section UUID, or null for unsectioned.",
                          },
                          position: {
                            type: "integer",
                            description: "0-based position within the section.",
                          },
                        },
                        required: ["item_id", "section_id", "position"],
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
          ...(isResearch ? [webSearchTool] : []),
          ...(equipmentTool ? [equipmentTool] : []),
          // TIM-1648: propose_item — offered on creation-intent messages (forces sonnet).
          ...(offerProposeItemTool ? [PROPOSE_ITEM_TOOL] : []),
        ]

        const stream = anthropic.messages.stream({
          model: modelId,
          max_tokens: 16_000,
          // Extended thinking only available on sonnet and above (haiku-4-5 does not support it).
          ...(useComplexModel ? { thinking: { type: "enabled", budget_tokens: 4_000 } } : {}),
          system: systemBlocks as Anthropic.TextBlockParam[],
          messages: anthropicMessages,
          // Only send tools/tool_choice when at least one tool applies — an empty tools
          // array with tool_choice is rejected by the API.
          ...(tools.length > 0 ? { tools, tool_choice: { type: "auto" as const } } : {}),
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
                  items: { item_id: string; section_id: string | null; position: number }[]
                }
                const suggestions = buildReorganizeSuggestions(
                  toolInput.items ?? [],
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
          // TIM-1272: haiku-4-5 = $0.80/$4.00 per M; sonnet-4-6 = $3/$15 per M.
          // input_tokens already excludes cached tokens; cache reads bill at 0.1x and cache
          // writes at 1.25x the base input rate, so fold them in to keep cost_usd honest.
          const costPerInputM = useComplexModel ? 3 : 0.8
          const costPerOutputM = useComplexModel ? 15 : 4
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
            modelTier: useComplexModel ? "complex" : "default",
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
          // model (trial / beta-waived / unlimited).
          let creditsRemaining: number | null = null

          if (isTrial && !isWaived) {
            await supabase
              .from("users")
              .update({ copilot_trial_messages_used: (profile.copilot_trial_messages_used ?? 0) + 1 })
              .eq("id", user.id)
          } else if (!isUnlimited) {
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

          const trialRemaining = (isTrial && !isWaived)
            ? FREE_TRIAL_COPILOT_LIMIT - ((profile.copilot_trial_messages_used ?? 0) + 1)
            : null

          send(sse("done", {
            threadId: effectiveThreadId,
            modelUsed: modelId,
            trialRemaining,
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
