# Coffee Shop Financial Model & SaaS Pricing Validation

**Published:** 2026-05-15  
**Author:** Data Analyst, Timberline IRB  
**Issue:** [TIM-526](/TIM/issues/TIM-526)

---

## 1. Coffee Shop Unit Economics Template

### Inputs (What a real owner knows on Day 1)

| Input | Example Value | Notes |
|-------|--------------|-------|
| Seats | 40 | Physical capacity |
| Avg ticket | $8.50 | Drink + pastry combo |
| Turns per day | 4 | Morning rush, lunch, afternoon, close |
| Operating days/year | 350 | 6 days/wk, some holidays |
| Rent (monthly) | $4,500 | Includes CAM/NNN if applicable |
| Labor (monthly) | $12,000 | 2-3 FTEs + PT baristas |
| COGS % | 28% | Specialty coffee industry benchmark |
| Marketing (monthly) | $500 | Local ads, social, loyalty |
| Utilities + misc (monthly) | $1,200 | Power, water, internet, supplies |

### Outputs (What the model calculates)

**Daily Revenue**
```
Daily revenue = Seats × Turns × Avg ticket × Occupancy rate
Example: 40 × 4 × $8.50 × 70% = $952/day
```

**Monthly Revenue**
```
Monthly revenue = Daily revenue × (Operating days / 12)
Example: $952 × 29.2 = $27,798/month
```

**Monthly Cost Breakdown**

| Cost | Amount |
|------|--------|
| COGS (28%) | $7,783 |
| Labor | $12,000 |
| Rent | $4,500 |
| Marketing | $500 |
| Utilities + misc | $1,200 *(adjustable in inputs)* |
| **Total costs** | **$25,983** |

**Net Margin**
```
Net margin = (Revenue - Costs) / Revenue
Example: ($27,798 - $25,983) / $27,798 = 6.5%
```

**Break-Even Daily Ticket Volume**
```
Contribution margin per ticket = Avg ticket × (1 − COGS%)
Example: $8.50 × (1 − 0.28) = $6.12/ticket

Fixed costs per month = Labor + Rent + Marketing + Utilities
Example: $12,000 + $4,500 + $500 + $1,200 = $18,200/month

Break-even tickets/day = Fixed costs ÷ (Contribution margin × Operating days/month)
Example: $18,200 ÷ ($6.12 × 29.2) = 102 tickets/day

Break-even daily revenue = 102 × $8.50 = $867/day
```

> **Why this formula matters:** COGS is a variable cost — it scales with every ticket sold. The simple "fixed costs ÷ daily revenue" formula ignores this and understates break-even by ~28%. The contribution-margin method gives the true number: the shop must cover its fixed costs with the *margin* on each ticket, not the full ticket price.

### The 5-Minute Owner Sanity Check

A real owner skips the model and asks three questions:
1. Am I doing at least 100 tickets a day? (break-even, using contribution-margin method)
2. Is my food cost under 30%? (COGS discipline)
3. Is labor under 35% of revenue? (the death zone is above 40%)

If all three are yes, the shop is viable. Timberline should frame every financial tool around these three questions first.

---

## 2. SaaS Pricing Validation

### When Does $49/Month Become a No-Brainer?

At a 6.5% net margin on $28K monthly revenue, the shop earns **~$1,800/month net**.

$49/month = **2.7% of net profit**. That is noise, not a decision.

The pricing only feels like a luxury to an owner who:
- Is below break-even (losing money daily)
- Has never tracked their COGS and doesn't know their margin
- Doesn't yet believe software will change their outcome

**Threshold:** At margins above 4% on revenue over $20K/month, $49 is an obvious buy. Below 4% margin, the owner needs to see the ROI case immediately -- not eventually.

### ROI Case: Time Saved

| Scenario | Hours saved/week | Owner hourly value | Monthly value saved |
|----------|-------------------|-------------------|---------------------|
| Scheduling + HR admin | 2 hrs | $40 | $320 |
| Menu costing + ordering | 1.5 hrs | $40 | $240 |
| Staff training (onboarding) | 1 hr avg | $40 | $160 |
| **Total** | **4.5 hrs** | | **$720/month** |

*Note: Monthly values use a conservative 4-week month. At the actual 4.33-week average, total value is ~$779/month — the $720 figure is intentionally understated.*

At $49/month, the ROI is **14.7x** on time alone. At $99/month, it is **7.3x**.

A real owner doesn't think in ROI ratios. Frame it differently: "Timberline saves you roughly a half-day of work every week. Most owners charge themselves $40/hour. That's $720 in time. You pay us $49."

### ROI Case: Avoiding One Bad Hire

Average cost of a bad barista hire in specialty coffee:
- Training time wasted: 20 hrs at $40 = $800
- Turnover recruiting cost: $500-$1,500
- Lost productivity during gap: $200-$400
- **Total: $1,500-$2,700 per bad hire**

If Timberline's hiring module prevents even one bad hire per year:
- Annual value: $1,500-$2,700
- Monthly equivalent: $125-$225
- $99/month subscription = **justified by one avoided hire every 9 months**

### Pricing Tiers Summary

| Plan | Price | Justified when... |
|------|-------|-------------------|
| Starter | $49/mo | Owner is profitable, wants to professionalize operations |
| Growth | $99/mo | Owner has 2+ locations or wants hiring/HR tools |
| Scale | Custom | Multi-unit operators with 5+ locations |

**Recommendation:** Lead with the Starter at $49. Don't discount -- owners who can't see the value at $49 won't see it at $29 either. Fix the value communication, not the price.

---

## 3. Cohort Analysis Framework

Five metrics that tell you if customers are getting real value. Each mapped to where it lives in the Supabase schema.

### Metric 1: Activation Rate

**Definition:** % of new signups who complete onboarding AND start their first module within 7 days.

**Why it matters:** Activation predicts retention. An owner who doesn't engage in week 1 almost never comes back.

**Target:** >60% of signups activate within 7 days.

**Supabase measurement:**
```sql
-- Activation = completed onboarding + started ≥1 module within 7 days of signup
SELECT
  DATE_TRUNC('week', u.created_at) AS cohort_week,
  COUNT(DISTINCT u.id) AS signups,
  COUNT(DISTINCT CASE
    WHEN mp.started_at <= u.created_at + INTERVAL '7 days'
    THEN u.id
  END) AS activated,
  ROUND(
    COUNT(DISTINCT CASE WHEN mp.started_at <= u.created_at + INTERVAL '7 days' THEN u.id END)::numeric
    / NULLIF(COUNT(DISTINCT u.id), 0) * 100, 1
  ) AS activation_rate_pct
FROM auth.users u
LEFT JOIN module_progress mp ON mp.user_id = u.id
GROUP BY 1
ORDER BY 1 DESC;
```

**Tables needed:** `auth.users`, `module_progress` (columns: `user_id`, `started_at`)

### Metric 2: Engagement Rate

**Definition:** % of activated users who complete at least one module per week in any given week.

**Why it matters:** Engagement shows whether the product is part of the owner's weekly routine, not just a one-time visit.

**Target:** >40% weekly engagement among activated users (industry SaaS median is 25-35%; coffee owners are busier than average).

**Supabase measurement:**
```sql
-- Weekly engagement rate = weekly active users / total activated user base
WITH activated_users AS (
  -- Activated = started ≥1 module within 7 days of signup
  SELECT DISTINCT u.id
  FROM auth.users u
  JOIN module_progress mp ON mp.user_id = u.id
  WHERE mp.started_at <= u.created_at + INTERVAL '7 days'
)
SELECT
  DATE_TRUNC('week', mp.completed_at) AS week,
  COUNT(DISTINCT mp.user_id) AS weekly_active_users,
  (SELECT COUNT(*) FROM activated_users) AS activated_base,
  ROUND(
    COUNT(DISTINCT mp.user_id)::numeric
    / NULLIF((SELECT COUNT(*) FROM activated_users), 0) * 100, 1
  ) AS engagement_rate_pct
FROM module_progress mp
JOIN activated_users au ON au.id = mp.user_id
WHERE mp.completed_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
```

**Tables needed:** `auth.users`, `module_progress` (columns: `user_id`, `started_at`, `completed_at`)

### Metric 3: Retention Rate (30-day)

**Definition:** % of users from a signup cohort who are still active 30 days later (defined as: logged in + any module activity in the 30-day window).

**Why it matters:** Retention is the single most important health signal for a subscription SaaS. If retention is bad, no amount of acquisition fixes it.

**Target:** >50% day-30 retention. Industry median for SMB SaaS is 40-60%.

**Supabase measurement:**
```sql
-- 30-day cohort retention
SELECT
  DATE_TRUNC('month', u.created_at) AS cohort_month,
  COUNT(DISTINCT u.id) AS cohort_size,
  COUNT(DISTINCT CASE
    WHEN mp.completed_at BETWEEN u.created_at + INTERVAL '23 days'
                              AND u.created_at + INTERVAL '37 days'
    THEN u.id
  END) AS retained_at_30d,
  ROUND(
    COUNT(DISTINCT CASE
      WHEN mp.completed_at BETWEEN u.created_at + INTERVAL '23 days'
                                AND u.created_at + INTERVAL '37 days'
      THEN u.id
    END)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100, 1
  ) AS retention_30d_pct
FROM auth.users u
LEFT JOIN module_progress mp ON mp.user_id = u.id
WHERE u.created_at <= NOW() - INTERVAL '37 days'
GROUP BY 1
ORDER BY 1 DESC;
```

**Tables needed:** `auth.users`, `module_progress`

### Metric 4: Expansion Rate

**Definition:** % of paying customers who upgrade from Starter ($49) to Growth ($99) or add a second location within 90 days.

**Why it matters:** Expansion revenue is the clearest signal that customers have seen results and want more. It also dramatically improves unit economics (NRR > 100% means the business grows even with some churn).

**Target:** >15% of customers expand within 90 days. Even 10% is healthy for a new product.

**Supabase measurement:**
```sql
-- Customers who upgraded within 90 days of first charge
SELECT
  DATE_TRUNC('month', first_charge.created_at) AS cohort_month,
  COUNT(DISTINCT first_charge.customer_id) AS paying_customers,
  COUNT(DISTINCT upgrade.customer_id) AS expanded,
  ROUND(
    COUNT(DISTINCT upgrade.customer_id)::numeric
    / NULLIF(COUNT(DISTINCT first_charge.customer_id), 0) * 100, 1
  ) AS expansion_rate_pct
FROM (
  SELECT customer_id, MIN(created_at) AS created_at
  FROM stripe_charges
  WHERE status = 'succeeded'
  GROUP BY customer_id
) first_charge
LEFT JOIN (
  SELECT customer_id, MIN(created_at) AS created_at
  FROM stripe_subscriptions
  WHERE plan_amount > 4900  -- cents, >$49 = upgrade
  GROUP BY customer_id
) upgrade ON upgrade.customer_id = first_charge.customer_id
  AND upgrade.created_at <= first_charge.created_at + INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 DESC;
```

**Tables needed:** `stripe_charges`, `stripe_subscriptions` (or equivalent Supabase Stripe sync tables)

### Metric 5: Advocacy Rate (Net Promoter Proxy)

**Definition:** % of active users who share a referral link OR whose account was created via a referral code from an existing customer.

**Why it matters:** Word of mouth is the primary acquisition channel for local business owners. An owner who recommends Timberline to a neighboring shop is the strongest growth signal possible.

**Target:** >10% of active users generate at least one referral per quarter.

**Supabase measurement:**
```sql
-- Users who generated a referral (assuming referral_code table)
SELECT
  DATE_TRUNC('quarter', u.created_at) AS quarter,
  COUNT(DISTINCT u.id) AS active_users,
  COUNT(DISTINCT r.referrer_user_id) AS advocates,
  ROUND(
    COUNT(DISTINCT r.referrer_user_id)::numeric
    / NULLIF(COUNT(DISTINCT u.id), 0) * 100, 1
  ) AS advocacy_rate_pct
FROM auth.users u
LEFT JOIN referrals r ON r.referrer_user_id = u.id
  AND r.created_at BETWEEN DATE_TRUNC('quarter', NOW() - INTERVAL '3 months')
                        AND DATE_TRUNC('quarter', NOW())
GROUP BY 1
ORDER BY 1 DESC;
```

**Tables needed:** `auth.users`, `referrals` (columns: `referrer_user_id`, `referred_user_id`, `created_at`) -- **this table needs to be created if referral tracking is not yet in the schema**

---

## Schema Requirements

The following tables/columns are needed for full cohort tracking. Items marked **[MISSING]** need to be added.

| Table | Required columns | Status |
|-------|-----------------|--------|
| `auth.users` | `id`, `created_at` | Built-in Supabase |
| `module_progress` | `user_id`, `module_id`, `started_at`, `completed_at` | Verify exists |
| `stripe_charges` | `customer_id`, `amount`, `status`, `created_at` | Needs Stripe sync |
| `stripe_subscriptions` | `customer_id`, `plan_amount`, `status`, `created_at` | Needs Stripe sync |
| `stripe_customer_mapping` | `user_id` (UUID), `stripe_customer_id` (cus_XXXX) | **[MISSING]** |
| `referrals` | `referrer_user_id`, `referred_user_id`, `created_at` | **[MISSING]** |

---

## North Star Metric Proposal

**Weekly Active Modules per Paying Customer**

Definition: For paying customers active in the past 7 days, the average number of distinct modules they interacted with (started or progressed).

Why this is the right North Star:
- It measures value delivery, not just login activity
- It separates paying customers (committed) from free-tier explorers
- It is sensitive to both engagement decline and product expansion
- A rising number means owners are building habits; a falling number is an early churn signal

Target at 90 days post-launch: **2.5 modules/week/paying customer**

```sql
-- stripe_charges.customer_id is a Stripe-format ID (cus_XXXX)
-- module_progress.user_id is a Supabase UUID
-- Join through stripe_customer_mapping to bridge the two ID spaces
SELECT
  DATE_TRUNC('week', mp.started_at) AS week,
  COUNT(DISTINCT mp.module_id) / NULLIF(COUNT(DISTINCT mp.user_id), 0.0) AS avg_modules_per_paying_user
FROM module_progress mp
JOIN stripe_customer_mapping scm ON scm.user_id = mp.user_id
JOIN stripe_charges sc ON sc.customer_id = scm.stripe_customer_id AND sc.status = 'succeeded'
WHERE mp.started_at >= NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;
```

**Schema note:** `stripe_customer_mapping` must store both `user_id` (Supabase UUID) and `stripe_customer_id` (Stripe `cus_XXXX`). Add this table to the schema requirements below if not already present.

---

## Baseline Numbers (To Fill In)

The following requires a first read of the Supabase database. Data Analyst will pull these in the next heartbeat once Supabase access is confirmed.

| Metric | Value | As of |
|--------|-------|-------|
| Total signups | TBD | 2026-05-15 |
| Activated users (7-day) | TBD | 2026-05-15 |
| Paying customers | TBD | 2026-05-15 |
| Activation rate | TBD | 2026-05-15 |
| 30-day retention | TBD | 2026-05-15 |
| MRR | TBD | 2026-05-15 |

---

## Daily Briefing Block (Proposed Format)

For the CEO/CoS morning briefing, these numbers in this order:

```
TIMBERLINE DAILY // 2026-MM-DD

Signups (last 7d):    XX  (+/-X vs prev week)
Paying customers:     XX  (+/-X vs prev week)
MRR:                  $X,XXX
Activation rate (7d): XX%
Module completions:   XX  (XX avg per active user)
Stripe failed:        XX  (needs follow-up)
```

One row per metric. No paragraphs. If a number is yellow (below target), add a single word: WHY.
