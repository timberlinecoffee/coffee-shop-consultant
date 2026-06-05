# AI turn metrics — CEO weekly queries

Per TIM-2361 (parent: TIM-2306). The `ai_turn_metrics` table records one row per
Anthropic turn from the Sonnet-routed deep-research surfaces (benchmark-price,
area-analysis, and any future deep-research entry points). Use these queries to
validate the ~$5–7/mo Pro COGS estimate at launch and to tune routing thresholds
with real data.

Run from Supabase SQL editor as the service role (RLS denies authenticated reads).

## 1. Cost-per-plan-tier weekly roll-up

The single query the issue asked for — group by `plan_tier` and `model_used`,
sum credits charged and USD cost, count turns, over the last 7 days. Schedule
weekly (Monday morning) and paste the result into the CEO dashboard thread.

```sql
SELECT
  plan_tier,
  model_used,
  COUNT(*)                                      AS turns,
  SUM(credits_charged)                          AS credits,
  ROUND(SUM(cost_usd_estimate)::numeric, 4)     AS usd,
  ROUND(AVG(cost_usd_estimate)::numeric, 6)     AS usd_per_turn,
  SUM(output_tokens)                            AS output_tokens,
  SUM(input_tokens_uncached)                    AS input_tokens_uncached,
  SUM(input_tokens_cached_read)                 AS input_tokens_cached_read,
  SUM(web_search_requests)                      AS web_searches
FROM public.ai_turn_metrics
WHERE created_at >= now() - interval '7 days'
GROUP BY plan_tier, model_used
ORDER BY plan_tier, model_used;
```

## 2. Pro COGS per Pro user, last 30 days

Sanity-check the $5–7/mo Pro target by dividing total Sonnet spend by distinct
Pro users (closer estimate of per-seat COGS at the AI layer).

```sql
SELECT
  COUNT(DISTINCT user_id)                       AS pro_users_with_turns,
  ROUND(SUM(cost_usd_estimate)::numeric, 2)     AS total_usd,
  ROUND(
    (SUM(cost_usd_estimate) / NULLIF(COUNT(DISTINCT user_id), 0))::numeric,
    4
  )                                             AS usd_per_user_30d
FROM public.ai_turn_metrics
WHERE plan_tier = 'pro'
  AND created_at >= now() - interval '30 days';
```

## 3. Route-level health (drift watch)

If one route starts producing far more or far fewer credits than expected,
something changed upstream (prompt length blew up, max_tokens raised, etc.).
Pin a per-route baseline weekly so a 2× drift is visible at a glance.

```sql
SELECT
  route,
  model_used,
  COUNT(*)                                      AS turns,
  ROUND(AVG(output_tokens)::numeric, 1)         AS avg_output_tokens,
  ROUND(AVG(credits_charged)::numeric, 2)       AS avg_credits,
  ROUND(AVG(cost_usd_estimate)::numeric, 6)     AS avg_usd
FROM public.ai_turn_metrics
WHERE created_at >= now() - interval '7 days'
GROUP BY route, model_used
ORDER BY route;
```

## 4. Sonnet vs Haiku — quick before/after check

After flipping a new route to Sonnet (or rolling one back), this confirms the
~2× credit-charge multiplier landed for the same kind of turn.

```sql
SELECT
  model_used,
  COUNT(*)                                      AS turns,
  ROUND(AVG(output_tokens)::numeric, 1)         AS avg_output_tokens,
  ROUND(AVG(credits_charged)::numeric, 2)       AS avg_credits,
  ROUND(AVG(cost_usd_estimate)::numeric, 6)     AS avg_usd
FROM public.ai_turn_metrics
WHERE route = '/api/workspaces/menu-pricing/benchmark-price'
  AND created_at >= now() - interval '14 days'
GROUP BY model_used
ORDER BY model_used;
```

## Schema reference

| column                    | type           | notes                                                                 |
|--------------------------|----------------|-----------------------------------------------------------------------|
| id                       | uuid           | PK                                                                    |
| route                    | text           | e.g. `/api/workspaces/menu-pricing/benchmark-price`                   |
| model_used               | text           | `claude-haiku-4-5-20251001` or `claude-sonnet-4-6`                    |
| input_tokens_uncached    | int            | Fresh input tokens (excludes cache reads).                            |
| input_tokens_cached_read | int            | Cache reads (bill at 0.1× input rate).                                |
| input_tokens_cache_create| int            | Cache writes (bill at 1.25× input rate).                              |
| output_tokens            | int            | Output tokens generated.                                              |
| web_search_requests      | int            | Hosted web searches (≈ $0.01 each).                                   |
| tool_calls               | int            | Discrete tool actions.                                                |
| credits_charged          | int            | Final credits debited (see `src/lib/credits/cost.ts`).                |
| cost_usd_estimate        | numeric(12,6)  | USD at the Anthropic price table in effect when the row was written.  |
| user_id                  | uuid           | FK → users; NULL only on legacy / unauthenticated turns.              |
| plan_tier                | text           | `pro` / `starter` / `free_trial` / `beta_waived` / `free` / `unknown` |
| created_at               | timestamptz    | default now()                                                         |
