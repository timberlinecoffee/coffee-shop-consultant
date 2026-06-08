#!/usr/bin/env node
/**
 * TIM-1933 backfill: find every Stripe customer who currently has more than
 * one active subscription (the symptom of the duplicate-mint bug surfaced on
 * TIM-1932) and cancel the older sub(s), keeping the most recently created
 * one — i.e. the plan the customer actually meant to switch to.
 *
 * Cancellation uses `prorate=true` so the customer is refunded the unused
 * portion of the old subscription's current period.
 *
 * Two modes:
 *   --dry-run (default) — list what WOULD be cancelled, refund nothing.
 *   --apply             — cancel old subs (with proration).
 *
 * Optional:
 *   --customer cus_XXX  — limit to a single customer (use this for Trent's
 *                         account first per the board ask).
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/tim1933-backfill-duplicate-subs.mjs
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/tim1933-backfill-duplicate-subs.mjs --apply
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/tim1933-backfill-duplicate-subs.mjs --customer cus_XXX --apply
 *
 * Output: JSON report — one object per affected customer.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY env var required");
  process.exit(2);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const customerArgIdx = args.indexOf("--customer");
const onlyCustomer = customerArgIdx >= 0 ? args[customerArgIdx + 1] : null;

const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

// Walks active subscriptions, buckets by customer, and returns customers
// with >1 active sub. Uses Stripe's auto-paginating iterator so we don't
// blow up on a long list.
async function findDuplicates() {
  const byCustomer = new Map();
  const params = { status: "active", limit: 100 };
  if (onlyCustomer) params.customer = onlyCustomer;
  for await (const sub of stripe.subscriptions.list(params)) {
    const arr = byCustomer.get(sub.customer) ?? [];
    arr.push(sub);
    byCustomer.set(sub.customer, arr);
  }
  const dupes = [];
  for (const [customer, subs] of byCustomer.entries()) {
    if (subs.length < 2) continue;
    // Sort newest → oldest by created.
    subs.sort((a, b) => b.created - a.created);
    dupes.push({ customer, keep: subs[0], cancel: subs.slice(1) });
  }
  return dupes;
}

async function main() {
  console.error(`mode: ${apply ? "APPLY (will cancel old subs)" : "dry-run (no changes)"}`);
  if (onlyCustomer) console.error(`scoped to customer: ${onlyCustomer}`);

  const dupes = await findDuplicates();
  console.error(`found ${dupes.length} customer(s) with >1 active subscription`);

  const report = [];
  for (const { customer, keep, cancel } of dupes) {
    const entry = {
      customer,
      keepSubId: keep.id,
      keepCreated: new Date(keep.created * 1000).toISOString(),
      cancelledSubs: [],
    };
    for (const old of cancel) {
      const action = {
        subId: old.id,
        created: new Date(old.created * 1000).toISOString(),
        status: "pending",
      };
      if (apply) {
        try {
          // prorate=true — customer is credited for the unused portion of the
          // current period back to their default payment method.
          const cancelled = await stripe.subscriptions.cancel(old.id, { prorate: true });
          action.status = cancelled.status;
        } catch (err) {
          action.status = "error";
          action.error = err.message;
        }
      } else {
        action.status = "would_cancel";
      }
      entry.cancelledSubs.push(action);
    }
    report.push(entry);
  }

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!apply && dupes.length > 0) {
    console.error("\nRun again with --apply to perform the cancellations.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
