-- Onboard database for the crew health monitor.
--
-- Write path: browsers never write. POST /api/sync checks the user's token, confirms each reading
-- belongs to that user's crew member, re-scores it, and inserts it with the service role.
-- Clients (anon / authenticated) only read, and RLS limits what they see.
--
-- readings is append-only: inserts only, a correction is a new reading. A trigger rejects UPDATE and
-- DELETE for every role, the service role included (supabase/reset_demo.sql lifts it briefly).

-- ---------- Tables ----------

create table public.crew_members (
  id          text primary key,                      -- 'crew-01' … matches src/data/crew.json
  name        text not null,
  role        text not null check (role in ('crew', 'cmo')),
  mission     text not null,
  title       text,                                  -- job title, e.g. 'Flight engineer'
  launch_date date,
  user_id     uuid unique references auth.users (id) on delete set null  -- the demo login, linked by /api/demo-session
);

create table public.readings (
  id             uuid primary key,                   -- made on the device; retries reuse it
  crew_id        text not null references public.crew_members (id),
  kind           text not null check (kind in ('daily_vitals', 'stand_test')),
  recorded_at    timestamptz not null,
  payload        jsonb not null,
  status         text not null check (status in ('normal', 'watch', 'alert')),
  reasons        jsonb not null default '[]'::jsonb,
  engine_version text not null,
  synced_at      timestamptz not null default now()
);

create index readings_crew_kind_time on public.readings (crew_id, kind, recorded_at);
create index readings_flagged_recent on public.readings (recorded_at desc) where status in ('watch', 'alert');

create table public.baselines (
  crew_id text not null references public.crew_members (id),
  kind    text not null check (kind in ('daily_vitals', 'stand_test')),
  payload jsonb not null,
  source  text not null,
  primary key (crew_id, kind)
);

-- ---------- Append-only readings ----------

create function public.readings_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'readings is append-only: % is not allowed. Add a new reading instead.', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger readings_append_only
  before update or delete on public.readings
  for each row execute function public.readings_append_only();

-- ---------- Who is asking ----------

create function public.current_crew_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.crew_members where user_id = auth.uid()
$$;

create function public.is_cmo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where user_id = auth.uid() and role = 'cmo')
$$;

revoke all on function public.current_crew_id() from public, anon;
revoke all on function public.is_cmo() from public, anon;
grant execute on function public.current_crew_id() to authenticated;
grant execute on function public.is_cmo() to authenticated;

-- ---------- Privileges: clients read only ----------

revoke all on public.crew_members, public.readings, public.baselines from anon, authenticated;
grant select on public.crew_members, public.readings, public.baselines to authenticated;

-- ---------- Row level security ----------

alter table public.crew_members enable row level security;
alter table public.readings enable row level security;
alter table public.baselines enable row level security;

-- Names and roles of the crew, for the CMO cards and the header.
create policy crew_members_read on public.crew_members
  for select to authenticated using (true);

-- Crew read their own readings; the CMO reads everyone's.
create policy readings_read_own_or_cmo on public.readings
  for select to authenticated using (crew_id = public.current_crew_id() or public.is_cmo());

-- Same rule for preflight baselines.
create policy baselines_read_own_or_cmo on public.baselines
  for select to authenticated using (crew_id = public.current_crew_id() or public.is_cmo());

-- No insert / update / delete policies: with RLS on and no grants, clients cannot write.

-- ---------- Realtime (CMO live view); RLS above still applies to each subscriber ----------

alter publication supabase_realtime add table public.readings;
