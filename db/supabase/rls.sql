-- Row level security for Supabase. Run once in the Supabase SQL editor after the
-- migrations (scripts/migrate.ts applies it automatically when SUPABASE_URL is set).
--
-- How access works:
-- * The app server connects with the database connection string (service role).
--   It scopes every participant query to the session's company in code.
-- * The public anon key is shipped to browsers only for realtime pings. With RLS on
--   and no anon policies, the anon key cannot read or write any table.
-- * Signed-in staff (Supabase Auth users listed in `staff`) can read everything.
--   Facilitators can write notes and shortlist reviews. Admins can write everything.

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and role = 'admin');
$$;

do $$
declare t text;
begin
  foreach t in array array['events','staff','tables','companies','people','device_sessions',
    'poll_questions','poll_responses','problems','shortlist_reviews','golden_drafts','next_steps',
    'facilitator_notes','final_plans','ai_suggestions','audit_log','hubspot_sync_log',
    'email_outbox','live_versions','editing_markers']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_read on %I', t);
    execute format('create policy staff_read on %I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy admin_write on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists facilitator_write on facilitator_notes;
create policy facilitator_write on facilitator_notes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists facilitator_write on shortlist_reviews;
create policy facilitator_write on shortlist_reviews for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
