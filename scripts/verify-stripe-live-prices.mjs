#!/usr/bin/env node
/**
 * TIM-1584 — verify every STRIPE_*_PRICE_ID env var points at a real, active
 * price in the Stripe account whose secret key is in STRIPE_SECRET_KEY, and
 * that livemode + unit_amount + currency + interval + product name match the
 * values documented in docs/stripe-env.md and scripts/stripe-create-products.js.
 *
 * Usage (verify Production against live Stripe):
 *
 *   cd coffee-shop-consultant
 *   npx vercel env pull .env.prod --environment production
 *   node --env-file=.env.prod scripts/verify-stripe-live-prices.mjs
 *   rm .env.prod
 *
 * Non-zero exit means at least one FAIL / MISSING / ERROR. See the table.
 *
 * Read-only: this script only calls stripe.prices.retrieve() — never .create,
 * .update, or .del. Safe to run against live-mode without side effects.
 */

import Stripe from "stripe";

const EXPECTED = {
  STRIPE_STARTER_MONTHLY_PRICE_ID: { unit: 3900,   currency: "usd", interval: "month", product: /starter/i, required: true },
  STRIPE_STARTER_ANNUAL_PRICE_ID:  { unit: 29900,  currency: "usd", interval: "year",  product: /starter/i, required: true },
  STRIPE_GROWTH_MONTHLY_PRICE_ID:  { unit: 9900,   currency: "usd", interval: "month", product: /growth/i,  required: false },
  STRIPE_GROWTH_ANNUAL_PRICE_ID:   { unit: 79900,  currency: "usd", interval: "year",  product: /growth/i,  required: false },
  STRIPE_PRO_MONTHLY_PRICE_ID:     { unit: 19900,  currency: "usd", interval: "month", product: /pro/i,     required: true },
  STRIPE_PRO_ANNUAL_PRICE_ID:      { unit: 159900, currency: "usd", interval: "year",  product: /pro/i,     required: true },
  STRIPE_PAUSE_MONTHLY_PRICE_ID:   { unit: 299,    currency: "usd", interval: "month", product: /pause/i,   required: true },
  STRIPE_CREDITS_SMALL_PRICE_ID:   { unit: 1200,   currency: "usd", interval: null,    product: /small|credit/i,  required: true },
  STRIPE_CREDITS_MEDIUM_PRICE_ID:  { unit: 3900,   currency: "usd", interval: null,    product: /medium|credit/i, required: true },
  STRIPE_CREDITS_LARGE_PRICE_ID:   { unit: 9900,   currency: "usd", interval: null,    product: /large|credit/i,  required: true },
};

const sk = process.env.STRIPE_SECRET_KEY;
if (!sk) {
  console.error("STRIPE_SECRET_KEY not set. Either export it, or pull the env file first:");
  console.error("  npx vercel env pull .env.prod --environment production");
  console.error("  node --env-file=.env.prod scripts/verify-stripe-live-prices.mjs");
  process.exit(2);
}
const skMode = sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : "unknown";
if (skMode === "unknown") {
  console.error(`STRIPE_SECRET_KEY does not look like sk_live_… or sk_test_…: ${sk.slice(0, 8)}…`);
  process.exit(2);
}

const stripe = new Stripe(sk, { apiVersion: "2026-03-25.dahlia" });
console.log(`\nVerifying against ${skMode}-mode Stripe account (sk_${skMode}_…${sk.slice(-4)})\n`);

const rows = [];
for (const [key, exp] of Object.entries(EXPECTED)) {
  const id = process.env[key];
  if (!id) {
    rows.push({ key, id: "(unset)", status: exp.required ? "MISSING (required)" : "unset (optional)" });
    continue;
  }
  try {
    const price = await stripe.prices.retrieve(id, { expand: ["product"] });
    const problems = [];
    const expectLive = skMode === "live";
    if (price.livemode !== expectLive) problems.push(`livemode=${price.livemode} expected ${expectLive}`);
    if (!price.active) problems.push("price.active=false");
    if (price.unit_amount !== exp.unit) problems.push(`unit_amount=${price.unit_amount} expected ${exp.unit}`);
    if (price.currency !== exp.currency) problems.push(`currency=${price.currency} expected ${exp.currency}`);
    const interval = price.recurring?.interval ?? null;
    if (interval !== exp.interval) problems.push(`interval=${interval ?? "one_time"} expected ${exp.interval ?? "one_time"}`);
    const productName = typeof price.product === "object" && price.product && "name" in price.product ? price.product.name : "";
    if (!exp.product.test(productName)) problems.push(`product="${productName}" does not match /${exp.product.source}/`);
    rows.push({
      key,
      id: `${id.slice(0, 12)}…${id.slice(-4)}`,
      mode: price.livemode ? "live" : "test",
      amount: `${(price.unit_amount / 100).toFixed(2)} ${price.currency}`,
      interval: interval ?? "one_time",
      product: productName,
      status: problems.length ? `FAIL: ${problems.join("; ")}` : "PASS",
    });
  } catch (e) {
    rows.push({ key, id: `${id.slice(0, 12)}…${id.slice(-4)}`, status: `ERROR: ${e.message}` });
  }
}

console.table(rows);

const bad = rows.filter((r) => !r.status.startsWith("PASS") && r.status !== "unset (optional)").length;
if (bad === 0) {
  console.log(`\nAll set — every required STRIPE_*_PRICE_ID is a valid, active, ${skMode}-mode price with matching amount/interval/product.\n`);
  process.exit(0);
} else {
  console.log(`\n${bad} problem(s) above. Fix each row before shipping subscription flows to prod.\n`);
  console.log("Common fixes:");
  console.log("  • livemode mismatch → the env var points at a test-mode price; create a live-mode price in Stripe Dashboard and update Vercel Production");
  console.log("  • MISSING → set the env var in Vercel Production (see docs/stripe-env.md § Adding to Vercel)");
  console.log("  • unit_amount mismatch → either the price was recreated with a new amount, or docs are stale; align Stripe with docs/stripe-env.md pricing table");
  console.log("  • ERROR: No such price → the ID in Vercel does not exist in this Stripe account (wrong account, or ID typo)");
  process.exit(1);
}
