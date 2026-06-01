# Stripe Customer Portal Configuration

**Issue:** [TIM-1547](/TIM/issues/TIM-1547) — part of [TIM-1535](/TIM/issues/TIM-1535) (pause-subscription flow)

## Why this exists

All subscription cancellations must go through the in-app intercept at `/account/cancel` (pause/downgrade offered before hard cancel). Stripe's native "Cancel subscription" button in the Customer Portal bypasses that flow entirely. This config disables it at the portal level.

## Active configuration

| Field | Value |
|---|---|
| Config ID (test) | `bpc_1TdRzBCzwciIL0hn5JkVNzmu` |
| Is default | yes |
| Stripe mode | test (`sk_test_…`) — covers dev, preview, and production until live mode is enabled |
| Applied | 2026-06-01 |

### Feature settings

| Feature | Enabled | Notes |
|---|---|---|
| `subscription_cancel` | **false** | All cancels routed to `/account/cancel` |
| `payment_method_update` | true | Users can update cards/payment methods |
| `invoice_history` | true | Users can view and download invoices |
| `subscription_update` | false | Plan changes handled in-app |
| `subscription_pause` | false | Pause handled via in-app flow |
| `customer_update` | false | |

### Return URL

`https://coffee-shop-consultant.vercel.app/account/billing`

Set as `default_return_url` on the config and also passed per-session in `src/app/api/stripe/create-portal-session/route.ts`.

## How to recreate this config (rotation procedure)

If the Stripe account or admin changes, recreate the config with this curl command:

```bash
# Replace sk_test_… with the current STRIPE_SECRET_KEY
STRIPE_KEY="sk_test_..."
APP_URL="https://coffee-shop-consultant.vercel.app"

curl -X POST "https://api.stripe.com/v1/billing_portal/configurations" \
  -H "Authorization: Bearer $STRIPE_KEY" \
  -d "features[subscription_cancel][enabled]=false" \
  -d "features[payment_method_update][enabled]=true" \
  -d "features[invoice_history][enabled]=true" \
  -d "features[subscription_update][enabled]=false" \
  -d "default_return_url=${APP_URL}/account/billing" \
  -d "business_profile[headline]=Manage your Timberline Coffee School subscription"
```

After running:
1. Note the returned `id` (e.g. `bpc_...`)
2. Set `STRIPE_PORTAL_CONFIG_ID=<new-id>` in Vercel for dev/preview/production
3. Update this document with the new config ID and date

## Environment variable

`STRIPE_PORTAL_CONFIG_ID` — optional. When set, the portal session route passes it explicitly to `billingPortal.sessions.create`. When unset, Stripe falls back to the account's default configuration (which should also be this config, since `is_default: true`).

Add to Vercel:
```bash
echo "bpc_1TdRzBCzwciIL0hn5JkVNzmu" | npx vercel env add STRIPE_PORTAL_CONFIG_ID development
echo "bpc_1TdRzBCzwciIL0hn5JkVNzmu" | npx vercel env add STRIPE_PORTAL_CONFIG_ID preview
echo "bpc_1TdRzBCzwciIL0hn5JkVNzmu" | npx vercel env add STRIPE_PORTAL_CONFIG_ID production
```

## When Stripe live mode is enabled

When the account rotates to a live key (`sk_live_…`):

1. Re-run the curl command above with the live key — configs are mode-scoped (test configs do not exist in live mode).
2. Record the new live-mode config ID here and update `STRIPE_PORTAL_CONFIG_ID` in Vercel production.
3. Keep the test-mode config for dev/preview.

## Verification

To confirm the portal shows no Cancel action:
1. Go to Stripe Dashboard → Billing → Customer portal → Preview (test mode)
2. The "Cancel subscription" option should not appear
3. Or: create a billing portal session for a test customer and load the URL — no cancel button should be visible

## Code reference

- Portal session creation: `src/app/api/stripe/create-portal-session/route.ts`
- Called from: `src/app/account/billing/page.tsx`
