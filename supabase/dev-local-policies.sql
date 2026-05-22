-- Local dev only (SKIP_AUTH without service_role key).
-- Run in Supabase SQL Editor AFTER schema.sql if you only have the publishable/anon key.

create policy "dev anon households"
  on households for all to anon
  using (true) with check (true);

create policy "dev anon household_members"
  on household_members for all to anon
  using (true) with check (true);

drop policy if exists "dev anon card_profiles" on card_profiles;
create policy "dev anon card_profiles"
  on card_profiles for all to anon
  using (true) with check (true);

create policy "dev anon cards"
  on cards for all to anon
  using (true) with check (true);

create policy "dev anon bills"
  on bills for all to anon
  using (true) with check (true);

create policy "dev anon fetch_log"
  on fetch_log for all to anon
  using (true) with check (true);
