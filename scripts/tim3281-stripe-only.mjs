// TIM-3281: Stripe test receipt + dunning capture, simplified via direct charges.

const STRIPE_KEY = process.env.STRIPE_TEST_SECRET_KEY;
if (!STRIPE_KEY) { console.error('STRIPE_TEST_SECRET_KEY missing'); process.exit(2); }

async function stripeApi(path, body, method = 'POST') {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) {
    const params = new URLSearchParams();
    function flatten(obj, prefix = '') {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}[${k}]` : k;
        if (v === null || v === undefined) continue;
        if (typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
        else if (Array.isArray(v)) v.forEach((item, i) => {
          if (typeof item === 'object') flatten(item, `${key}[${i}]`);
          else params.append(`${key}[${i}]`, String(item));
        });
        else params.append(key, String(v));
      }
    }
    flatten(body);
    init.body = params.toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, init);
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

const TRENT = 'trent@simpler.coffee';
const out = { receipt: null, decline: null };

console.log('=== SUCCESSFUL CHARGE (4242) ===');
const okCharge = await stripeApi('/charges', {
  amount: 4900,
  currency: 'usd',
  source: 'tok_visa',                // Stripe test token for 4242 success
  description: 'Groundwork Pro - TIM-3281 receipt test (please ignore)',
  receipt_email: TRENT,
  metadata: { tim_issue: 'TIM-3281', purpose: 'live_email_e2e' },
});
console.log('charge.ok=', okCharge.ok, 'status=', okCharge.status, 'id=', okCharge.json.id);
console.log('  paid=', okCharge.json.paid, 'status=', okCharge.json.status);
console.log('  receipt_url=', okCharge.json.receipt_url);
console.log('  receipt_email=', okCharge.json.receipt_email);
out.receipt = {
  id: okCharge.json.id,
  amount: okCharge.json.amount,
  paid: okCharge.json.paid,
  status: okCharge.json.status,
  receipt_url: okCharge.json.receipt_url,
  receipt_email: okCharge.json.receipt_email,
};

console.log('\n=== DECLINED CHARGE (decline token) ===');
const declineCharge = await stripeApi('/charges', {
  amount: 4900,
  currency: 'usd',
  source: 'tok_chargeDeclined',
  description: 'Groundwork Pro - TIM-3281 dunning test (please ignore)',
  receipt_email: TRENT,
  metadata: { tim_issue: 'TIM-3281', purpose: 'live_email_e2e_decline' },
});
console.log('decline.ok=', declineCharge.ok, 'status=', declineCharge.status);
console.log('  json=', JSON.stringify(declineCharge.json).slice(0, 400));
out.decline = {
  status: declineCharge.status,
  type: declineCharge.json?.error?.type,
  decline_code: declineCharge.json?.error?.decline_code,
  message: declineCharge.json?.error?.message,
  charge_id: declineCharge.json?.error?.charge,
};

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(out, null, 2));
