// TIM-2361 prod-verify: hit benchmark-price on groundwork.cafe with a Pro
// fixture session, then confirm ai_turn_metrics shows model_used=sonnet-4-6 +
// credits ≈ 2× the Haiku-equivalent for the same output.
//
// Mints session via service-role admin.generateLink → verifyOtp({token_hash})
// → @supabase/ssr base64- chunked cookie pattern (TIM-2352/TIM-2369/TIM-2384).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const PROD = process.env.PROD_URL || "https://groundwork.cafe";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON) {
  console.error("FATAL: missing env");
  process.exit(2);
}

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const TS = Date.now();
const EMAIL = `tim2361+${TS}@verify.local`;
const PW = `t1m2361_verify_${TS}`;
console.log(`[prov] email=${EMAIL}`);

const { data: u, error: ue } = await svc.auth.admin.createUser({
  email: EMAIL, password: PW, email_confirm: true,
});
if (ue) { console.error("createUser failed", ue); process.exit(2); }
const uid = u.user.id;
console.log(`[prov] uid=${uid}`);

const { error: pe } = await svc.from("users").update({
  subscription_status: "active",
  subscription_tier: "pro",
  trial_ends_at: null,
  beta_waiver_until: null,
  ai_credits_remaining: 500,
}).eq("id", uid);
if (pe) { console.error("users update failed", pe); process.exit(2); }

const { data: plan, error: planErr } = await svc.from("coffee_shop_plans")
  .insert({ user_id: uid })
  .select("id").single();
if (planErr) { console.error("plan insert failed", planErr); process.exit(2); }

const { data: cat, error: catE } = await svc.from("menu_categories")
  .insert({ plan_id: plan.id, name: "TIM-2361 Beverages" })
  .select("id").single();
if (catE) { console.error("menu_categories insert failed", catE); process.exit(2); }

const { data: mi, error: miE } = await svc.from("menu_items")
  .insert({ plan_id: plan.id, category_id: cat.id, name: "TIM-2361 Oat Latte", price_cents: 575 })
  .select("id").single();
if (miE) { console.error("menu_items insert failed", miE); process.exit(2); }

// Mint a session the way @supabase/ssr expects.
const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr) { console.error("generateLink failed", linkErr); process.exit(2); }

const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const { data: otpData, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: linkData.properties.hashed_token,
});
if (otpErr || !otpData?.session) { console.error("verifyOtp failed", otpErr); process.exit(2); }

const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;
const payload = JSON.stringify(otpData.session);
const b64 = Buffer.from(payload, "utf8")
  .toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fullValue = `base64-${b64}`;
const MAX = 3180;
const cookies = [];
if (fullValue.length <= MAX) {
  cookies.push(`${storageKey}=${fullValue}`);
} else {
  let i = 0, pos = 0;
  while (pos < fullValue.length) {
    cookies.push(`${storageKey}.${i}=${fullValue.slice(pos, pos + MAX)}`);
    pos += MAX; i += 1;
  }
}
const cookieHeader = cookies.join("; ");

console.log("\n=== POST /api/workspaces/menu-pricing/benchmark-price (Pro) ===");
const tBefore = new Date().toISOString();
const r = await fetch(PROD + "/api/workspaces/menu-pricing/benchmark-price", {
  method: "POST",
  headers: { Cookie: cookieHeader, "Content-Type": "application/json" },
  body: JSON.stringify({
    item_id: mi.id,
    item_name: "TIM-2361 Bespoke Honey Mocha",  // miss the industry dataset → AI fallback
    current_price_cents: 575,
    concept_context: {
      shop_identity: "Specialty third-wave café, light roasts, minimal decor",
      location: "Portland, OR (Hawthorne)",
      target_customer: "Locals on the way to work, weekend remote-workers",
      vision: "Best oat latte on the east side",
    },
  }),
});
const txt = await r.text();
let body;
try { body = JSON.parse(txt); } catch { body = txt.slice(0, 300); }
console.log("status:", r.status);
console.log("body:", JSON.stringify(body).slice(0, 400));

console.log("\n=== Poll ai_turn_metrics ===");
let rows = [];
for (let i = 0; i < 15; i++) {
  await new Promise((res) => setTimeout(res, 1000));
  const { data, error } = await svc
    .from("ai_turn_metrics")
    .select("*")
    .eq("user_id", uid)
    .eq("route", "/api/workspaces/menu-pricing/benchmark-price")
    .gte("created_at", tBefore)
    .order("created_at", { ascending: false });
  if (error) { console.error("query failed", error); process.exit(2); }
  rows = data ?? [];
  if (rows.length > 0) break;
  process.stdout.write(".");
}
console.log();

let exitCode = 0;
if (rows.length === 0) {
  console.error("FAIL: no ai_turn_metrics row found within 15s");
  exitCode = 1;
} else {
  const row = rows[0];
  console.log("row:", JSON.stringify(row, null, 2));

  const failures = [];
  if (row.model_used !== "claude-sonnet-4-6") failures.push(`model_used=${row.model_used}, expected claude-sonnet-4-6`);
  if (row.plan_tier !== "pro") failures.push(`plan_tier=${row.plan_tier}, expected pro`);
  if (!(row.output_tokens > 0)) failures.push(`output_tokens=${row.output_tokens}, expected > 0`);
  if (!(Number(row.credits_charged) >= 1)) failures.push(`credits_charged=${row.credits_charged}, expected >= 1`);
  if (!(Number(row.cost_usd_estimate) > 0)) failures.push(`cost_usd_estimate=${row.cost_usd_estimate}, expected > 0`);

  const haikuCreditsHypothetical = Math.max(1, Math.ceil(row.output_tokens / 700));
  const sonnetCreditsHypothetical = Math.max(1, Math.ceil(row.output_tokens / 350));
  console.log(`\n2x credit check: ${row.output_tokens} output tokens →`);
  console.log(`  Haiku would charge:  ${haikuCreditsHypothetical} credits`);
  console.log(`  Sonnet (this turn):  ${row.credits_charged} credits`);
  console.log(`  Expected (Sonnet):   ${sonnetCreditsHypothetical} credits`);
  if (row.credits_charged !== sonnetCreditsHypothetical) {
    failures.push(`credits_charged=${row.credits_charged} != expected Sonnet ${sonnetCreditsHypothetical}`);
  }

  if (failures.length > 0) {
    console.error("\n✗ FAIL:");
    for (const f of failures) console.error("  -", f);
    exitCode = 1;
  } else {
    console.log("\n✓ TIM-2361 live verify PASS:");
    console.log(`  - model_used=${row.model_used}`);
    console.log(`  - plan_tier=${row.plan_tier}`);
    console.log(`  - output_tokens=${row.output_tokens}`);
    console.log(`  - credits_charged=${row.credits_charged}  (Haiku eq: ${haikuCreditsHypothetical} → 2x)`);
    console.log(`  - cost_usd_estimate=$${row.cost_usd_estimate}`);
    console.log(`  - input_tokens_uncached=${row.input_tokens_uncached}`);
    console.log(`  - input_tokens_cached_read=${row.input_tokens_cached_read}`);
  }
}

console.log("\n[cleanup] removing fixture user…");
await svc.from("ai_turn_metrics").delete().eq("user_id", uid);
await svc.from("menu_items").delete().eq("plan_id", plan.id);
await svc.from("menu_categories").delete().eq("plan_id", plan.id);
await svc.from("coffee_shop_plans").delete().eq("id", plan.id);
await svc.auth.admin.deleteUser(uid);
console.log("✓ cleanup done");

process.exit(exitCode);
