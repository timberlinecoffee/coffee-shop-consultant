# Stripe Environment Variables

All Stripe configuration is stored in environment variables so price or key changes are config-only -- no code deploy required.

## Required variables

| Variable | Description | Example |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key (test or live) | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard | `whsec_...` |
| `STRIPE_STARTER_MONTHLY_PRICE_ID` | Starter plan, monthly ($39/mo) | `price_...` |
| `STRIPE_STARTER_ANNUAL_PRICE_ID` | Starter plan, annual ($299/year) | `price_...` |
| `STRIPE_GROWTH_MONTHLY_PRICE_ID` | Growth plan, monthly ($99/mo) | `price_...` |
| `STRIPE_GROWTH_ANNUAL_PRICE_ID` | Growth plan, annual ($799/year) | `price_...` |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | Pro plan, monthly ($199/mo) | `price_...` |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | Pro plan, annual ($1,599/year) | `price_...` |
| `STRIPE_PAUSE_MONTHLY_PRICE_ID` | Pause plan, monthly ($2.99/mo) | `price_1TdIOcCzwciIL0hnXoGapjth` |
| `STRIPE_CREDITS_SMALL_PRICE_ID` | Credit top-up, Small Pack — 25 credits, one-time ($12) | `price_...` |
| `STRIPE_CREDITS_MEDIUM_PRICE_ID` | Credit top-up, Medium Pack — 100 credits, one-time ($39) | `price_...` |
| `STRIPE_CREDITS_LARGE_PRICE_ID` | Credit top-up, Large Pack — 300 credits, one-time ($99) | `price_...` |

## Credit top-up packs (TIM-1687)

One-off credit purchases let an out-of-credit user resume AI use mid-month without upgrading tier. These are **one-time** prices (Stripe `mode: payment`), not subscriptions. The credit grant per pack lives in code (`src/lib/credits/packs.ts`) — the env vars carry only the Stripe price IDs, and the webhook resolves the grant from the pack key, never from Stripe price metadata. The dollar price provisioned in Stripe must match the `amountCents` in `packs.ts`.

| Pack | Credits | Price | Env var |
|---|---|---|---|
| Small | 25 | $12 | `STRIPE_CREDITS_SMALL_PRICE_ID` |
| Medium | 100 | $39 | `STRIPE_CREDITS_MEDIUM_PRICE_ID` |
| Large | 300 | $99 | `STRIPE_CREDITS_LARGE_PRICE_ID` |

Credits and prices are launch defaults flagged for product calibration (see TIM-1687). Provision the three one-time prices in Stripe (test mode today, per the mode note above) and add each ID to Vercel:

```bash
echo "price_..." | npx vercel env add STRIPE_CREDITS_SMALL_PRICE_ID development preview production
echo "price_..." | npx vercel env add STRIPE_CREDITS_MEDIUM_PRICE_ID development preview production
echo "price_..." | npx vercel env add STRIPE_CREDITS_LARGE_PRICE_ID development preview production
```

## Configured price IDs — Pause plan (TIM-1542)

> **Stripe mode note (as of 2026-06-01):** Vercel Production's `STRIPE_SECRET_KEY` is `sk_test_…` — the account has not yet switched to live mode. The test-mode price ID below is therefore valid for all environments until the production Stripe account goes live. A follow-up issue will create the live-mode price and rotate the Production env var before [TIM-1535](/TIM/issues/TIM-1535) ships.

| Environment | Stripe mode | Price ID |
|---|---|---|
| Development | test | `price_1TdIOcCzwciIL0hnXoGapjth` |
| Preview (staging) | test | `price_1TdIOcCzwciIL0hnXoGapjth` |
| Production | test (sk_test_…) | `price_…pjth` |

All three are the same value today (`price_1TdIOcCzwciIL0hnXoGapjth`). Once Stripe live mode is enabled, Production will get a distinct `price_…` (live-mode) and the others keep the test-mode id.

## Creating Stripe products (first-time setup)

Run the provisioning script with a Stripe test-mode secret key:

```bash
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-create-products.js
```

The script creates 3 products with 2 prices each (6 total) and prints the `vercel env add` commands to add each price ID.

## Adding to Vercel

```bash
echo "sk_test_..." | npx vercel env add STRIPE_SECRET_KEY production preview
echo "whsec_..."   | npx vercel env add STRIPE_WEBHOOK_SECRET production preview
echo "price_..."   | npx vercel env add STRIPE_STARTER_MONTHLY_PRICE_ID production preview
# ... repeat for each price ID

# Pause plan (TIM-1542) — test-mode price, all envs
echo "price_1TdIOcCzwciIL0hnXoGapjth" | npx vercel env add STRIPE_PAUSE_MONTHLY_PRICE_ID development preview
echo "price_1TdIOcCzwciIL0hnXoGapjth" | npx vercel env add STRIPE_PAUSE_MONTHLY_PRICE_ID production
# When Stripe goes live: replace production value with live-mode price ID
```

## Revising a price (e.g. Pro rate change)

1. In the Stripe Dashboard, create a new price on the existing Pro product.
2. Update `STRIPE_PRO_MONTHLY_PRICE_ID` or `STRIPE_PRO_ANNUAL_PRICE_ID` in Vercel.
3. Redeploy (or wait for next deploy) -- no code change needed.
4. Archive the old price in Stripe to prevent new subscriptions.

Existing subscribers on the old price continue at their original rate until they are migrated or cancel.

## Groundwork pricing reference

| Tier | Monthly | Annual | Annual equivalent/mo |
|---|---|---|---|
| Starter | $39 | $299 | ~$25 |
| Growth | $99 | $799 | ~$67 |
| Pro | $199 | $1,599 | ~$133 |
| **Pause** | **$2.99** | — | — |

Annual savings: Starter saves $169, Growth saves $389, Pro saves $789 (roughly 2 months free at each tier).

The Pause plan is a reduced-access tier for subscribers who are not actively studying. It does not have an annual option.
