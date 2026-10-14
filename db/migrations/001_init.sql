-- AI Use Case Builder: initial schema.
-- Runs on Supabase Postgres in production and on PGlite (embedded Postgres) for local work.
-- Every table has a UUID primary key plus created_at and updated_at.

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Events --------------------------------------------------------------------

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null,
  venue text,
  starts_at timestamptz,
  access_opens_at timestamptz,
  access_closes_at timestamptz,
  plans_due_date date,
  current_stage text not null default 'arrival'
    check (current_stage in ('arrival','poll','problems','shortlist','golden','next_steps','done')),
  timer_ends_at timestamptz,
  timer_paused_remaining_s int,
  poll_open boolean not null default false,
  ai_enabled boolean not null default false,
  score_weights jsonb not null default '{"ready":40,"value":40,"foundation":20}',
  stuck_threshold_min int not null default 8,
  status text not null default 'setup' check (status in ('setup','live','closed')),
  booking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staff ---------------------------------------------------------------------
-- id equals the Supabase auth user id once the person has signed in.
-- Foreign keys use ON UPDATE CASCADE so the id can be bound on first sign in.

create table staff (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null check (role in ('admin','facilitator')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_email_key on staff (lower(email));

-- Tables (the physical tables in the room) ---------------------------------

create table tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  number int not null,
  table_token text not null unique check (length(table_token) >= 20),
  facilitator_id uuid references staff(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, number)
);

-- Companies and people ------------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  table_id uuid references tables(id) on delete set null,
  name text not null,
  website text,
  sector text,
  size_band text check (size_band in ('1-19','20-49','50-199','200+')),
  state text,
  is_walk_in boolean not null default false,
  is_locked boolean not null default false,
  flags jsonb not null default '{}',
  hubspot_company_id text,
  hubspot_note_id text,
  hubspot_task_id text,
  golden_problem_id uuid,
  shortlist_confirmed_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_event_name_key on companies (event_id, lower(name));
create index companies_table_idx on companies (table_id);

create table people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  role text,
  email text,
  is_walk_in boolean not null default false,
  marketing_consent boolean not null default false,
  consent_text text,
  consent_at timestamptz,
  hubspot_contact_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index people_company_idx on people (company_id);
create index people_email_idx on people (lower(email));

create table device_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  device_label text,
  expires_at timestamptz,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_sessions_person_idx on device_sessions (person_id);

-- Warm-up poll --------------------------------------------------------------

create table poll_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  position int not null,
  text text not null,
  options jsonb not null default '[]',
  type text not null check (type in ('single','scale')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table poll_responses (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references poll_questions(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, person_id)
);

-- Problems, shortlist and golden draft --------------------------------------

create table problems (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  position int not null default 1,
  title text not null default '' check (length(title) <= 150),
  today_state text,
  future_state text,
  type text check (type in ('paperwork_compliance','lab_data_spreadsheets','unused_data',
    'slow_manual_processing','too_slow_to_use','hard_to_explain','predict_not_react','systems_do_not_talk')),
  affected_role text,
  frequency text,
  data_ready int check (data_ready between 1 and 5),
  value int check (value between 1 and 5),
  fix_type text check (fix_type in ('prediction','clean_and_join','dashboard','document_automation')),
  builds_foundation boolean not null default false,
  score int not null default 0,
  shortlisted boolean not null default false,
  shortlist_overridden boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index problems_company_idx on problems (company_id);

alter table companies add constraint companies_golden_problem_fk
  foreign key (golden_problem_id) references problems(id) on delete set null;

create table shortlist_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  staff_id uuid references staff(id) on update cascade on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table golden_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  problem_id uuid not null references problems(id) on delete cascade,
  first_project text,
  metric text,
  baseline text,
  target text,
  data_location text,
  sample_access text,
  approval_level text,
  owner text,
  check_mvp boolean not null default false,
  check_collab boolean not null default false,
  check_metric boolean not null default false,
  check_data boolean not null default false,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, problem_id)
);

create table next_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  choice text check (choice in ('followup','funding','plan_only','not_now')),
  start_timing text,
  extra_contact text,
  submitted_by uuid references people(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Team side -----------------------------------------------------------------

create table facilitator_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  decision_maker text check (decision_maker in ('yes','no','unsure')),
  lead_rating text check (lead_rating in ('hot','warm','cold')),
  funding_fit text,
  signals text,
  notes text,
  next_action text,
  action_owner text,
  action_due date,
  updated_by uuid references staff(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table final_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft_received'
    check (status in ('draft_received','in_review','ready','sent','opened')),
  title text,
  first_project text,
  metric text,
  baseline text,
  target text,
  recommendation text,
  risks text,
  pdf_path text,
  sent_at timestamptz,
  opened_at timestamptz,
  author_id uuid references staff(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, version)
);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  field text not null,
  input jsonb,
  output text,
  accepted boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  actor_type text not null check (actor_type in ('participant','staff','system')),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  diff jsonb,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_log_event_idx on audit_log (event_id, at desc);
create index audit_log_action_idx on audit_log (event_id, action);

create table hubspot_sync_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  run_by uuid references staff(id) on update cascade on delete set null,
  preview jsonb,
  result jsonb,
  at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supporting tables (not in the spec's model, needed to run it) -------------

-- Every email the app sends, so staff can see what went out.
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','logged')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A counter per realtime topic. Clients poll this as a fallback to Supabase realtime.
create table live_versions (
  id uuid primary key default gen_random_uuid(),
  topic text not null unique,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who is editing which field right now (for the teammate marker on P4).
create table editing_markers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  field_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, person_id)
);

-- updated_at triggers -------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['events','staff','tables','companies','people','device_sessions',
    'poll_questions','poll_responses','problems','shortlist_reviews','golden_drafts','next_steps',
    'facilitator_notes','final_plans','ai_suggestions','audit_log','hubspot_sync_log',
    'email_outbox','live_versions','editing_markers']
  loop
    execute format('create trigger %I_updated_at before update on %I
      for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
