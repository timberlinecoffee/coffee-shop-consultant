#!/usr/bin/env node
/**
 * TIM-1703 / TIM-1687: provision the one-time credit top-up prices in Stripe.
 * One-time prices (mode: payment), NOT subscriptions — no `recurring`.
 * Amounts must match `amountCents` in src/lib/credits/packs.ts.
 *
 * Run once: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-create-credit-packs.js
 * Prints the price IDs + the `vercel env add` commands.
 */

const Stripe = require("stripe");

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY env var required");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

// Mirrors CREDIT_PACK_LIST in src/lib/credits/packs.ts (launch defaults).
const PACKS = [
  { key: "small",  name: "Small Pack",  credits: 25,  amount: 1200, envKey: "STRIPE_CREDITS_SMALL_PRICE_ID" },
  { key: "medium", name: "Medium Pack", credits: 100, amount: 3900, envKey: "STRIPE_CREDITS_MEDIUM_PRICE_ID" },
  { key: "large",  name: "Large Pack",  credits: 300, amount: 9900, envKey: "STRIPE_CREDITS_LARGE_PRICE_ID" },
];

async function main() {
  const results = {};

  for (const pack of PACKS) {
    console.log(`\nCreating product: Groundwork Credits — ${pack.name}…`);
    const product = await stripe.products.create({
      name: `Groundwork Credits — ${pack.name}`,
      description: `${pack.credits} AI coaching credits (one-time top-up)`,
      metadata: { credit_pack: pack.key, credits: String(pack.credits) },
    });
    console.log(`  Product ID: ${product.id}`);

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.amount,
      currency: "usd",
      // NO recurring — one-time price for Checkout mode: payment.
      metadata: { credit_pack: pack.key, credits: String(pack.credits) },
    });
    console.log(`  one-time price ID: ${price.id}  →  ${pack.envKey}`);
    results[pack.envKey] = price.id;
  }

  console.log("\n\n=== Vercel env vars to add (development, preview, production) ===");
  for (const [k, val] of Object.entries(results)) {
    console.log(`echo "${val}" | npx vercel env add ${k} development preview production`);
  }

  console.log("\n=== Raw mapping ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
