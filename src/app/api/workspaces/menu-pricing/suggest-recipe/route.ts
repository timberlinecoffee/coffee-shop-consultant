// TIM-1321: AI recipe starting points. Given a menu item name, propose a
// standard recipe and pre-populate the item's ingredient rows — reusing
// existing library ingredients by name (Title Case, TIM-1002) and creating the
// rest with a sensible default the user can price. Reuses the AI integration
// pattern from the TIM-1020 price suggestion.
//
// TIM-3862: Enhanced prompt + server-side guard:
//  (a) Injects user's inventory list so the model references real item names.
//  (b) References existing recipe lines as canonical inventory-linked items.
//  (c) Full COGS output required — beverage ingredients + supply/packaging.
//  (d) Two-group tagging ('ingredient' | 'supply') — field optional until
//      TIM-3861 (recipe section restructure) lands. Included in prompt now.
//
// Server-side guard: applyLinkedItemGuard() rejects any 'replace' action
// targeting an inventory-linked ingredient before it reaches the review panel.
// Rule 4: enforceRateLimit() with 10 RPM per user (~$0.01-0.03/call, per-user
//          spend cap delivered via that ceiling).
// Rule 3: parseRecipeResponse validates AI response shape before returning.
// Rule 5: no raw upstream errors reach the browser.
import { runScoutTurn } from "@/lib/ai/scout-adapter"
import { createClient } from "@/lib/supabase/server"
import { getActivePlanId } from "@/lib/plan-context"
import { isSubscriptionActive, isBetaWaived } from "@/lib/access"
import { enforceRateLimit } from "@/lib/rate-limit"
import { parseRecipeResponse, applyLinkedItemGuard } from "@/lib/recipe-suggest"

export const runtime = "nodejs"
export const maxDuration = 30

const ROUTE_PATH = "/api/workspaces/menu-pricing/suggest-recipe"

// Max inventory rows injected into prompt to bound token use.
// At ~80 chars/row ≈ 20 tokens, 60 rows ≈ 1 200 prompt tokens — well within budget.
const MAX_INVENTORY_ROWS = 60

// Strip characters that could inject prompt instructions through user-controlled
// inventory names. Newlines are the primary injection vector; vertical bar is the
// field separator we use in the prompt table rows (Fix: TIM-3862 code-review finding 2).
function sanitizeForPrompt(s: string): string {
  return s.replace(/[\r\n\t|]/g, " ").slice(0, 120).trim()
}

interface ConceptContext {
  shop_identity?: string
  location?: string
  target_customer?: string
  vision?: string
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // Rule 4: rate-limit a paid-API route. 10 req/min per user.
  const rateLimited = await enforceRateLimit({
    bucket: "menu:suggest-recipe",
    id: user.id,
    limit: 10,
    windowSec: 60,
  })
  if (rateLimited) return rateLimited

  const { data: profile } = await supabase
    .from("users")
    .select("subscription_status, beta_waiver_until")
    .eq("id", user.id)
    .single()

  if (
    !profile ||
    (!isSubscriptionActive(profile.subscription_status) &&
      !isBetaWaived(profile.beta_waiver_until))
  ) {
    return Response.json({ error: "Subscription required" }, { status: 402 })
  }

  const planId = await getActivePlanId(supabase, user.id)
  if (!planId) return Response.json({ error: "No plan found" }, { status: 404 })

  let body: {
    item_id?: string
    item_name?: string
    concept_context?: ConceptContext
  }
  try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (!body.item_id || typeof body.item_id !== "string") {
    return Response.json({ error: "Missing required field: item_id" }, { status: 400 })
  }
  const itemName = body.item_name?.trim()
  if (!itemName) {
    return Response.json({ error: "Name the item before suggesting a recipe" }, { status: 400 })
  }

  // Verify the item belongs to this plan and fetch its category.
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id, category_id")
    .eq("id", body.item_id)
    .eq("plan_id", planId)
    .maybeSingle()
  if (!menuItem) {
    return Response.json({ error: "Menu item not found for this plan" }, { status: 404 })
  }

  // Load inventory context in parallel: (a) full ingredient library, (b) existing
  // recipe lines, (c) category default supplies, (d) category name for prompt.
  // Errors are checked individually: a failed existingLines fetch would silently
  // empty the linked-item guard's Sets, so we surface that as a 500 rather than
  // letting the guard run blind (Fix: TIM-3862 code-review finding 1).
  const [
    { data: allIngredients, error: ingErr },
    { data: existingLines, error: recipeErr },
    { data: categoryDefaults },
    { data: categoryRow },
  ] = await Promise.all([
    // (a) Full inventory — model will use real item names instead of generics.
    supabase
      .from("menu_ingredients")
      .select("id, name, package_unit")
      .eq("plan_id", planId)
      .order("name"),
    // (b) Existing recipe lines — treat as canonical inventory-linked items.
    // Guard depends on this; a fetch failure aborts the request (see below).
    supabase
      .from("menu_item_ingredients")
      .select("ingredient_id, amount, unit, menu_ingredients!inner(id, name, package_unit)")
      .eq("menu_item_id", body.item_id),
    // (c) Category default supplies — only queried when category_id is non-null
    // to avoid eq(null) matching all NULL-category rows (Fix: finding 4).
    menuItem.category_id
      ? supabase
          .from("category_default_ingredients")
          .select("ingredient_id, amount, unit, menu_ingredients!inner(id, name, package_unit)")
          .eq("category_id", menuItem.category_id)
      : Promise.resolve({ data: [], error: null }),
    // (d) Category name for prompt context — also guarded on null category_id.
    menuItem.category_id
      ? supabase
          .from("menu_categories")
          .select("name")
          .eq("id", menuItem.category_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (ingErr) {
    console.error(`suggest-recipe [${requestId}] ingredient fetch error:`, ingErr.message)
    return Response.json({ error: "Failed to load inventory" }, { status: 500 })
  }
  if (recipeErr) {
    // Guard depends on this query — fail rather than silently run without protection.
    console.error(`suggest-recipe [${requestId}] recipe fetch error:`, recipeErr.message)
    return Response.json({ error: "Failed to load existing recipe" }, { status: 500 })
  }

  type IngRow = { id: string; name: string; package_unit: string }

  // Sort: category-default items surface first (most relevant), then alpha.
  // Cap at MAX_INVENTORY_ROWS to bound prompt token use.
  const categoryDefaultIngIds = new Set(
    (categoryDefaults ?? []).map(
      (d) => (d as unknown as { ingredient_id: string }).ingredient_id,
    ),
  )
  const inventoryRows = (allIngredients ?? []) as IngRow[]
  const boundedInventory = [...inventoryRows]
    .sort((a, b) => {
      const aRel = categoryDefaultIngIds.has(a.id) ? 0 : 1
      const bRel = categoryDefaultIngIds.has(b.id) ? 0 : 1
      if (aRel !== bRel) return aRel - bRel
      return a.name.localeCompare(b.name)
    })
    .slice(0, MAX_INVENTORY_ROWS)

  const inventorySection =
    boundedInventory.length > 0
      ? boundedInventory
          .map((i) => `  - ${sanitizeForPrompt(i.name)} | unit: ${sanitizeForPrompt(i.package_unit)} | id: ${i.id}`)
          .join("\n")
      : "  (no inventory items yet — suggest simple generic names)"

  // Build existing recipe section — these are inventory-linked canonical items.
  type ExistingLine = {
    ingredient_id: string
    amount: number
    unit: string
    menu_ingredients: { id: string; name: string; package_unit: string }
  }
  const existingRecipeLines = (existingLines ?? []) as unknown as ExistingLine[]
  const linkedIngredientIds = new Set(existingRecipeLines.map((l) => l.ingredient_id))
  const linkedIngredientNames = new Set(
    existingRecipeLines.map((l) => l.menu_ingredients.name.toLowerCase()),
  )

  const existingRecipeSection =
    existingRecipeLines.length > 0
      ? existingRecipeLines
          .map(
            (l) =>
              `  - ${sanitizeForPrompt(l.menu_ingredients.name)} | ${l.amount} ${l.unit} | id: ${l.ingredient_id} [CANONICAL — must keep]`,
          )
          .join("\n")
      : "  (none — fresh recipe)"

  // Build category defaults section for supply/packaging guidance.
  type DefaultLine = {
    ingredient_id: string
    amount: number
    unit: string
    menu_ingredients: { id: string; name: string; package_unit: string }
  }
  const categoryDefaultLines = (categoryDefaults ?? []) as unknown as DefaultLine[]
  const categoryDefaultsSection =
    categoryDefaultLines.length > 0
      ? categoryDefaultLines
          .map(
            (d) =>
              `  - ${sanitizeForPrompt(d.menu_ingredients.name)} | amount: ${d.amount} ${d.unit} | id: ${d.ingredient_id}`,
          )
          .join("\n")
      : "  (none configured)"

  const categoryName = categoryRow?.name ?? "Unknown"

  const ctx = body.concept_context ?? {}
  const conceptLines: string[] = []
  if (ctx.shop_identity) conceptLines.push(`Shop: ${ctx.shop_identity}`)
  if (ctx.location) conceptLines.push(`Location: ${ctx.location}`)
  if (ctx.target_customer) conceptLines.push(`Target customer: ${ctx.target_customer}`)
  if (ctx.vision) conceptLines.push(`Vision: ${ctx.vision}`)
  const conceptSummary = conceptLines.length > 0
    ? conceptLines.join("\n")
    : "No concept details provided — assume a specialty independent café."

  const prompt = `You are a café operations consultant helping a first-time owner build a complete COGS recipe for a menu item. This recipe drives cost-of-goods calculations, so it must include EVERYTHING that goes into making and serving the item.

SHOP CONTEXT:
${conceptSummary}

MENU ITEM: ${itemName}
CATEGORY: ${categoryName}

---
EXISTING INVENTORY (use EXACT names and ids from this list when they match):
${inventorySection}

CURRENT RECIPE — CANONICAL ITEMS (return these with action "keep" and their exact id; NEVER suggest replacing them):
${existingRecipeSection}

CATEGORY DEFAULT SUPPLIES (include these in Group 2 unless already in Current Recipe):
${categoryDefaultsSection}
---

YOUR TASK:
Return the complete COGS recipe for one serving of "${itemName}". Include two groups:

Group 1 — Ingredients: coffee/espresso dose, milk, syrups, proteins, produce, toppings, etc.
Group 2 — Supplies & Packaging: cup, lid, sleeve (if hot), napkin, straw (if cold), etc. Every served item has packaging cost — do not omit it.

STRICT RULES:
1. Every item in "CURRENT RECIPE" above: return with action "keep", exact name, exact inventory_item_id.
2. Items from "EXISTING INVENTORY" that fit but are NOT in the current recipe: use exact inventory name + id, action "add".
3. Items not in inventory at all: action "add", simple Title Case name, inventory_item_id = null.
4. NEVER use action "replace" for any item that appears in CURRENT RECIPE.
5. Aim for 4–12 total lines. Be realistic for one serving.

UNITS — use ONLY: "g", "ml", "oz", "each", "piece"
NAMING — Title Case every word (AP style). Use exact inventory names where they match.

Return ONLY a JSON object — no commentary, no emojis, no preamble:
{
  "ingredients": [
    {
      "name": "Espresso Beans - Warmth Blend",
      "inventory_item_id": "abc-uuid-here",
      "amount": 18,
      "unit": "g",
      "group": "ingredient",
      "action": "keep"
    },
    {
      "name": "Vanilla Syrup",
      "inventory_item_id": null,
      "amount": 15,
      "unit": "ml",
      "group": "ingredient",
      "action": "add"
    },
    {
      "name": "Custom Cup - 8oz",
      "inventory_item_id": "def-uuid-here",
      "amount": 1,
      "unit": "each",
      "group": "supply",
      "action": "keep"
    }
  ]
}`

  let lines
  try {
    const result = await runScoutTurn({
      lane: "menu_suggest_recipe",
      systemBlocks: [],
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1500,
      userId: user.id,
      routeTag: ROUTE_PATH,
    })
    lines = parseRecipeResponse(result.text)
  } catch (err) {
    console.error(`suggest-recipe [${requestId}] AI error:`, err)
    return Response.json({ error: "AI generation failed" }, { status: 500 })
  }

  if (!lines || lines.length === 0) {
    return Response.json({ error: "Could not generate a recipe for this item" }, { status: 422 })
  }

  // Server-side guard (TIM-3862): reject any 'replace' targeting an inventory-
  // linked line item. Converts to 'keep' (same item) or 'add' (different item).
  // Logged server-side with requestId; never reaches the review panel.
  lines = applyLinkedItemGuard(lines, linkedIngredientIds, linkedIngredientNames, requestId)

  // Validate inventory_item_id values returned by the model: any ID that is not
  // in the authenticated user's own ingredient library is nulled out. Prevents a
  // prompt-injection scenario from producing a foreign-plan ID in the response
  // (Fix: TIM-3862 code-review finding 3).
  const validInventoryIds = new Set((allIngredients ?? []).map((i) => (i as { id: string }).id))
  lines = lines.map((line) => {
    if (line.inventory_item_id != null && !validInventoryIds.has(line.inventory_item_id)) {
      console.warn(
        `suggest-recipe [${requestId}]: nulled unrecognized inventory_item_id "${line.inventory_item_id}" for "${line.name}"`,
      )
      return { ...line, inventory_item_id: null }
    }
    return line
  })

  // TIM-2924 Shape C fix: do not create ingredients or recipe lines here.
  // The review modal is the Accept gate; the /apply sub-route does the DB
  // writes after the user confirms in the modal.
  return Response.json({ lines })
}
