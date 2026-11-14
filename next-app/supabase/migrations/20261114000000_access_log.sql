-- Access log: who opened whose dashboard (the Crew Medical Officer viewing a crew member's data).
-- Runs after 20261113000000_onboard_db.sql (it uses current_crew_id() and is_cmo() from there).
--
-- Write path: browsers never write. POST /api/access-log checks the user's token and their crew_members
-- role (only the CMO logs views, only as themselves, only of someone else) and inserts with the service role.
-- Read path: the CMO reads every entry; a crew member reads the entries about themselves.

create table public.access_log (
  id         uuid primary key,                                   -- made on the device; retries reuse it
  viewer     text not null references public.crew_members (id),
  patient    text not null references public.crew_members (id),
  at         timestamptz not null,
  synced_at  timestamptz not null default now(),
  constraint access_log_not_self check (viewer <> patient)
);

create index access_log_patient_time on public.access_log (patient, at desc);
create index access_log_time on public.access_log (at desc);

-- Append-only, like readings.
create function public.access_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'access_log is append-only: % is not allowed.', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger access_log_append_only
  before update or delete on public.access_log
  for each row execute function public.access_log_append_only();

revoke all on public.access_log from anon, authenticated;
grant select on public.access_log to authenticated;

alter table public.access_log enable row level security;

-- The CMO reads everything; a crew member reads who viewed their own data.
create policy access_log_read_cmo_or_patient on public.access_log
  for select to authenticated using (public.is_cmo() or patient = public.current_crew_id());

-- No insert / update / delete policies: with RLS on and no grants, clients cannot write.
