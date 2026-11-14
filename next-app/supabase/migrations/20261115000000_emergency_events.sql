-- Emergency mode: one row per emergency ("crewmate has chest pain, then collapses"), with its timed events.
-- Runs after 20261114000000_access_log.sql (uses current_crew_id() and is_cmo() from 20261113000000_onboard_db.sql).
--
-- Write path: browsers never write. POST /api/emergency checks the user's token and their crew_members role:
--   * a new emergency may be reported by any signed-in crew member, for any patient, only as themselves
--     (the server rebuilds reporter_crew_id / reporter_name from the session);
--   * the reporter or the Crew Medical Officer may add events and end it; nobody else may change it.
-- Events are merged by event id and never removed or edited; ended_at is set once. `revision` lets the
-- server do compare-and-set updates, so two devices appending at the same time both keep their events.
-- Read path: the CMO reads all; crew read the ones where they are the patient or the reporter, and every
-- crew member reads the ones where the CMO is the patient (so the handoff summary is available to all).

create table public.emergency_events (
  id                uuid primary key,                                   -- made on the device; retries reuse it
  patient_crew_id   text references public.crew_members (id),           -- null: "someone else / not sure"
  reporter_crew_id  text not null references public.crew_members (id),
  reporter_name     text not null,
  flow              text not null check (flow in ('chest_pain', 'collapse')),
  environment       text not null check (environment in ('station', 'spacecraft', 'moon')),
  drill             boolean not null,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  events            jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  revision          integer not null default 1,
  updated_at        timestamptz not null default now(),
  constraint emergency_events_end_after_start check (ended_at is null or ended_at >= started_at)
);

create index emergency_events_started on public.emergency_events (started_at desc);
create index emergency_events_open on public.emergency_events (started_at desc) where ended_at is null;
create index emergency_events_patient on public.emergency_events (patient_crew_id, started_at desc);

-- Is this crew id the Crew Medical Officer? Security definer, like is_cmo().
create function public.is_cmo_crew(crew text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crew_members where id = crew and role = 'cmo')
$$;
revoke all on function public.is_cmo_crew(text) from public, anon;
grant execute on function public.is_cmo_crew(text) to authenticated;

revoke all on public.emergency_events from anon, authenticated;
grant select on public.emergency_events to authenticated;

alter table public.emergency_events enable row level security;

create policy emergency_events_read on public.emergency_events
  for select to authenticated using (
    public.is_cmo()
    or patient_crew_id = public.current_crew_id()
    or reporter_crew_id = public.current_crew_id()
    or public.is_cmo_crew(patient_crew_id)
  );

-- No insert / update / delete policies: with RLS on and no grants, clients cannot write.
