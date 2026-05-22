-- Run in Supabase SQL Editor (restores Father profile on all cards)

insert into card_profiles (household_id, name)
select id, 'Father'
from households
limit 1
on conflict (household_id, name) do nothing;

update cards c
set
  active = true,
  profile_id = p.id,
  updated_at = now()
from card_profiles p
where p.name = 'Father'
  and p.household_id = c.household_id;

select c.nickname, c.bank, c.last4, c.active, p.name as profile
from cards c
left join card_profiles p on p.id = c.profile_id
order by c.nickname;
