-- CC Bill Tracker — run in Supabase SQL Editor

-- Household (one group for your 4–5 users)
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  created_at timestamptz default now()
);

-- Link auth.users to household
create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz default now(),
  unique (household_id, user_id)
);

create table if not exists card_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (household_id, name)
);

create index if not exists idx_card_profiles_household on card_profiles(household_id);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid references card_profiles(id) on delete set null,
  nickname text not null,
  bank text not null,
  last4 text not null check (char_length(last4) = 4),
  mobile text not null,
  billing_date int default 1 check (billing_date between 1 and 28),
  due_date_day int default 20 check (due_date_day between 1 and 28),
  credit_limit numeric default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cards_household on cards(household_id) where active;

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  bill_date date,
  due_date date not null,
  amount numeric not null default 0,
  amount_paid numeric not null default 0,
  min_due numeric default 0,
  status text not null default 'UNPAID' check (status in ('UNPAID', 'PARTIAL', 'PAID')),
  fetched_via text default 'BILLDESK_API',
  created_at timestamptz default now(),
  paid_at timestamptz
);

create index if not exists idx_bills_card_due on bills(card_id, due_date);
create unique index if not exists idx_bills_card_due_unpaid
  on bills(card_id, due_date) where (status = 'UNPAID');

create table if not exists fetch_log (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references cards(id) on delete set null,
  run_id text,
  portal text default 'billdesk',
  status text not null,
  amount numeric default 0,
  error text,
  fetched_at timestamptz default now()
);

create index if not exists idx_fetch_log_card on fetch_log(card_id, fetched_at desc);

-- RLS
alter table households enable row level security;
alter table household_members enable row level security;
alter table card_profiles enable row level security;
alter table cards enable row level security;
alter table bills enable row level security;
alter table fetch_log enable row level security;

create or replace function public.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from household_members where user_id = auth.uid();
$$;

create policy "members read household"
  on households for select
  using (id in (select public.user_household_ids()));

create policy "users create household"
  on households for insert
  with check (true);

create policy "users join household"
  on household_members for insert
  with check (user_id = auth.uid());

create policy "members read membership"
  on household_members for select
  using (household_id in (select public.user_household_ids()));

create policy "members manage card_profiles"
  on card_profiles for all
  using (household_id in (select public.user_household_ids()));

create policy "members manage cards"
  on cards for all
  using (household_id in (select public.user_household_ids()));

create policy "members manage bills"
  on bills for all
  using (
    card_id in (
      select id from cards where household_id in (select public.user_household_ids())
    )
  );

create policy "members read fetch_log"
  on fetch_log for select
  using (
    card_id is null or card_id in (
      select id from cards where household_id in (select public.user_household_ids())
    )
  );

-- Service role bypasses RLS for batch fetch worker
