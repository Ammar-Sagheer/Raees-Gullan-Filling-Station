-- =============================================================================
-- 079_each_login_chooses_its_language.sql
--
-- Each login reads the app in English or in Urdu, its own choice, kept with
-- the login so it follows the person from the shop's laptop to a phone.
--
-- user_preferences: one row per login, made the first time it chooses.
--   language   'en' or 'ur'; no row, or null, is English, as before.
--
-- WHY A TABLE OF ITS OWN, not a column on profiles: profiles is in the
-- activity log (035), so every switch of language would write a "Login" line
-- the owner has to read past; and profiles may be updated only by the owner,
-- while a staff login must be able to choose for itself. Here a login reads
-- and writes its own row and nobody else's, the owner included.
--
-- NOT IN THE BACKUP, with profiles, for the same reason profiles is not (051):
-- a preference is half of a login, and logins are made again on a restore.
-- backup_tables_missing() learns the exclusion, so the export does not report
-- it as a table left out by mistake.
--
-- No existing row is touched.
-- =============================================================================

create table public.user_preferences (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  language   text check (language in ('en', 'ur')),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'One row per login: the language it reads the app in. Own row only. Not in the backup (051), with profiles.';

alter table public.user_preferences enable row level security;

create policy "user_preferences: read own" on public.user_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy "user_preferences: add own" on public.user_preferences
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_staff());

create policy "user_preferences: change own" on public.user_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_active_staff());

revoke all on public.user_preferences from public, anon;
grant select, insert, update on public.user_preferences to authenticated;

-- 051's check for tables the backup forgot: this one is left out on purpose.
create or replace function public.backup_tables_missing()
returns text[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(c.relname order by c.relname), array[]::text[])
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not (c.relname = any (public.backup_table_order()))
     -- Excluded on purpose: activity_log and profiles (051), user_preferences (079).
     and not (c.relname = any (array['activity_log', 'profiles', 'user_preferences']));
$$;
