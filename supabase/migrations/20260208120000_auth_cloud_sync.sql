-- Auth + games/sessions/events model

create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'tracker' check (role in ('super_admin', 'tracker')),
  name text,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, role)
  values (new.id, new.email, 'tracker')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create policy "User profiles read own or admin"
  on public.user_profiles for select
  using (id = auth.uid() or public.is_super_admin());

create policy "User profiles insert own"
  on public.user_profiles for insert
  with check (id = auth.uid());

create policy "User profiles update by admin"
  on public.user_profiles for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  opponent_name text not null,
  scheduled_at timestamptz not null,
  location text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.games enable row level security;

create policy "Games select authenticated"
  on public.games for select
  using (auth.role() = 'authenticated');

create policy "Games insert admin"
  on public.games for insert
  with check (public.is_super_admin() and created_by = auth.uid());

create policy "Games update admin"
  on public.games for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Games delete admin"
  on public.games for delete
  using (public.is_super_admin());

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  role_scope text not null check (role_scope in ('OFFENSE', 'DEFENSE', 'BOTH')),
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Sessions select authenticated"
  on public.sessions for select
  using (auth.role() = 'authenticated');

create policy "Sessions insert by owner"
  on public.sessions for insert
  with check (created_by = auth.uid());

create policy "Sessions update admin"
  on public.sessions for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Sessions delete admin"
  on public.sessions for delete
  using (public.is_super_admin());

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  player_id text not null,
  event_type text not null,
  quarter int not null,
  context text not null,
  team text not null,
  clock_ms bigint,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  payload jsonb
);

alter table public.events enable row level security;

create policy "Events select admin or owner"
  on public.events for select
  using (
    public.is_super_admin()
    or created_by = auth.uid()
  );

create policy "Events insert by session owner"
  on public.events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.created_by = auth.uid()
    )
  );

create policy "Events delete admin or owner"
  on public.events for delete
  using (public.is_super_admin() or created_by = auth.uid());
