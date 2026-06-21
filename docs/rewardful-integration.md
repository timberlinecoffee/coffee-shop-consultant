# Rewardful Affiliate Integration (TIM-1620)

Affiliate program for Groundwork (`coffee-shop-consultant`) Stripe subscriptions, built on
**Rewardful** (Stripe-native). Vendor + spend approved on
[TIM-1607](/TIM/issues/TIM-1607); program design on [TIM-1606](/TIM/issues/TIM-1606).

## What the code does

Rewardful is a hosted service; the app's only job is **attribution**:

1. `src/app/_components/RewardfulScript.tsx` installs the Rewardful tracking snippet in
   the root layout. It captures the `?via=<affiliate>` referral from any link into a
   60-day last-click cookie and exposes `window.Rewardful.referral`.
2. `src/app/pricing/page.tsx` reads `window.Rewardful.referral` and sends it as
   `referral` in the checkout request body.
3. `src/app/api/stripe/create-checkout-session/route.ts` sets that value as Stripe
   `client_reference_id`. Rewardful reads `client_reference_id` off the resulting
   subscription and attributes the referral.

That is the entire engineering surface. Everything else is Rewardful-dashboard +
Stripe-dashboard configuration (below).

### Activation env var

| Variable | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_REWARDFUL_API_KEY` | Vercel: production + preview | Public client-side tracking id (not a secret). **When unset, the script renders nothing — the integration is a safe no-op.** Set it only after the Rewardful account is connected to Stripe. |

```bash
echo "<rewardful-public-key>" | npx vercel env add NEXT_PUBLIC_REWARDFUL_API_KEY production preview
```

> **Stripe mode:** Production `STRIPE_SECRET_KEY` is currently `sk_test_…` (see
> `docs/stripe-env.md`). Connect Rewardful to the **same** Stripe account/mode, and run
> the end-to-end test in test mode. Re-verify attribution when Stripe goes live.

---

## Configuration runbook (Rewardful dashboard — requires provisioned account)

Owner of provisioning: **board / Finance** (paid SaaS account + Stripe Connect OAuth +
payout rails). Execute the rest once the account exists.

### 1. Connect Stripe
- Rewardful → Stripe via read API key / OAuth, against the Timberline Stripe account.
- Plan: Starter ($49/mo) to start; upgrade to Growth when affiliate revenue nears the
  $7.5k/mo cap. 0% payout fee.

### 2. Campaigns (per approved economics, TIM-1606)
Two campaigns, identical economics:

| Setting | Value |
|---|---|
| Campaigns | **Educators**, **Roasters** |
| Commission | **20% recurring × 6 months** (Standard) |
| Tiers | Silver **22%**, Gold **25%** |
| Attribution | **60-day last-click** cookie/window |

### 3. Referred-client coupons (Stripe, mapped to campaigns)
Dual-sided incentive — **10% off × 3 months** for the referred customer:
- Monthly plans: Stripe coupon `10% off, duration = repeating, duration_in_months = 3`.
- Annual plans: Stripe coupon `10% off, duration = once` (one-time 10% off the annual).
- Map coupons to both campaigns in Rewardful. **No stacking** with other promos.

### 4. Payouts
| Setting | Value |
|---|---|
| Threshold | **$50 CAD** |
| Cadence | Monthly, on the **15th** |
| Refund hold | **30 days** before a commission is payable |
| Clawback | On refund / chargeback, reverse the commission |
| Rails | Connect **PayPal / Wise** |
| **Interac e-Transfer** | **Manual** — Rewardful does not automate Interac. Finance exports payable affiliates on the 15th and sends Interac e-Transfers by hand, then marks them paid in Rewardful. Document each manual payout. |

---

## End-to-end test plan (TIM-1620 step 6 — after provisioning, run with QA Lead)

In Stripe **test mode**:

1. Create a test affiliate in Rewardful; grab its `?via=` link.
2. Visit Groundwork via the `?via=` link → confirm the cookie and
   `window.Rewardful.referral` are set.
3. Subscribe a referred test customer → confirm the Checkout session carries
   `client_reference_id` and Rewardful shows the referral attributed to the affiliate.
4. Advance one renewal cycle → confirm recurring commission accrues (20%, within the
   6-month window).
5. Confirm commission stays pending through the 30-day hold, then becomes payable.
6. Refund the test subscription → confirm Rewardful **claws back / reverses** the
   commission.

Record results on TIM-1620 before marking done.
