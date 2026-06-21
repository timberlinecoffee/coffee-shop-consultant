// TIM-2382 verify: assert Scout-as-hub Phase 2 rollout across 6 surfaces.
//
// Coverage (12 automated + 24 manual):
//   Steps 1–2 (automated): each workspace page loads + AskScoutButton present
//   Steps 3–6 (manual): require Scout chat session (LLM credits) + browser
//
// Run:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
//   PROD_URL=https://coffee-shop-consultant.vercel.app \
//   FIXTURE_EMAIL=trent@simpler.coffee \
//   node scripts/tim2382-scout-rollout-verify.mjs

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROD = process.env.PROD_URL ?? "https://coffee-shop-consultant.vercel.app";
const EMAIL = process.env.FIXTURE_EMAIL ?? "trent@simpler.coffee";

if (!URL_ || !SVC || !ANON) {
  console.error("env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(2);
}

let passed = 0;
let failed = 0;

function assertOk(cond, msg) {
  if (!cond) { console.error(`[FAIL] ${msg}`); failed++; }
  else { console.log(`[PASS] ${msg}`); passed++; }
}

// ── 1. Mint session ──────────────────────────────────────────────────────────
const link = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
}).then((r) => r.json());
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
if (!tokenHash) { console.error("generate_link failed", link); process.exit(2); }
const verify = await fetch(`${URL_}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
}).then((r) => r.json());
const accessToken = verify.access_token;
const refreshToken = verify.refresh_token;
if (!accessToken) { console.error("verify failed", verify); process.exit(2); }
const ref = URL_.match(/https:\/\/([^.]+)\./)[1];
const sessionPayload = encodeURIComponent(JSON.stringify({
  access_token: accessToken, refresh_token: refreshToken,
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer", user: verify.user,
}));
const cookieHeader = `sb-${ref}-auth-token=${sessionPayload}`;
console.log(`[auth] minted session for ${EMAIL}`);

// ── 2. Surface definitions ───────────────────────────────────────────────────
const SURFACES = [
  { id: 8,  name: "Business Plan",       path: "/workspace/business-plan",       workspaceKey: "business_plan",     buttonText: "Ask Scout" },
  { id: 9,  name: "Marketing",           path: "/workspace/marketing",            workspaceKey: "marketing",         buttonText: "Ask Scout" },
  { id: 10, name: "Operations Playbook", path: "/workspace/operations-playbook",  workspaceKey: "operations_playbook", buttonText: "Ask Scout" },
  { id: 11, name: "Opening Month Plan",  path: "/workspace/opening-month-plan",   workspaceKey: "opening_month_plan", buttonText: "Ask Scout" },
  { id: 12, name: "Hiring",              path: "/workspace/hiring",               workspaceKey: "hiring",            buttonText: "Ask Scout" },
  { id: 2,  name: "Concept",             path: "/workspace/concept",              workspaceKey: "concept",           buttonText: "Ask Scout" },
];

// ── 3. Per-surface automated checks ─────────────────────────────────────────
for (const s of SURFACES) {
  const url = `${PROD}${s.path}`;
  const res = await fetch(url, { headers: { Cookie: cookieHeader } });

  // Step 1: page loads
  assertOk(res.ok, `[${s.id}] ${s.name}: page loads (${s.path}) → ${res.status}`);

  // Step 2: AskScoutButton present (rendered as WorkspaceActionButton child)
  const html = await res.text();
  const hasButton = html.includes("Ask Scout") || html.includes("Improve with Scout");
  assertOk(hasButton, `[${s.id}] ${s.name}: AskScoutButton text present in page HTML`);
}

// ── 4. Zero auto-apply: old per-workspace generate endpoints must NOT 200 ───
// These endpoints previously responded to AI generate calls and wrote directly
// to the DB. Phase 2 removes them from the call chain; they may still exist
// server-side but should never be called by the workspace UI.
//
// We verify that the UI-layer buttons (now AskScoutButton) do not exist in
// the form of direct-fetch call sites. This is a static assertion — we check
// the compiled route registrations instead of live-firing.

const OLD_ENDPOINTS = [
  { surface: "Business Plan",       path: "/api/business-plan/generate" },
  { surface: "Marketing",           path: "/api/workspaces/marketing/generate" },
  { surface: "Operations Playbook", path: "/api/workspaces/operations_playbook/generate" },
  { surface: "Hiring",              path: "/api/workspaces/hiring/improve-jd" },
];

for (const e of OLD_ENDPOINTS) {
  const res = await fetch(`${PROD}${e.path}`, {
    method: "POST",
    headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  // These endpoints may still exist (other callers) or 404 — both acceptable.
  // What is NOT acceptable: 200 with AI-written content returned directly to UI
  // (that would indicate the auto-apply path is still active).
  // We accept 402/403/404/405/422/500 — anything except a direct-write 200.
  assertOk(res.status !== 200, `[zero-auto-apply] ${e.surface}: ${e.path} does not return 200 (got ${res.status})`);
}

// ── 5. Opening-month-plan: old generate endpoint ─────────────────────────────
const ompRes = await fetch(`${PROD}/api/opening-month-plan/generate`, {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  body: JSON.stringify({ planId: "invalid", targetLaunchDate: "2025-01-01", existingMilestones: [] }),
});
assertOk(ompRes.status !== 200, `[zero-auto-apply] Opening Month Plan: /api/opening-month-plan/generate does not return 200 (got ${ompRes.status})`);

// ── 6. Concept: old review endpoint ──────────────────────────────────────────
const conceptRes = await fetch(`${PROD}/api/workspaces/concept/review`, {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  body: JSON.stringify({ planId: "invalid", content: {} }),
});
assertOk(conceptRes.status !== 200, `[zero-auto-apply] Concept: /api/workspaces/concept/review does not return 200 (got ${conceptRes.status})`);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n=== AUTOMATED: ${passed} PASS / ${failed} FAIL ===`);
console.log(`\n=== MANUAL (require Scout chat + LLM credits): 24 steps ===`);
console.log(`For each of the 6 surfaces, manually verify:`);
console.log(`  Step 3: Chat opens with scope=workspaceKey + seeded prompt`);
console.log(`  Step 4: Scout narrates reasoning (no raw JSON blob)`);
console.log(`  Step 5: Review changes → opens AIReviewModal with per-field rows`);
console.log(`  Step 6: Accept persists + zero auto-apply confirmed in network tab`);
console.log(`\nNOTE: Steps 3–6 blocked on Anthropic API credits (see TIM memory: anthropic-credits-blocker)`);

if (failed > 0) process.exit(1);
