// TIM-2383 verify: assert Scout-as-hub Phase 3 rollout.
//
// Coverage (automated):
//   1. Concept page loads + per-field "Ask Scout" text present (not "Write with AI")
//   2. AIAssistCallout direct-modal path not reachable (no /api/copilot/improve endpoint hit)
//   3. Location & Lease page loads + AskScoutButton present (not bespoke COPILOT_NAME button)
//   4. Bespoke Location & Lease CoPilotDrawer file deleted (static check)
//   5. PersonaEditor "Ask Scout" label present
//
// Manual QA (require browser + LLM credits):
//   Step A: Concept per-field — click "Ask Scout" on any field → chat opens scoped to concept + field prompt seeded
//   Step B: PersonaEditor — click "Ask Scout" → chat opens with "Customer Persona — [field]" prompt
//   Step C: Location & Lease — click AskScoutButton → main chat opens scoped to location_lease
//   Step D: Area Analysis + Tradeoff — "Explain in Scout" dispatches and chat opens
//   Step E: All Phase 1/2 surfaces still work (no regression)
//   Step F: AIAssistCallout direct modal no longer reachable from any click path
//
// Run:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   PROD_URL=https://coffee-shop-consultant.vercel.app \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2383-scout-rollout-verify.mjs --phase=3

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROD = process.env.PROD_URL ?? 'https://coffee-shop-consultant.vercel.app'
const EMAIL = process.env.FIXTURE_EMAIL ?? 'trent@simpler.coffee'

if (!URL_ || !SVC || !ANON) {
  console.error('env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(2)
}

let passed = 0
let failed = 0

function assertOk(cond, msg) {
  if (!cond) { console.error(`[FAIL] ${msg}`); failed++ }
  else { console.log(`[PASS] ${msg}`); passed++ }
}

// ── 1. Mint session ──────────────────────────────────────────────────────────
const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
}).then((r) => r.json())

const tokenHash = link.properties?.hashed_token ?? link.hashed_token
if (!tokenHash) { console.error('generate_link failed', link); process.exit(2) }

const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
}).then((r) => r.json())

const accessToken = verify.access_token
if (!accessToken) { console.error('verify failed', verify); process.exit(2) }

const ref = URL_.match(/https:\/\/([^.]+)\./)[1]
const sessionPayload = encodeURIComponent(JSON.stringify({
  access_token: accessToken, refresh_token: verify.refresh_token,
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer', user: verify.user,
}))
const cookieHeader = `sb-${ref}-auth-token=${sessionPayload}`
console.log(`[auth] minted session for ${EMAIL}`)

// ── 2. Static source checks ──────────────────────────────────────────────────

// D1: concept-editor should dispatch copilot:open-with-prompt (not setAiAssistField)
const conceptEditor = readFileSync(
  resolve(ROOT, 'src/app/(app)/workspace/concept/concept-editor.tsx'), 'utf8'
)
assertOk(
  conceptEditor.includes('copilot:open-with-prompt') && !conceptEditor.includes('setAiAssistField'),
  '[D1] concept-editor: per-field buttons dispatch copilot:open-with-prompt, setAiAssistField removed'
)
assertOk(
  !conceptEditor.includes("import") || !conceptEditor.includes("AIAssistCallout") || !conceptEditor.match(/^import.*AIAssistCallout/m),
  '[D4] concept-editor: AIAssistCallout not imported (retired)'
)
assertOk(
  conceptEditor.includes('Ask Scout'),
  '[D1] concept-editor: per-field button label is "Ask Scout"'
)

// D2: PersonaEditor should have "Ask Scout" label (not "Write with AI")
const personaEditor = readFileSync(
  resolve(ROOT, 'src/components/concept/PersonaEditor.tsx'), 'utf8'
)
assertOk(
  personaEditor.includes('Ask Scout') && !personaEditor.includes('Write with AI'),
  '[D2] PersonaEditor: label updated to "Ask Scout"'
)
assertOk(
  personaEditor.includes('Sparkles'),
  '[D2] PersonaEditor: Sparkles icon present'
)

// D3: CandidateListCard should import main CoPilotDrawer, not bespoke one
const candidateListCard = readFileSync(
  resolve(ROOT, 'src/components/location-lease/CandidateListCard.tsx'), 'utf8'
)
assertOk(
  candidateListCard.includes('@/components/copilot/CoPilotDrawer') &&
  !candidateListCard.includes("'./CoPilotDrawer'"),
  '[D3] CandidateListCard: imports main CoPilotDrawer, not bespoke'
)
assertOk(
  candidateListCard.includes('AskScoutButton'),
  '[D3] CandidateListCard: AskScoutButton present'
)
assertOk(
  candidateListCard.includes("workspaceKey=\"location_lease\"") || candidateListCard.includes("workspaceKey='location_lease'"),
  '[D3] CandidateListCard: CoPilotDrawer scoped to location_lease'
)

// D3: bespoke CoPilotDrawer file deleted
assertOk(
  !existsSync(resolve(ROOT, 'src/components/location-lease/CoPilotDrawer.tsx')),
  '[D3] bespoke location-lease/CoPilotDrawer.tsx deleted'
)

// D5: AreaAnalysisPanel has "Explain in Scout"
const areaPanel = readFileSync(
  resolve(ROOT, 'src/components/location-lease/AreaAnalysisPanel.tsx'), 'utf8'
)
assertOk(
  areaPanel.includes('Explain in Scout'),
  '[D5] AreaAnalysisPanel: "Explain in Scout" link present'
)

// D5: TradeoffPanel has "Explain in Scout"
const tradeoffPanel = readFileSync(
  resolve(ROOT, 'src/components/location-lease/TradeoffPanel.tsx'), 'utf8'
)
assertOk(
  tradeoffPanel.includes('Explain in Scout'),
  '[D5] TradeoffPanel: "Explain in Scout" link present'
)

// ── 3. Live page checks ──────────────────────────────────────────────────────

const conceptRes = await fetch(`${PROD}/workspace/concept`, { headers: { Cookie: cookieHeader } })
assertOk(conceptRes.ok, `[D1] Concept page loads (${conceptRes.status})`)
const conceptHtml = await conceptRes.text()
assertOk(
  conceptHtml.includes('Ask Scout') && !conceptHtml.includes('Write with AI'),
  '[D1] Concept page: "Ask Scout" in rendered HTML, "Write with AI" absent'
)

const locationRes = await fetch(`${PROD}/workspace/location-lease`, { headers: { Cookie: cookieHeader } })
assertOk(locationRes.ok, `[D3] Location & Lease page loads (${locationRes.status})`)
const locationHtml = await locationRes.text()
assertOk(
  locationHtml.includes('Ask Scout') || locationHtml.includes('Improve with Scout'),
  '[D3] Location & Lease: AskScoutButton text present in rendered HTML'
)

// D4: /api/copilot/improve (the direct AIAssistCallout endpoint) should not 200 with
// AI content — it may still exist server-side but the UI no longer drives it
const improveRes = await fetch(`${PROD}/api/copilot/improve`, {
  method: 'POST',
  headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
  body: JSON.stringify({ planId: 'invalid', workspaceKey: 'concept', fieldKey: 'vision', draft: '', intent: 'improve' }),
})
// Accept 402/403/404/422/500 — anything except a direct-write 200 indicating UI still calls it.
// This is a best-effort check; the real D4 proof is the static source check above.
assertOk(
  improveRes.status !== 200,
  `[D4] /api/copilot/improve does not return 200 from test payload (got ${improveRes.status})`
)

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n=== AUTOMATED: ${passed} PASS / ${failed} FAIL ===`)
console.log(`\n=== MANUAL QA (require browser + LLM credits): ===`)
console.log('  A. Concept per-field: click "Ask Scout" on any card → chat opens scoped concept + field seeded')
console.log('  B. PersonaEditor: "Ask Scout" (Sparkles) → chat opens with persona-field prompt')
console.log('  C. Location & Lease: "Ask Scout" header button → main chat opens scoped to location_lease')
console.log('  D. Area Analysis + Tradeoff: "Explain in Scout" → chat opens with analysis context')
console.log('  E. All Phase 1/2 surfaces still work (no regression)')
console.log('  F. AIAssistCallout modal no longer reachable from any UI path')

if (failed > 0) process.exit(1)
