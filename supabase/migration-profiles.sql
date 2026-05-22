-- Run in Supabase SQL Editor (after schema.sql)

create table if not exists card_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (household_id, name)
);

create index if not exists idx_card_profiles_household on card_profiles(household_id);

alter table cards
  add column if not exists profile_id uuid references card_profiles(id) on delete set null;

alter table card_profiles enable row level security;

create policy "members manage card_profiles"
  on card_profiles for all
  using (household_id in (select public.user_household_ids()));

-- Local dev (anon) — add if using dev-local-policies.sql
create policy "dev anon card_profiles"
  on card_profiles for all to anon
  using (true) with check (true);
