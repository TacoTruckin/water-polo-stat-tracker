create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  role text not null default 'tracker' check (role in ('super_admin', 'tracker')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create policy "Profiles are viewable by owner or super_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());

create policy "Profiles can be inserted by owner"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "Profiles can be updated by owner or super_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'tracker')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.upcoming_games (
  id uuid primary key default gen_random_uuid(),
  opponent text not null,
  start_time timestamptz,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);

alter table public.upcoming_games enable row level security;

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

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  upcoming_game_id uuid references public.upcoming_games on delete set null,
  tracker_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

alter table public.game_sessions enable row level security;

create policy "Sessions readable by owner or super_admin"
  on public.game_sessions for select
  using (tracker_id = auth.uid() or public.is_super_admin());

create policy "Sessions insert by authenticated"
  on public.game_sessions for insert
  with check (
    tracker_id = auth.uid()
    and exists (select 1 from public.upcoming_games g where g.id = upcoming_game_id)
  );

create policy "Sessions update by owner or super_admin"
  on public.game_sessions for update
  using (tracker_id = auth.uid() or public.is_super_admin())
  with check (tracker_id = auth.uid() or public.is_super_admin());

create policy "Sessions delete by super_admin"
  on public.game_sessions for delete
  using (public.is_super_admin());

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions on delete cascade,
  event_type text not null,
  team text not null,
  player_number text not null,
  quarter int not null,
  context text not null,
  created_at timestamptz not null default now(),
  period int,
  game_clock_ms int,
  wall_clock_ms bigint,
  display_time text,
  shot jsonb,
  notes text
);

alter table public.game_events enable row level security;

create policy "Events readable by session owner or super_admin"
  on public.game_events for select
  using (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id
      and (s.tracker_id = auth.uid() or public.is_super_admin())
    )
  );

create policy "Events insert by session owner or super_admin"
  on public.game_events for insert
  with check (
    exists (
      select 1 from public.game_sessions s
      where s.id = session_id
      and (s.tracker_id = auth.uid() or public.is_super_admin())
    )
  );
