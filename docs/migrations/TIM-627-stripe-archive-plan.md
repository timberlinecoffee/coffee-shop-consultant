# TIM-627 — Stripe archive + Groundwork SKU creation

Stripe execution is owned by the CEO/founder (account holder). This doc captures
the exact actions to run in Stripe live + test mode after the code/migration PR
lands, so checkout, webhooks, and `subscription_tier` stay in sync.

## What to archive

Run in **both live and test mode**.

1. Open the Stripe dashboard → Products.
2. For each product below: set the product to `active=false` (Archive), which
   also archives its prices. Do **not** delete; archive is reversible.

| Product (current) | Reason |
|---|---|
| **Builder** subscription — Monthly + Annual | Tier name and feature bundle (Trent Q&A, BRD, 8 modules) is course-shaped. Replaced by Starter under Groundwork pricing (TIM-617). |
| **Accelerator** subscription — Monthly + Annual | Feature bundle is built around Trent deliverables (Q&A, 1-on-1 at BRD) that do not exist in Groundwork. Replaced by Pro. |
| **Credit Top-Up $10** (one-time, if it exists in Stripe) | Not wired in current code; not part of Groundwork pricing. Confirm whether it ever shipped before archive. |

The price-id env vars in Vercel + `.env.example` referencing `STRIPE_BUILDER_*`
and `STRIPE_ACCELERATOR_*` are rewritten in a follow-up issue once the new price
IDs land. Leaving them temporarily set to the archived prices is safe — archived
prices reject new checkouts, so checkout traffic fails closed.

## What to create (Groundwork)

Pricing per [TIM-617](/TIM/issues/TIM-617) Phase 2 approved scope:

| Tier | Monthly | Annual | Notes |
|---|---|---|---|
| **Starter** | $39/mo | $299/yr | Entry tier. AI co-pilot included. |
| **Growth** | $99/mo | $799/yr | Cross-workspace context. |
| **Pro** | $199/mo | $1,599/yr | Highest tier. Pricing/ICP gate before W3 end (2026-06-05). |

For each tier, create one product with two prices (monthly + annual).

After creation, post the new price IDs back on TIM-627. CTO updates Vercel env
vars + `.env.example`:

- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `STRIPE_STARTER_ANNUAL_PRICE_ID`
- `STRIPE_GROWTH_MONTHLY_PRICE_ID`
- `STRIPE_GROWTH_ANNUAL_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`

`src/lib/stripe.ts` (`PLANS` keys + `tierFromPriceId`) and the webhook switch
are updated in lockstep with those env vars.

## Rollback

Archive is reversible: re-activate the old product in Stripe (`active=true`)
and the prices come back online. No data is lost.

## Success criteria

- Stripe live and test mode show only the three Groundwork products (plus Free,
  which is enforced in-app, not in Stripe).
- A new checkout against an archived price returns a Stripe error.
- New checkouts against the new prices succeed end-to-end in test mode.
