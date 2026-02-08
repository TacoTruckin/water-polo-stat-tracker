-- Video segments + event mapping + game timeline fields

alter table public.sessions
  add column if not exists quarter_length_seconds int not null default 480;

alter table public.sessions
  alter column started_at set default now();

create table if not exists public.video_segments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  segment_index int not null,
  segment_start_game_seconds int not null,
  segment_end_game_seconds int,
  label text,
  source_type text default 'unknown' check (source_type in ('youtube', 'file', 'unknown')),
  source_url text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists video_segments_game_index
  on public.video_segments (game_id, segment_index);

alter table public.video_segments enable row level security;

create policy "Video segments admin select"
  on public.video_segments for select
  using (public.is_super_admin());

create policy "Video segments admin insert"
  on public.video_segments for insert
  with check (public.is_super_admin());

create policy "Video segments admin update"
  on public.video_segments for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Video segments admin delete"
  on public.video_segments for delete
  using (public.is_super_admin());

alter table public.events
  add column if not exists event_elapsed_game_seconds int,
  add column if not exists clock_display text,
  add column if not exists segment_id uuid references public.video_segments(id) on delete set null,
  add column if not exists event_video_seconds int;

create or replace function public.map_event_to_segment()
returns trigger
language plpgsql
as $$
declare
  seg record;
begin
  if new.event_elapsed_game_seconds is null then
    return new;
  end if;
  select *
    into seg
    from public.video_segments
   where game_id = new.game_id
     and segment_start_game_seconds <= new.event_elapsed_game_seconds
     and (segment_end_game_seconds is null or segment_end_game_seconds >= new.event_elapsed_game_seconds)
   order by segment_start_game_seconds desc
   limit 1;

  if seg.id is not null then
    new.segment_id := seg.id;
    new.event_video_seconds := new.event_elapsed_game_seconds - seg.segment_start_game_seconds;
  else
    new.segment_id := null;
    new.event_video_seconds := null;
  end if;

  return new;
end;
$$;

drop trigger if exists map_event_to_segment on public.events;
create trigger map_event_to_segment
  before insert on public.events
  for each row execute function public.map_event_to_segment();

-- Update events insert policy to enforce session not ended and allow admin inserts
drop policy if exists "Events insert by session owner" on public.events;

create policy "Events insert by session owner"
  on public.events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.status <> 'ended'
        and (public.is_super_admin() or s.created_by = auth.uid())
    )
  );
