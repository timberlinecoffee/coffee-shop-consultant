-- Coffee Shop Consultant Platform — Initial Schema
-- Run this in the Supabase SQL editor after creating your project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users (extends Supabase auth.users)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  avatar_url text,
  subscription_status text not null default 'free_trial' check (subscription_status in ('free_trial', 'active', 'cancelled', 'expired')),
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'builder', 'accelerator')),
  ai_credits_remaining integer not null default 0,
  target_opening_date date,
  readiness_score integer not null default 0 check (readiness_score between 0 and 100),
  onboarding_completed boolean not null default false,
  onboarding_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Coffee shop plans
create table public.coffee_shop_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_name text not null default 'My Coffee Shop',
  current_module integer not null default 1 check (current_module between 1 and 8),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Module responses
create table public.module_responses (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  module_number integer not null check (module_number between 1 and 8),
  section_key text not null,
  response_data jsonb not null default '{}',
  ai_feedback jsonb not null default '{}',
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  unique (plan_id, module_number, section_key)
);

-- AI conversations
create table public.ai_conversations (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  module_number integer not null check (module_number between 1 and 8),
  section_key text,
  messages jsonb not null default '[]',
  credits_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Equipment lists
create table public.equipment_lists (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade unique,
  items jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- Financial models
create table public.financial_models (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade unique,
  startup_costs jsonb not null default '{}',
  monthly_projections jsonb not null default '{}',
  revenue_scenarios jsonb not null default '{}',
  break_even_analysis jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Cost tracker
create table public.cost_tracker (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  item_name text not null,
  category text not null check (category in ('buildout', 'equipment', 'inventory', 'licenses', 'marketing', 'other')),
  projected_cost decimal(12,2) not null default 0,
  actual_cost decimal(12,2),
  status text not null default 'planned' check (status in ('planned', 'purchased', 'paid')),
  date_incurred date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Milestones
create table public.milestones (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  title text not null,
  description text,
  target_date date not null,
  completed_at timestamptz,
  module_number integer check (module_number between 1 and 8),
  is_auto_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Menu items
create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  name text not null,
  category text not null check (category in ('espresso', 'brewed', 'food', 'retail', 'seasonal')),
  recipe jsonb not null default '{}',
  cogs decimal(8,2) not null default 0,
  price decimal(8,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vendors
create table public.vendors (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.coffee_shop_plans(id) on delete cascade,
  company_name text not null,
  category text not null check (category in ('roaster', 'equipment', 'contractor', 'pos', 'insurance', 'other')),
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  status text not null default 'researching' check (status in ('researching', 'contacted', 'quoted', 'selected', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subscriptions
create table public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  tier text not null check (tier in ('builder', 'accelerator')),
  status text not null check (status in ('active', 'cancelled', 'past_due', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Credit transactions
create table public.credit_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  type text not null check (type in ('monthly_allocation', 'purchase', 'usage')),
  description text not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security on all tables
alter table public.users enable row level security;
alter table public.coffee_shop_plans enable row level security;
alter table public.module_responses enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.equipment_lists enable row level security;
alter table public.financial_models enable row level security;
alter table public.cost_tracker enable row level security;
alter table public.milestones enable row level security;
alter table public.menu_items enable row level security;
alter table public.vendors enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_transactions enable row level security;

-- RLS Policies

-- Users: can only read/update their own row
create policy "Users can view own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.users for insert with check (auth.uid() = id);

-- Coffee shop plans: users own their plans
create policy "Users can manage own plans" on public.coffee_shop_plans for all using (auth.uid() = user_id);

-- Module responses: via plan ownership
create policy "Users can manage own module responses" on public.module_responses for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- AI conversations: via plan ownership
create policy "Users can manage own ai conversations" on public.ai_conversations for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Equipment lists: via plan ownership
create policy "Users can manage own equipment lists" on public.equipment_lists for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Financial models: via plan ownership
create policy "Users can manage own financial models" on public.financial_models for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Cost tracker: via plan ownership
create policy "Users can manage own cost tracker" on public.cost_tracker for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Milestones: via plan ownership
create policy "Users can manage own milestones" on public.milestones for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Menu items: via plan ownership
create policy "Users can manage own menu items" on public.menu_items for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Vendors: via plan ownership
create policy "Users can manage own vendors" on public.vendors for all
  using (exists (select 1 from public.coffee_shop_plans where id = plan_id and user_id = auth.uid()));

-- Subscriptions: users can view their own
create policy "Users can view own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);

-- Credit transactions: users can view their own
create policy "Users can view own credit transactions" on public.credit_transactions for select using (auth.uid() = user_id);

-- Auto-create user profile on sign-up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger handle_users_updated_at before update on public.users for each row execute procedure public.handle_updated_at();
create trigger handle_plans_updated_at before update on public.coffee_shop_plans for each row execute procedure public.handle_updated_at();
create trigger handle_module_responses_updated_at before update on public.module_responses for each row execute procedure public.handle_updated_at();
create trigger handle_ai_conversations_updated_at before update on public.ai_conversations for each row execute procedure public.handle_updated_at();
create trigger handle_equipment_lists_updated_at before update on public.equipment_lists for each row execute procedure public.handle_updated_at();
create trigger handle_financial_models_updated_at before update on public.financial_models for each row execute procedure public.handle_updated_at();
create trigger handle_cost_tracker_updated_at before update on public.cost_tracker for each row execute procedure public.handle_updated_at();
create trigger handle_milestones_updated_at before update on public.milestones for each row execute procedure public.handle_updated_at();
create trigger handle_menu_items_updated_at before update on public.menu_items for each row execute procedure public.handle_updated_at();
create trigger handle_vendors_updated_at before update on public.vendors for each row execute procedure public.handle_updated_at();
create trigger handle_subscriptions_updated_at before update on public.subscriptions for each row execute procedure public.handle_updated_at();
