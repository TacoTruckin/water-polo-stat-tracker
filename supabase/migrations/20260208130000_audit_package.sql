-- Audited export fields + roster snapshot + external ids

alter table public.games
  add column if not exists external_game_id text,
  add column if not exists roster_snapshot jsonb,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

alter table public.events
  add column if not exists status text not null default 'audited' check (status in ('draft','audited','rejected')),
  add column if not exists audited_by uuid references auth.users(id),
  add column if not exists audited_at timestamptz,
  add column if not exists audit_notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version int not null default 1;

create or replace function public.bump_event_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 1) + 1;
  return new;
end;
$$;

drop trigger if exists bump_event_version on public.events;
create trigger bump_event_version
  before update on public.events
  for each row execute function public.bump_event_version();
