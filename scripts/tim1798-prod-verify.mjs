// TIM-1798 prod verify: confirm Scout fires propose_equipment_change on the
// PLATFORM model (Haiku, post-TIM-1897) and emits a coordinated cross-workspace
// proposal (equipment primary + linked Financials cards) on prod/main.
// Backend SSE smoke as trent@simpler.coffee — no browser. Retries because LLM
// tool-firing is non-deterministic; we want to know it reliably fires.
import fs from "node:fs";

const BASE = "https://coffee-shop-consultant.vercel.app";
const HOST = "coffee-shop-consultant.vercel.app";
const EMAIL = "trent@simpler.coffee";
const PROMPT =
  "In my equipment list, reprice the espresso machine to $11,000 and update my financials and startup costs to match.";
const MAX_TRIES = 5;

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

// ── Mint a real session for the demo fixture ──────────────────────────────────
const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: EMAIL }),
});
if (!linkRes.ok) { console.error("generate_link FAIL", linkRes.status, await linkRes.text()); process.exit(1); }
const link = await linkRes.json();
const tokenHash = link.properties?.hashed_token ?? link.hashed_token;
const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});
if (!verifyRes.ok) { console.error("verify FAIL", verifyRes.status, await verifyRes.text()); process.exit(1); }
const auth = await verifyRes.json();
const uid = auth.user?.id;
console.log("AUTH OK:", auth.user?.email, uid);

// ── Resolve the plan id + confirm the espresso machine is on the list ─────────
const planRes = await fetch(
  `${SUPABASE_URL}/rest/v1/coffee_shop_plans?user_id=eq.${uid}&select=id&order=created_at.desc&limit=1`,
  { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
);
const plans = await planRes.json();
const planId = plans[0]?.id;
if (!planId) { console.error("no plan for user"); process.exit(1); }
const eqRes = await fetch(
  `${SUPABASE_URL}/rest/v1/buildout_equipment_items?plan_id=eq.${planId}&archived=eq.false&select=id,name,unit_cost_cents,quantity`,
  { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
);
const items = await eqRes.json();
const espresso = items.find((i) => /espresso/i.test(i.name));
console.log("plan:", planId, "| equipment items:", items.length, "| espresso:", espresso?.name, espresso ? `$${espresso.unit_cost_cents / 100}` : "(none)");

const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: auth.access_token, refresh_token: auth.refresh_token,
  expires_in: auth.expires_in, expires_at: auth.expires_at,
  token_type: auth.token_type, user: auth.user,
}))}`;

// ── Drive the stream route and look for the cross-workspace suggestions event ──
async function attempt(n) {
  const res = await fetch(`${BASE}/api/copilot/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      planId,
      workspaceKey: "buildout_equipment",
      messages: [{ role: "user", content: PROMPT }],
    }),
  });
  if (!res.ok) { console.log(`  try ${n}: HTTP ${res.status}`); return null; }
  const text = await res.text();
  let modelUsed = null, suggestionsEvt = null;
  for (const block of text.split("\n\n")) {
    const ev = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.+)$/m)?.[1];
    if (!ev || !data) continue;
    try {
      const parsed = JSON.parse(data);
      if (ev === "done") modelUsed = parsed.modelUsed;
      if (ev === "suggestions") suggestionsEvt = parsed;
    } catch {}
  }
  return { modelUsed, suggestionsEvt };
}

let pass = false;
for (let n = 1; n <= MAX_TRIES; n++) {
  const r = await attempt(n);
  if (!r) continue;
  const s = r.suggestionsEvt;
  const cards = s?.suggestions ?? [];
  const primary = cards.find((c) => typeof c.fieldId === "string" && c.fieldId.startsWith("equipment-cost:"));
  const derived = cards.filter((c) => c.derived);
  const finCards = cards.filter((c) => c.workspaceLabel === "Financials");
  console.log(`  try ${n}: model=${r.modelUsed} | suggestions=${cards.length} | primary=${!!primary} | derived=${derived.length} | financials=${finCards.length}`);
  if (primary && derived.length >= 2 && finCards.length >= 2) {
    console.log("\n=== PASS ===");
    console.log("model:", r.modelUsed);
    console.log("context:", JSON.stringify(s.context));
    for (const c of cards) {
      console.log(`  [${c.workspaceLabel ?? "?"}]${c.derived ? " (linked)" : ""} ${c.fieldLabel}: ${c.originalValue} -> ${c.proposedValue}${c.provenance ? ` (${c.provenance})` : ""}`);
    }
    pass = true;
    break;
  }
}
if (!pass) { console.log("\n=== FAIL: tool did not fire a complete cross-workspace proposal in", MAX_TRIES, "tries ==="); process.exit(2); }
