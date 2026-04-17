-- Household memory schema for Eve home-ops assistant
-- Apply in Supabase SQL editor. All tables RLS-protected, user-scoped.

-- Bills: recurring or one-off household bills
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  currency text default 'USD',
  due_date date,
  recurrence text, -- 'monthly' | 'quarterly' | 'annual' | 'once'
  vendor text,
  category text,
  status text default 'pending', -- 'pending' | 'paid' | 'overdue' | 'skipped'
  source text, -- 'manual' | 'inbox_scan' | 'import'
  source_ref text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists bills_user_due_idx on public.bills(user_id, due_date);
alter table public.bills enable row level security;
drop policy if exists bills_owner on public.bills;
create policy bills_owner on public.bills
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Subscriptions: recurring services (streaming, SaaS, memberships)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  currency text default 'USD',
  billing_cycle text, -- 'monthly' | 'annual' | 'weekly'
  next_charge_date date,
  vendor text,
  status text default 'active', -- 'active' | 'trial' | 'cancel_pending' | 'canceled'
  price_last_changed_at timestamptz,
  last_price numeric(12,2),
  flagged_for_review boolean default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists subs_user_next_idx on public.subscriptions(user_id, next_charge_date);
alter table public.subscriptions enable row level security;
drop policy if exists subs_owner on public.subscriptions;
create policy subs_owner on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Vendors: people and companies Eve interacts with on behalf of the household
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text, -- 'utility' | 'retailer' | 'service' | 'person'
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  created_at timestamptz default now()
);
alter table public.vendors enable row level security;
drop policy if exists vendors_owner on public.vendors;
create policy vendors_owner on public.vendors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Appliances / devices in the home (not smart-home devices — physical assets)
create table if not exists public.appliances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  model text,
  serial text,
  purchased_at date,
  warranty_expires_at date,
  location text,
  notes text,
  created_at timestamptz default now()
);
alter table public.appliances enable row level security;
drop policy if exists appliances_owner on public.appliances;
create policy appliances_owner on public.appliances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Routines: recurring household routines (bedtime mode, away mode, trash day)
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  schedule text, -- natural language or cron; Eve parses
  steps jsonb default '[]'::jsonb,
  enabled boolean default true,
  last_run_at timestamptz,
  created_at timestamptz default now()
);
alter table public.routines enable row level security;
drop policy if exists routines_owner on public.routines;
create policy routines_owner on public.routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Action history: transparency log for everything Eve does
create table if not exists public.action_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  summary text,
  input jsonb,
  output jsonb,
  status text not null default 'executed', -- 'pending_approval' | 'approved' | 'denied' | 'executed' | 'failed'
  requires_approval boolean default false,
  approved_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists action_history_user_created_idx
  on public.action_history(user_id, created_at desc);
alter table public.action_history enable row level security;
drop policy if exists action_history_owner on public.action_history;
create policy action_history_owner on public.action_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Preferences: household preferences (units, quiet hours, budget categories)
create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.preferences enable row level security;
drop policy if exists preferences_owner on public.preferences;
create policy preferences_owner on public.preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
