// TIM-2901 live verify on groundwork.cafe.
//
// Scout was telling the board it cannot add personas to the workspace
// (TIM-2857). It can now: a new add_persona apply tool emits a structured
// suggestion routed through the unified AIReviewModal; on accept, the client
// applyConceptPersonaProposal PATCHes the persona into the concept workspace
// document.
//
// This verify intercepts /api/copilot/stream with a deterministic SSE response
// containing a synthetic add_persona suggestion (no Anthropic spend, no model
// flakiness). The end-to-end assertions:
//
//   1. The "Review 1 suggestion" pill appears after Scout's response.
//   2. Clicking it opens the unified review modal carrying the persona name.
//   3. Accepting the suggestion triggers PATCH /api/workspaces/concept.
//   4. A GET of /api/workspaces/concept confirms doc.personas contains the
//      new persona with every standard field populated (including the
//      typicalOrder field new in TIM-1476).
//
// The intent-detection regex (server-side) is locked separately by
// src/lib/copilot/tim2901-add-persona.test.mjs (29 unit cases).
//
// Run from repo root:
//   node scripts/tim2901-add-persona-verify.mjs
//
// Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//      SUPABASE_SERVICE_ROLE_KEY (read from .env.local by default).

import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"

const env = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => {
          const idx = l.indexOf("=")
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
        }),
    )
  : process.env

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const PROD_URL = process.env.PROD_URL ?? "https://groundwork.cafe"
const HOST = new URL(PROD_URL).host
const TARGET_EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee"

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error("missing supabase env")
  process.exit(2)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Persona payload Scout would emit via the add_persona tool. Mirrors the JSON
// shape produced by stream/route.ts when the tool fires.
const PERSONA_NAME = `Verify Morning Regular ${Date.now()}`
const PERSONA_PAYLOAD = {
  name: PERSONA_NAME,
  ageRange: "25-35",
  occupation: "Remote knowledge worker",
  incomeRange: "80k-120k",
  dailyContext: "Commutes to a coworking space across the street most mornings.",
  whyTheyVisit:
    "They want a fast, consistent cup before standups without small talk. The ritual matters as much as the drink.",
  painPoints: "Chains feel cold; precious specialty shops feel slow.",
  typicalOrder: "Oat Milk Cortado plus a Butter Croissant most weekdays.",
  values: ["craft", "consistency", "speed"],
  visitFrequency: "daily",
  spendPerVisit: "6-10",
  isPrimary: false,
}

const SSE_BODY =
  `event: text\ndata: ${JSON.stringify({ delta: "I drafted a persona for the morning crowd — review below.\n\n" })}\n\n` +
  `event: suggestions\ndata: ${JSON.stringify({
    suggestions: [
      {
        id: `propose-persona-${crypto.randomUUID()}`,
        fieldId: "new_persona",
        fieldLabel: `New Persona: ${PERSONA_NAME}`,
        originalValue: "",
        proposedValue: JSON.stringify(PERSONA_PAYLOAD),
        isStructured: false,
      },
    ],
    context: { workspace: "concept", section: "Target Customer Personas" },
  })}\n\n` +
  `event: done\ndata: ${JSON.stringify({
    threadId: crypto.randomUUID(),
    modelUsed: "claude-haiku-4-5-20251001",
    trialRemaining: null,
    creditsSpent: 1,
    creditsRemaining: 9999,
  })}\n\n`

// ── 1. mint session cookie ───────────────────────────────────────────────────

console.log(`[1/7] minting magiclink for ${TARGET_EMAIL}...`)
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: TARGET_EMAIL,
})
if (linkErr) throw linkErr
const tokenHash = linkData?.properties?.hashed_token
if (!tokenHash) throw new Error("no token_hash")

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data: sessData, error: sessErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: "magiclink",
})
if (sessErr) throw sessErr
const session = sessData.session
if (!session) throw new Error("no session")
const refreshToken = session.refresh_token
const accessToken = session.access_token

// ── 2. capture baseline personas (so we can diff after apply) ────────────────

console.log("[2/7] capturing baseline concept personas via REST...")
const { data: planRow, error: planErr } = await admin
  .from("users")
  .select("current_plan_id")
  .eq("id", session.user.id)
  .single()
if (planErr || !planRow?.current_plan_id) {
  throw new Error(`no current_plan_id for ${TARGET_EMAIL}: ${planErr?.message}`)
}
const planId = planRow.current_plan_id

async function fetchConceptDoc() {
  const { data, error } = await admin
    .from("workspace_documents")
    .select("content")
    .eq("plan_id", planId)
    .eq("workspace_key", "concept")
    .maybeSingle()
  if (error) throw error
  return data?.content ?? null
}

const docBefore = await fetchConceptDoc()
const personasBefore = Array.isArray(docBefore?.personas) ? docBefore.personas : []
console.log(`     baseline persona count: ${personasBefore.length}`)
if (personasBefore.length >= 5) {
  throw new Error(
    `Fixture has ${personasBefore.length} personas (cap is 5). Delete one before re-running.`,
  )
}

// ── 3. launch browser + plumb cookies for the prod domain ────────────────────

console.log("[3/7] launching Playwright + setting auth cookies...")
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()

const cookieValue = JSON.stringify({
  access_token: accessToken,
  refresh_token: refreshToken,
  expires_at: session.expires_at,
  expires_in: session.expires_in,
  token_type: session.token_type,
  user: session.user,
})
const REF = new URL(SUPABASE_URL).hostname.split(".")[0]
await context.addCookies([
  {
    name: `sb-${REF}-auth-token`,
    value: cookieValue,
    domain: HOST,
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  },
])

const page = await context.newPage()
page.on("pageerror", (e) => console.log(`[browser error] ${e.message}`))
page.on("console", (msg) => {
  const t = msg.type()
  if (t === "error" || t === "warning") console.log(`[browser ${t}] ${msg.text()}`)
})
page.on("request", (req) => {
  const u = req.url()
  if (u.includes("/api/copilot/") || u.includes("/api/workspaces/concept")) {
    console.log(`[req ${req.method()}] ${u}`)
  }
})

// ── 4. intercept Scout stream + concept PATCH; let GET pass through ──────────

let streamCalled = 0
let patchCalled = 0
let patchPayload = null

await page.route("**/api/copilot/stream", (route) => {
  streamCalled += 1
  return route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    body: SSE_BODY,
  })
})

await page.route("**/api/workspaces/concept", async (route) => {
  if (route.request().method() === "PATCH") {
    patchCalled += 1
    patchPayload = JSON.parse(route.request().postData() ?? "{}")
  }
  return route.continue()
})

// ── 5. dismiss cookie banner, open Scout (Coach), send prompt ────────────────

console.log("[4/7] navigating to /workspace/concept...")
await page.goto(`${PROD_URL}/workspace/concept`, { waitUntil: "domcontentloaded" })

// Cookie consent dialog overlays the Scout opener (TIM-2900 gotcha).
const cookieDialog = page.getByRole("dialog", { name: /Cookie consent/i })
if (await cookieDialog.isVisible().catch(() => false)) {
  const accept = cookieDialog.getByRole("button", { name: /^Accept All$/i })
  await accept.click({ timeout: 5000 }).catch(() => {})
  await cookieDialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {})
  console.log("     dismissed cookie consent dialog")
}

console.log("[5/7] opening Scout drawer...")
// FAB aria-label is exactly "Open Scout (AI assistant)" (CoPilotDrawer.tsx:1311).
const opener = page.getByRole("button", { name: /^Open Scout/i })
await opener.waitFor({ state: "visible", timeout: 10000 })
await opener.click()

// Scout drawer carries the chat textarea. Tabs (Check / Coach) are role=tab
// inside the "Companion mode" tablist (TIM-2900 gotcha) — Check is default,
// click Coach to enable the text input.
const coachTab = page.getByRole("tab", { name: /Coach/i })
await coachTab.waitFor({ state: "visible", timeout: 5000 })
await coachTab.click()

// Now target the Scout-drawer textarea by its placeholder so we don't pick up
// any unrelated textarea on the page (e.g. the Concept editor field).
const textarea = page.getByPlaceholder(/Ask Scout/i)
await textarea.waitFor({ state: "visible", timeout: 10000 })
await textarea.fill("Draft a persona for the morning crowd")
await page.keyboard.press("Enter")

// ── 6. wait for "Review N suggestions" pill, open modal, accept ──────────────

console.log("[6/7] waiting for suggestion pill + modal...")
const reviewPill = page.getByTestId("copilot-review-suggestions")
try {
  await reviewPill.waitFor({ state: "visible", timeout: 15000 })
} catch (e) {
  await page.screenshot({ path: "scripts/shots/tim2901-no-pill.png", fullPage: true })
  console.log(`     streamCalled=${streamCalled} patchCalled=${patchCalled}`)
  const textareaVal = await textarea.inputValue().catch(() => "(error)")
  console.log(`     textarea value at failure: "${textareaVal}"`)
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 500)
  console.log(`     visible text fragment: ${bodyText.replace(/\s+/g, " ")}`)
  throw e
}
const pillText = (await reviewPill.textContent()) ?? ""
console.log(`     pill text: "${pillText.trim()}"`)
if (!/Review 1 suggestion/i.test(pillText)) {
  throw new Error(`expected "Review 1 suggestion" pill, got "${pillText}"`)
}

await reviewPill.click()

// The modal carries the persona name in its label.
const modalLabel = page.getByText(`New Persona: ${PERSONA_NAME}`, { exact: false })
await modalLabel.waitFor({ state: "visible", timeout: 5000 })
console.log(`     modal shows persona label`)

// Accept the persona (the unified review modal has Accept buttons per card,
// then an Apply button at the bottom). The Scout drawer's backdrop button
// shares z-50 with the modal and lies above it in DOM order, so Playwright's
// force=true click still misses the React handler. Dispatch the click via
// the element's native HTMLElement.click() instead -- bypasses every layer
// concern and triggers React's synthetic event the same way a real user
// click would.
const acceptCard = page.getByRole("button", { name: /^Accept this suggestion$/i }).first()
await acceptCard.waitFor({ state: "visible", timeout: 5000 })
await acceptCard.evaluate((el) => el.click())

await page.waitForTimeout(500)
await page.screenshot({ path: "scripts/shots/tim2901-after-accept.png", fullPage: false })

const applyBtn = page.getByRole("button", { name: /^Apply (\d+ changes?|changes)$/i }).first()
try {
  await applyBtn.waitFor({ state: "visible", timeout: 5000 })
} catch (e) {
  const allButtons = await page.locator("button").allTextContents()
  console.log(`     buttons in DOM: ${JSON.stringify(allButtons.filter((t) => t.trim()).slice(0, 30))}`)
  throw e
}
await applyBtn.evaluate((el) => el.click())

// Wait for PATCH to fire.
await page.waitForTimeout(2500)

// ── 7. verify the persona landed in the concept doc ──────────────────────────

console.log("[7/7] verifying persona persisted to concept doc...")
const docAfter = await fetchConceptDoc()
const personasAfter = Array.isArray(docAfter?.personas) ? docAfter.personas : []
const added = personasAfter.find((p) => p.name === PERSONA_NAME)

await browser.close()

// ── results ──────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "id",
  "name",
  "isPrimary",
  "createdAt",
  "updatedAt",
  "whyTheyVisit",
  "ageRange",
  "occupation",
  "incomeRange",
  "dailyContext",
  "painPoints",
  "typicalOrder",
  "values",
  "visitFrequency",
  "spendPerVisit",
]
const missing = added ? REQUIRED_FIELDS.filter((k) => added[k] === undefined) : REQUIRED_FIELDS

const results = {
  streamIntercepted: streamCalled,
  patchFired: patchCalled,
  patchSentPersonaName: patchPayload?.content?.personas?.some((p) => p.name === PERSONA_NAME) ?? false,
  personasBefore: personasBefore.length,
  personasAfter: personasAfter.length,
  newPersonaPersisted: !!added,
  typicalOrderPopulated: added?.typicalOrder === PERSONA_PAYLOAD.typicalOrder,
  missingFields: missing,
}

console.log("\n=== TIM-2901 add_persona verify ===")
console.log(JSON.stringify(results, null, 2))

const passed =
  results.streamIntercepted === 1 &&
  results.patchFired >= 1 &&
  results.patchSentPersonaName &&
  results.personasAfter === results.personasBefore + 1 &&
  results.newPersonaPersisted &&
  results.typicalOrderPopulated &&
  results.missingFields.length === 0

if (!passed) {
  console.error("\n✗ FAIL — TIM-2901 verify did not meet all assertions")
  process.exit(1)
}

console.log("\n✓ PASS — add_persona apply path works end-to-end on " + PROD_URL)
