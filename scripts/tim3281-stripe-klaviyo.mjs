// TIM-3281: enroll trent in Klaviyo flows + run Stripe test receipt + dunning.
//
// Klaviyo flow nodes have wait timers (Day 1/3/5/7) that require board operator
// to accelerate in Klaviyo UI for actual same-day inbox delivery. This script:
//   1. Pushes Trial Started, Trial Converted, Trial Canceled metric events for
//      trent@simpler.coffee so the flows enroll. Operator accelerates from UI.
//   2. Runs Stripe test successful subscription → captures receipt URL.
//   3. Runs Stripe test card-decline → captures invoice failed-attempt URL.

import { trackKlaviyoEvent } from '../src/lib/klaviyo.ts';

const TRENT = 'trent@simpler.coffee';
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
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

console.log('=== KLAVIYO ENROLLMENT ===');
const klaviyoResults = [];
for (const metric of [
  // These metric names match what the trial/conversion flows in Klaviyo listen on.
  // If the names differ in Klaviyo, the events still post; board can rename or
  // map the flow trigger to these.
  'Trial Started',
  'Trial Converted',
  'Trial Canceled',
]) {
  const res = await trackKlaviyoEvent(metric, TRENT, {
    source: 'tim3281-cto-live-e2e',
    timestamp: new Date().toISOString(),
    note: 'Live E2E test — please accelerate the relevant flow wait-node in Klaviyo UI so the email lands in trent inbox.',
  });
  klaviyoResults.push({ metric, ...res });
  console.log(`${metric.padEnd(25)} ${res.ok ? 'OK' : 'FAIL'} status=${res.status} ${res.error ? 'err=' + res.error.slice(0, 100) : ''}`);
}

console.log('\n=== STRIPE TEST: SUCCESSFUL CHARGE → RECEIPT ===');
// Create customer with PaymentMethod attached (test card 4242)
const cust = await stripeApi('/customers', { email: TRENT, name: 'Trent Brierly (TIM-3281 test)' });
console.log(`customer ${cust.id}`);

const pm = await stripeApi('/payment_methods', {
  type: 'card',
  card: { token: 'tok_visa' },
});
console.log(`payment_method ${pm.id}`);

await stripeApi(`/payment_methods/${pm.id}/attach`, { customer: cust.id });
await stripeApi(`/customers/${cust.id}`, { invoice_settings: { default_payment_method: pm.id } });

// One-off invoice item → invoice → finalize → pay
const item = await stripeApi('/invoiceitems', {
  customer: cust.id,
  amount: 4900,
  currency: 'usd',
  description: 'Groundwork Pro - TIM-3281 test charge (please ignore)',
});
console.log(`invoice_item ${item.id}`);

const inv = await stripeApi('/invoices', {
  customer: cust.id,
  auto_advance: false,
  collection_method: 'charge_automatically',
});
console.log(`invoice ${inv.id}`);

const finalized = await stripeApi(`/invoices/${inv.id}/finalize`, {});
console.log(`invoice finalized status=${finalized.status} total=${finalized.total}`);

const paid = await stripeApi(`/invoices/${inv.id}/pay`, { payment_method: pm.id });
console.log(`invoice paid status=${paid.status} hosted_invoice_url=${paid.hosted_invoice_url}`);
console.log(`invoice receipt: ${paid.hosted_invoice_url}`);
const chargeId = paid.charge;
if (chargeId) {
  const charge = await stripeApi(`/charges/${chargeId}`, null, 'GET');
  console.log(`charge ${charge.id} receipt_url=${charge.receipt_url}`);
}

console.log('\n=== STRIPE TEST: CARD DECLINE → DUNNING ===');
const cust2 = await stripeApi('/customers', { email: TRENT, name: 'Trent Brierly (TIM-3281 decline test)' });
const pmDecline = await stripeApi('/payment_methods', {
  type: 'card',
  card: { token: 'tok_chargeDeclined' },
});
console.log(`decline customer ${cust2.id} pm ${pmDecline.id}`);
await stripeApi(`/payment_methods/${pmDecline.id}/attach`, { customer: cust2.id });
await stripeApi(`/customers/${cust2.id}`, { invoice_settings: { default_payment_method: pmDecline.id } });

const item2 = await stripeApi('/invoiceitems', {
  customer: cust2.id,
  amount: 4900,
  currency: 'usd',
  description: 'Groundwork Pro - TIM-3281 decline test (please ignore)',
});
const inv2 = await stripeApi('/invoices', { customer: cust2.id, auto_advance: false });
const fin2 = await stripeApi(`/invoices/${inv2.id}/finalize`, {});
console.log(`invoice2 finalized status=${fin2.status}`);
try {
  await stripeApi(`/invoices/${inv2.id}/pay`, { payment_method: pmDecline.id });
  console.log('UNEXPECTED: pay did not throw on decline');
} catch (e) {
  console.log(`expected decline: ${e.message.slice(0, 200)}`);
}
const inv2After = await stripeApi(`/invoices/${inv2.id}`, null, 'GET');
console.log(`invoice2 status=${inv2After.status} hosted_url=${inv2After.hosted_invoice_url}`);

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify({
  klaviyo: klaviyoResults,
  stripe_receipt: {
    customer: cust.id,
    invoice: paid.id,
    hosted_invoice_url: paid.hosted_invoice_url,
    receipt_url: paid.charge ? `https://dashboard.stripe.com/test/charges/${paid.charge}` : null,
  },
  stripe_dunning: {
    customer: cust2.id,
    invoice: inv2.id,
    status: inv2After.status,
    hosted_invoice_url: inv2After.hosted_invoice_url,
  },
}, null, 2));
