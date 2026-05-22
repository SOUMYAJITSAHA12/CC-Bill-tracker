-- Run this once in Supabase SQL Editor: restores all cards + assigns "Father" profile

-- 1) Profiles table + column (safe if already applied)
create table if not exists card_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (household_id, name)
);

alter table cards
  add column if not exists profile_id uuid references card_profiles(id) on delete set null;

alter table card_profiles enable row level security;

-- 2) Father profile for your household
insert into card_profiles (household_id, name)
select h.id, 'Father'
from households h
limit 1
on conflict (household_id, name) do nothing;

-- 3) Reactivate every card and tag as Father
update cards c
set
  active = true,
  profile_id = p.id,
  updated_at = now()
from card_profiles p
where p.name = 'Father'
  and p.household_id = c.household_id;

-- 4) Dev anon policies (if you use SKIP_AUTH locally)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'card_profiles' and policyname = 'dev anon card_profiles'
  ) then
    create policy "dev anon card_profiles"
      on card_profiles for all to anon
      using (true) with check (true);
  end if;
end $$;

-- Verify
select c.nickname, c.bank, c.last4, c.active, p.name as profile
from cards c
left join card_profiles p on p.id = c.profile_id
order by c.nickname;
