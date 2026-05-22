-- Fix: "new row violates row-level security policy for table card_profiles"
-- Run in Supabase SQL Editor (local dev with SKIP_AUTH + anon key)

drop policy if exists "dev anon card_profiles" on card_profiles;

create policy "dev anon card_profiles"
  on card_profiles for all to anon
  using (true) with check (true);
