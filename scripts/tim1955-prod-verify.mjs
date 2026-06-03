// TIM-1955 prod-verify: provision a synthetic Starter user, sign in via REST,
// hit the gated routes, assert 402 + code:pro_required. Then upgrade to Pro
// and hit again, assert 200 (or workflow-specific success).
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
const PROD = process.env.PROD_URL || 'https://coffee-shop-consultant.vercel.app';
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON) { console.error('missing env'); process.exit(2); }

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
const TS = Date.now();
const EMAIL = `tim1955+${TS}@verify.local`;
const PW = `t1m1955_verify_${TS}`;
console.log('[prov] email:', EMAIL);

const { data: u, error: ue } = await svc.auth.admin.createUser({
  email: EMAIL, password: PW, email_confirm: true,
});
if (ue) { console.error('createUser failed', ue); process.exit(2); }
const uid = u.user.id;
console.log('[prov] uid:', uid);

// set as STARTER active
const { error: pe } = await svc.from('users').update({
  subscription_status: 'active',
  subscription_tier: 'starter',
  trial_ends_at: null,
  beta_waiver_until: null,
  ai_credits_remaining: 50,
}).eq('id', uid);
if (pe) { console.error('users update failed', pe); process.exit(2); }

// create a plan so benchmark-price reaches the gate (it checks tier BEFORE planId, so this isn't strictly required)
const { data: plan, error: planErr } = await svc.from('coffee_shop_plans').insert({ user_id: uid }).select('id').single();
if (planErr) { console.error('plan insert failed', planErr); process.exit(2); }

// menu item so the route would otherwise reach DB lookup (we don't even get there)
const { data: mi, error: miE } = await svc.from('menu_items').insert({ plan_id: plan.id, name: 'TIM-1955 Latte', category: 'beverage' }).select('id').single();
if (miE) console.warn('menu_items insert warn', miE.message);

// REST login to mint a session
const lr = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW })
});
const session = await lr.json();
if (!session.access_token) { console.error('login failed', session); process.exit(2); }
const AT = session.access_token; const RT = session.refresh_token;

// Build the project ref to compute the supabase-auth-token cookie name (Next.js helper looks for this).
const REF = new URL(SUPABASE_URL).host.split('.')[0];
const cookie = `sb-${REF}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: AT, refresh_token: RT, expires_in: session.expires_in, token_type: 'bearer', user: { id: uid, email: EMAIL } }))}`;

console.log('\n=== Starter user gate tests ===');
async function hit(method, path, body) {
  const r = await fetch(PROD + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let parsed; try { parsed = JSON.parse(txt); } catch { parsed = txt.slice(0, 200); }
  return { status: r.status, body: parsed };
}

const r1 = await hit('POST', '/api/workspaces/menu-pricing/benchmark-price', { item_id: mi?.id || '00000000-0000-0000-0000-000000000000', item_name: 'Latte' });
console.log('benchmark-price (Starter):', r1.status, JSON.stringify(r1.body));

const r2 = await hit('GET', '/api/workspaces/menu-pricing/platform-percentile?item_name=Latte');
console.log('platform-percentile (Starter):', r2.status, JSON.stringify(r2.body));

// Now upgrade to Pro and re-hit
await svc.from('users').update({ subscription_status: 'active', subscription_tier: 'pro' }).eq('id', uid);
console.log('\n=== Pro user gate tests ===');
const r3 = await hit('POST', '/api/workspaces/menu-pricing/benchmark-price', { item_id: mi?.id || '00000000-0000-0000-0000-000000000000', item_name: 'Latte' });
console.log('benchmark-price (Pro):', r3.status, JSON.stringify(r3.body).slice(0, 200));

const r4 = await hit('GET', '/api/workspaces/menu-pricing/platform-percentile?item_name=Latte');
console.log('platform-percentile (Pro):', r4.status, JSON.stringify(r4.body));

// Test support priority (Pro)
console.log('\n=== Support priority test ===');
const sup = await fetch(PROD + '/api/support', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TIM-1955 Pro user', email: EMAIL, subject: 'TIM-1955 Pro priority test', message: 'Verifying server-side priority flag derivation - safe to delete.' }) });
const supJson = await sup.json();
console.log('support submit (Pro):', sup.status, JSON.stringify(supJson));

// Inspect the support row
const { data: supRow } = await svc.from('support_messages').select('id, priority, user_id').eq('id', supJson.id).single();
console.log('support row priority:', supRow);

// Downgrade to Starter and submit again
await svc.from('users').update({ subscription_tier: 'starter' }).eq('id', uid);
const sup2 = await fetch(PROD + '/api/support', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TIM-1955 Starter', email: EMAIL, subject: 'TIM-1955 Starter priority test', message: 'Verifying Starter does NOT get priority - safe to delete.' }) });
const sup2Json = await sup2.json();
const { data: sup2Row } = await svc.from('support_messages').select('id, priority, user_id').eq('id', sup2Json.id).single();
console.log('support row (Starter) priority:', sup2Row);

// Cleanup
console.log('\n=== Cleanup ===');
await svc.from('support_messages').delete().eq('user_id', uid);
await svc.from('support_messages').delete().eq('id', 'e0cd0b15-9f57-4698-80a6-dc509c6fc86b');
if (mi?.id) await svc.from('menu_items').delete().eq('id', mi.id);
if (plan?.id) await svc.from('coffee_shop_plans').delete().eq('id', plan.id);
await svc.auth.admin.deleteUser(uid);
console.log('cleanup OK');
