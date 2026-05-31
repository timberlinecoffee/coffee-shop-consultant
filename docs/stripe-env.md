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
| `STRIPE_PAUSE_MONTHLY_PRICE_ID` | Pause plan, monthly ($2.99/mo) | `price_...` |

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

# Pause plan (TIM-1542)
echo "price_..."   | npx vercel env add STRIPE_PAUSE_MONTHLY_PRICE_ID production preview
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
