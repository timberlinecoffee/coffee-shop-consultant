# My Coffee Shop Consultant — Timberline Coffee School

An AI-powered coffee shop planning platform built on Next.js, Supabase, and Vercel.

## Tech Stack

- **Frontend:** Next.js 15 (App Router, Server Components)
- **Backend/Database:** Supabase (PostgreSQL, Auth, Storage)
- **Hosting:** Vercel
- **Payments:** Stripe (subscriptions + credit top-ups)
- **AI:** Anthropic API (Claude Sonnet/Opus)
- **Styling:** Tailwind CSS v4 + Poppins font

## Local Development Setup

### 1. Clone the repo

```bash
git clone https://github.com/timberlinecoffee/coffee-shop-consultant.git
cd coffee-shop-consultant
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. In the SQL editor, run the full schema from `supabase/schema.sql`
3. In Authentication settings, enable Google OAuth and configure the redirect URL:
   - `http://localhost:3000/auth/callback` (development)
   - `https://your-app.vercel.app/auth/callback` (production)

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings > API |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard > Developers > API keys |
| `STRIPE_SECRET_KEY` | Stripe Dashboard > Developers > API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Webhooks |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for dev |

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
  app/
    page.tsx              # Landing page
    layout.tsx            # Root layout (Poppins font, metadata)
    globals.css           # Global styles + Timberline design tokens
    login/                # Auth pages (Google OAuth + email/password)
    auth/callback/        # Supabase OAuth callback handler
    dashboard/            # User's plan overview
    plan/                 # Module workspaces (1-8)
    account/              # User settings and billing
  lib/
    supabase/
      client.ts           # Browser Supabase client
      server.ts           # Server-side Supabase client
  middleware.ts           # Auth middleware (protects /dashboard, /plan, /account)
supabase/
  schema.sql              # Full database schema with RLS policies
```

## Design System

- **Primary:** `#155e63` (teal)
- **Secondary:** `#76b39d` (sage)
- **Background:** `#faf9f7` (warm off-white)
- **Light grey:** `#efefef`
- **Dark grey:** `#afafaf`
- **Font:** Poppins (all weights)
- **No dark mode**

## Database Schema

See `supabase/schema.sql` for the complete schema. Tables:

- `users` — extends Supabase auth, stores subscription status, readiness score
- `coffee_shop_plans` — one plan per user (expandable to multiple)
- `module_responses` — per-section user inputs and AI feedback
- `ai_conversations` — full conversation history per module
- `equipment_lists` — JSON array of equipment items
- `financial_models` — startup costs, monthly projections, scenarios
- `cost_tracker` — projected vs. actual costs
- `milestones` — timeline with auto-generated and custom milestones
- `menu_items` — menu with COGS and margin tracking
- `vendors` — supplier directory
- `subscriptions` — Stripe subscription state
- `credit_transactions` — AI credit ledger

All tables have Row Level Security (RLS) enabled. Users can only access their own data.

## Deployment

The app deploys to Vercel automatically on push to `main`.

1. Connect the GitHub repo to a new Vercel project
2. Add all environment variables from `.env.example` to Vercel project settings
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL
4. Add the Vercel deployment URL to Supabase Auth redirect URLs

## Stripe Setup

1. Create products and prices in Stripe Dashboard:
   - Builder Monthly: $49/month
   - Builder Annual: $39/month ($468/year)
   - Accelerator Monthly: $99/month
   - Accelerator Annual: $79/month ($948/year)
   - Credit Top-Up: $10 one-time (50 credits)
2. Set up a webhook endpoint pointing to `/api/webhooks/stripe`
3. Subscribe to: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
