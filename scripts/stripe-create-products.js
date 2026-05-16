#!/usr/bin/env node
/**
 * Provisions Groundwork pricing products in Stripe test mode.
 * Run once: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-create-products.js
 *
 * Outputs the 6 price IDs to add as Vercel env vars via:
 *   npx vercel env add STRIPE_<NAME>_PRICE_ID production < /dev/stdin
 */

const Stripe = require("stripe");

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY env var required");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

const TIERS = [
  {
    name: "Starter",
    description: "Core curriculum + 25 AI coaching credits/month",
    monthly: { amount: 3900, envKey: "STRIPE_STARTER_MONTHLY_PRICE_ID" },
    annual:  { amount: 29900, envKey: "STRIPE_STARTER_ANNUAL_PRICE_ID" },
  },
  {
    name: "Growth",
    description: "Everything in Starter + 100 AI coaching credits + Q&A",
    monthly: { amount: 9900, envKey: "STRIPE_GROWTH_MONTHLY_PRICE_ID" },
    annual:  { amount: 79900, envKey: "STRIPE_GROWTH_ANNUAL_PRICE_ID" },
  },
  {
    name: "Pro",
    description: "Everything in Growth + unlimited coaching + 1-on-1 sessions",
    monthly: { amount: 19900, envKey: "STRIPE_PRO_MONTHLY_PRICE_ID" },
    annual:  { amount: 159900, envKey: "STRIPE_PRO_ANNUAL_PRICE_ID" },
  },
];

async function main() {
  const results = {};

  for (const tier of TIERS) {
    console.log(`\nCreating product: ${tier.name}…`);
    const product = await stripe.products.create({
      name: `Groundwork ${tier.name}`,
      description: tier.description,
      metadata: { tier: tier.name.toLowerCase() },
    });
    console.log(`  Product ID: ${product.id}`);

    for (const [interval, config] of [["month", tier.monthly], ["year", tier.annual]]) {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.amount,
        currency: "usd",
        recurring: { interval },
        metadata: { tier: tier.name.toLowerCase(), interval },
      });
      console.log(`  ${interval} price ID: ${price.id}  →  ${config.envKey}`);
      results[config.envKey] = price.id;
    }
  }

  console.log("\n\n=== Vercel env vars to add ===");
  console.log("Run each of the following (replace <value> with the price ID shown):\n");
  for (const [key, val] of Object.entries(results)) {
    console.log(`echo "${val}" | npx vercel env add ${key} production preview`);
  }

  console.log("\n=== Raw mapping ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
