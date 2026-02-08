-- Session presence for live tracking visibility

create table if not exists public.session_presence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists session_presence_session_user
  on public.session_presence (session_id, user_id);

alter table public.session_presence enable row level security;

create policy "Session presence select admin or owner"
  on public.session_presence for select
  using (public.is_super_admin() or user_id = auth.uid());

create policy "Session presence insert own"
  on public.session_presence for insert
  with check (user_id = auth.uid());

create policy "Session presence update own"
  on public.session_presence for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Session presence delete admin"
  on public.session_presence for delete
  using (public.is_super_admin());
