-- Align schema with admin-assigned session model

-- Profiles: rename id -> user_id, add name, adjust helpers/policies
DO $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id'
  ) then
    alter table public.profiles rename column id to user_id;
  end if;
end $$;

alter table public.profiles
  add column if not exists name text,
  add column if not exists email text;

alter table public.profiles
  alter column user_id set not null;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, role)
  values (new.id, new.email, 'tracker')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles') then
    drop policy if exists "Profiles are viewable by owner or super_admin" on public.profiles;
    drop policy if exists "Profiles can be inserted by owner" on public.profiles;
    drop policy if exists "Profiles can be updated by owner or super_admin" on public.profiles;
  end if;
end $$;

create policy "Profiles are viewable by owner or super_admin"
  on public.profiles for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "Profiles can be inserted by owner"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "Profiles can be updated by owner or super_admin"
  on public.profiles for update
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- Upcoming games: require start_time, admin-only mutation
update public.upcoming_games set start_time = now() where start_time is null;

alter table public.upcoming_games
  alter column start_time set not null,
  add column if not exists created_by uuid references auth.users;

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'upcoming_games') then
    drop policy if exists "Upcoming games readable by authenticated" on public.upcoming_games;
    drop policy if exists "Upcoming games insert by super_admin" on public.upcoming_games;
    drop policy if exists "Upcoming games update by super_admin" on public.upcoming_games;
    drop policy if exists "Upcoming games delete by super_admin" on public.upcoming_games;
  end if;
end $$;

create policy "Upcoming games readable by authenticated"
  on public.upcoming_games for select
  using (auth.uid() is not null);

create policy "Upcoming games insert by super_admin"
  on public.upcoming_games for insert
  with check (public.is_super_admin());

create policy "Upcoming games update by super_admin"
  on public.upcoming_games for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Upcoming games delete by super_admin"
  on public.upcoming_games for delete
  using (public.is_super_admin());

-- Game sessions: admin-only mutation
alter table public.game_sessions
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists created_by uuid references auth.users;

update public.game_sessions set status = 'not_started' where status is null or status = 'pending';
update public.game_sessions set status = 'running' where status = 'live';

DO $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.game_sessions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.game_sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.game_sessions
  alter column status set default 'not_started';

alter table public.game_sessions
  add constraint game_sessions_status_check
  check (status in ('not_started','running','paused','ended'));

alter table public.game_sessions
  alter column started_at drop not null;

delete from public.game_sessions where upcoming_game_id is null;

alter table public.game_sessions
  alter column upcoming_game_id set not null;

create unique index if not exists game_sessions_unique_upcoming_game
  on public.game_sessions (upcoming_game_id);

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_sessions') then
    drop policy if exists "Sessions readable by owner or super_admin" on public.game_sessions;
    drop policy if exists "Sessions insert by authenticated" on public.game_sessions;
    drop policy if exists "Sessions readable by authenticated" on public.game_sessions;
    drop policy if exists "Sessions insert by admin or first tracker" on public.game_sessions;
    drop policy if exists "Sessions update by super_admin" on public.game_sessions;
    drop policy if exists "Sessions delete by super_admin" on public.game_sessions;
  end if;
end $$;

create policy "Sessions readable by authenticated"
  on public.game_sessions for select
  using (auth.uid() is not null);

create policy "Sessions insert by super_admin"
  on public.game_sessions for insert
  with check (public.is_super_admin());

create policy "Sessions update by super_admin"
  on public.game_sessions for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Sessions delete by super_admin"
  on public.game_sessions for delete
  using (public.is_super_admin());

-- Session members: admin-only assignment
alter table public.session_members
  add column if not exists assigned_by uuid references auth.users,
  add column if not exists assigned_at timestamptz not null default now();

DO $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.session_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%scope%'
  loop
    execute format('alter table public.session_members drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.session_members
  add constraint session_members_scope_check
  check (scope in ('offense','defense','shots','all'));

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'session_members') then
    drop policy if exists "Session members readable by owner or super_admin" on public.session_members;
    drop policy if exists "Session members insert by owner or super_admin" on public.session_members;
    drop policy if exists "Session members update by owner or super_admin" on public.session_members;
    drop policy if exists "Session members delete by owner or super_admin" on public.session_members;
  end if;
end $$;

create policy "Session members readable by owner or super_admin"
  on public.session_members for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "Session members insert by super_admin"
  on public.session_members for insert
  with check (public.is_super_admin());

create policy "Session members update by super_admin"
  on public.session_members for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Session members delete by super_admin"
  on public.session_members for delete
  using (public.is_super_admin());

-- Events: rename table and enforce scope
DO $$
begin
  if to_regclass('public.events') is null and to_regclass('public.game_events') is not null then
    alter table public.game_events rename to events;
  end if;
end $$;

alter table public.events
  add column if not exists created_by uuid references auth.users,
  add column if not exists scope text not null default 'all',
  add column if not exists clock_ms bigint,
  add column if not exists wall_clock_ms bigint,
  add column if not exists display_time text,
  add column if not exists payload jsonb;

DO $$
declare
  c record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'event_scope'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'scope'
  ) then
    alter table public.events rename column event_scope to scope;
  end if;
end $$;

DO $$
declare
  c record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'game_clock_ms'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'clock_ms'
  ) then
    alter table public.events rename column game_clock_ms to clock_ms;
  end if;
end $$;

DO $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%scope%'
  loop
    execute format('alter table public.events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.events
  add constraint events_scope_check
  check (scope in ('offense','defense','shots','all'));

alter table public.events enable row level security;

create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = p_session_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.session_scope_allows(p_session_id uuid, p_scope text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = p_session_id
      and m.user_id = auth.uid()
      and (m.scope = 'all' or m.scope = p_scope)
  );
$$;

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events') then
    drop policy if exists "Events readable by session owner or super_admin" on public.events;
    drop policy if exists "Events insert by session owner or super_admin" on public.events;
    drop policy if exists "Events readable by session member or super_admin" on public.events;
    drop policy if exists "Events insert by scope" on public.events;
    drop policy if exists "Events update by super_admin" on public.events;
    drop policy if exists "Events delete by owner recent or super_admin" on public.events;
  end if;
end $$;

create policy "Events readable by session member or super_admin"
  on public.events for select
  using (public.is_super_admin() or public.is_session_member(session_id));

create policy "Events insert by scope"
  on public.events for insert
  with check (
    public.is_super_admin()
    or (
      created_by = auth.uid()
      and public.session_scope_allows(session_id, scope)
    )
  );

create policy "Events update by super_admin"
  on public.events for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Events delete by owner recent or super_admin"
  on public.events for delete
  using (
    public.is_super_admin()
    or (created_by = auth.uid() and created_at >= now() - interval '10 seconds')
  );
