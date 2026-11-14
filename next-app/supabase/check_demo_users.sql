-- READ-ONLY check of the demo logins. Select statements only: nothing is inserted, updated or deleted.
-- Run in the Supabase SQL editor after clicking each crew member's door once.
--
-- Expected: 4 rows. crew-03 (Lena Kowalski) is the only 'cmo'. Each person who has entered once has
-- linked = true and their demo e-mail (maya / tomas / lena / kwame .demo@example.com).

select
  m.id,
  m.name,
  m.role,
  m.title,
  m.user_id is not null as linked,
  u.email               as login_email,
  u.last_sign_in_at
from public.crew_members m
left join auth.users u on u.id = m.user_id
order by m.id;

-- Summary: expect crew_members = 4, cmo_count = 1, cmo_id = 'crew-03'.
select
  count(*)                                       as crew_members,
  count(*) filter (where role = 'cmo')           as cmo_count,
  string_agg(id, ', ') filter (where role = 'cmo') as cmo_id,
  count(*) filter (where user_id is not null)    as linked_logins
from public.crew_members;

-- Readings per person (seeded + synced), to see a new check-in from Tomas arrive.
select crew_id, kind, count(*) as readings, max(synced_at) as last_synced
from public.readings
group by crew_id, kind
order by crew_id, kind;
