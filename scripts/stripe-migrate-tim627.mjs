#!/usr/bin/env node
// TIM-627 / TIM-651 / TIM-672 / TIM-679
// Archive Builder + Accelerator (+ Credit Top-Up if present) and create
// Starter / Growth / Pro with monthly + annual recurring prices in USD.
//
// Idempotent: products are matched by exact name. Existing Groundwork
// products are reused; existing matching prices are reused; missing
// prices are created. Safe to re-run.
//
// Usage:
//   pnpm tsx scripts/stripe-migrate-tim627.mjs --mode test
//   pnpm tsx scripts/stripe-migrate-tim627.mjs --mode live
//
// Test mode reads STRIPE_TEST_SECRET_KEY. Live mode reads STRIPE_SECRET_KEY.

import Stripe from "stripe";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
      ? process.argv[++i]
      : "true";
    args.set(k, v);
  }
}

const mode = args.get("mode");
if (mode !== "test" && mode !== "live") {
  console.error("Usage: stripe-migrate-tim627.mjs --mode <test|live>");
  process.exit(1);
}

const keyVar = mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_SECRET_KEY";
const key = process.env[keyVar];
if (!key) {
  console.error(`Missing env: ${keyVar}`);
  process.exit(1);
}
if (mode === "test" && !key.startsWith("sk_test_")) {
  console.error(`${keyVar} does not look like a test key (expected sk_test_…)`);
  process.exit(1);
}
if (mode === "live" && !key.startsWith("sk_live_")) {
  console.error(`${keyVar} does not look like a live key (expected sk_live_…)`);
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

const ARCHIVE_NAMES = [
  "Builder",
  "Accelerator",
  "Credit Top-Up $10",
];

const NEW_TIERS = [
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

async function findProductsByName(name) {
  const out = [];
  for await (const p of stripe.products.list({ limit: 100, active: true })) {
    if (p.name === name || p.name === `Groundwork ${name}`) out.push(p);
  }
  return out;
}

async function archiveByName(name) {
  const matches = await findProductsByName(name);
  if (matches.length === 0) {
    console.log(`  ${name}: not present, skip`);
    return;
  }
  for (const p of matches) {
    if (p.name.startsWith("Groundwork ")) {
      // never archive a new Groundwork product accidentally
      console.log(`  skipped ${p.id} (${p.name}) — looks like a new product`);
      continue;
    }
    const updated = await stripe.products.update(p.id, { active: false });
    console.log(`  archived ${updated.id} (${updated.name})`);
  }
}

async function listPricesForProduct(productId) {
  const out = [];
  for await (const price of stripe.prices.list({ product: productId, limit: 100, active: true })) {
    out.push(price);
  }
  return out;
}

async function ensureTier(tier) {
  const productName = `Groundwork ${tier.name}`;
  let product = (await findProductsByName(tier.name)).find((p) => p.name === productName);
  if (!product) {
    product = await stripe.products.create({
      name: productName,
      description: tier.description,
      metadata: { tier: tier.name.toLowerCase() },
    });
    console.log(`  created product ${product.id} (${productName})`);
  } else {
    console.log(`  reusing product ${product.id} (${productName})`);
  }

  const existing = await listPricesForProduct(product.id);
  const results = {};

  for (const [interval, cfg] of [["month", tier.monthly], ["year", tier.annual]]) {
    const match = existing.find(
      (p) =>
        p.unit_amount === cfg.amount &&
        p.currency === "usd" &&
        p.recurring?.interval === interval
    );
    if (match) {
      console.log(`  reusing ${interval} price ${match.id} ($${cfg.amount / 100})`);
      results[cfg.envKey] = match.id;
    } else {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: cfg.amount,
        currency: "usd",
        recurring: { interval },
        metadata: { tier: tier.name.toLowerCase(), interval },
      });
      console.log(`  created ${interval} price ${price.id} ($${cfg.amount / 100})`);
      results[cfg.envKey] = price.id;
    }
  }
  return results;
}

async function main() {
  console.log(`Stripe migration TIM-627 — mode=${mode}\n`);

  console.log("Archive legacy products:");
  for (const name of ARCHIVE_NAMES) {
    await archiveByName(name);
  }

  console.log("\nCreate / verify Groundwork tiers:");
  const allResults = {};
  for (const tier of NEW_TIERS) {
    console.log(`\n[${tier.name}]`);
    const r = await ensureTier(tier);
    Object.assign(allResults, r);
  }

  console.log(`\n\n=== ${mode.toUpperCase()} mode price IDs ===\n`);
  for (const tier of NEW_TIERS) {
    const m = allResults[tier.monthly.envKey];
    const y = allResults[tier.annual.envKey];
    console.log(`${tier.name} monthly  ($${tier.monthly.amount / 100}/mo): ${m}`);
    console.log(`${tier.name} annual   ($${tier.annual.amount / 100}/yr): ${y}`);
  }

  console.log("\n=== Env-var mapping ===");
  console.log(JSON.stringify(allResults, null, 2));
}

main().catch((err) => {
  console.error("Migration failed:", err.message || err);
  process.exit(1);
});
