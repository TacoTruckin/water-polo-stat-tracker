-- Collaborative sessions + scopes

alter table public.game_sessions
  add column if not exists status text not null default 'live' check (status in ('pending','live','ended')),
  add column if not exists started_at timestamptz not null default now();

create unique index if not exists game_sessions_one_per_game
  on public.game_sessions (upcoming_game_id);

create table if not exists public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  scope text not null check (scope in ('offense','defense','shots','all')),
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

alter table public.session_members enable row level security;

alter table public.game_events
  add column if not exists created_by uuid references auth.users,
  add column if not exists event_scope text not null default 'all' check (event_scope in ('offense','defense','shots','all'));

-- Helper functions
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

-- Policies: upcoming_games
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
  using (auth.uid() is not null or public.is_super_admin());

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

-- Policies: game_sessions
DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_sessions') then
    drop policy if exists "Sessions readable by owner or super_admin" on public.game_sessions;
    drop policy if exists "Sessions insert by authenticated" on public.game_sessions;
    drop policy if exists "Sessions update by owner or super_admin" on public.game_sessions;
    drop policy if exists "Sessions delete by super_admin" on public.game_sessions;
  end if;
end $$;

create policy "Sessions readable by authenticated"
  on public.game_sessions for select
  using (auth.uid() is not null or public.is_super_admin());

create policy "Sessions insert by admin or first tracker"
  on public.game_sessions for insert
  with check (
    public.is_super_admin()
    or (
      auth.uid() is not null
      and tracker_id = auth.uid()
      and not exists (
        select 1 from public.game_sessions s where s.upcoming_game_id = upcoming_game_id
      )
    )
  );

create policy "Sessions update by super_admin"
  on public.game_sessions for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Sessions delete by super_admin"
  on public.game_sessions for delete
  using (public.is_super_admin());

-- Policies: session_members
create policy "Session members readable by owner or super_admin"
  on public.session_members for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "Session members insert by owner or super_admin"
  on public.session_members for insert
  with check (user_id = auth.uid() or public.is_super_admin());

create policy "Session members update by owner or super_admin"
  on public.session_members for update
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create policy "Session members delete by owner or super_admin"
  on public.session_members for delete
  using (user_id = auth.uid() or public.is_super_admin());

-- Policies: game_events
DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'game_events') then
    drop policy if exists "Events readable by session owner or super_admin" on public.game_events;
    drop policy if exists "Events insert by session owner or super_admin" on public.game_events;
  end if;
end $$;

create policy "Events readable by session member or super_admin"
  on public.game_events for select
  using (public.is_super_admin() or public.is_session_member(session_id));

create policy "Events insert by scope"
  on public.game_events for insert
  with check (
    public.is_super_admin()
    or (
      created_by = auth.uid()
      and public.session_scope_allows(session_id, event_scope)
    )
  );

create policy "Events update by super_admin"
  on public.game_events for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Events delete by owner recent or super_admin"
  on public.game_events for delete
  using (
    public.is_super_admin()
    or (created_by = auth.uid() and created_at >= now() - interval '10 seconds')
  );
