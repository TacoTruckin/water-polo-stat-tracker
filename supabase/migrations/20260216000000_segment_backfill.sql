-- =====================================================================
-- Tournament-ready video mapping: wall-clock time approach
-- =====================================================================
--
-- The game clock UI was never wired up, so event_elapsed_game_seconds
-- is unreliable (always 0 within a quarter). Instead, we use the
-- wall-clock occurred_at timestamp on events plus a game-level
-- game_started_at anchor (set by any tracker at the whistle).
--
-- Formula: event_video_seconds = (occurred_at - game_started_at) + video_offset_seconds
-- video_offset_seconds = seconds of pre-whistle footage in the video
--
-- This handles continuous video, breaks between quarters, halftime,
-- and variable quarter lengths automatically.

-- 1. Add game-level configuration
alter table public.games
  add column if not exists quarter_length_seconds int not null default 480,
  add column if not exists game_started_at timestamptz;

-- 2. Add video_offset_seconds to video_segments
alter table public.video_segments
  add column if not exists video_offset_seconds numeric not null default 0;

-- 3. Allow any authenticated user to update game_started_at (not just admin)
--    We use a dedicated function so trackers can set the start time
--    without needing full update permissions on games.
create or replace function public.mark_game_started(target_game_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  now_ts timestamptz := now();
begin
  -- Only set if not already set (first tracker to tap wins)
  update public.games
     set game_started_at = now_ts
   where id = target_game_id
     and game_started_at is null;

  -- Return the actual start time (may have been set by someone else first)
  select g.game_started_at into now_ts
    from public.games g
   where g.id = target_game_id;

  return now_ts;
end;
$$;

-- 4. Update the map_event_to_segment trigger to use wall-clock time
create or replace function public.map_event_to_segment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  seg record;
  game_start timestamptz;
  offset_secs numeric;
begin
  -- Get the game's start time
  select g.game_started_at into game_start
    from public.games g
   where g.id = new.game_id;

  -- If game hasn't started or no occurred_at, skip mapping
  if game_start is null or new.occurred_at is null then
    return new;
  end if;

  -- Find matching video segment for this game
  -- For continuous video: one segment covers the whole game
  -- For multi-segment: find the segment where the event falls
  select *
    into seg
    from public.video_segments
   where game_id = new.game_id
   order by segment_start_game_seconds asc
   limit 1;

  if seg.id is not null then
    offset_secs := coalesce(seg.video_offset_seconds, 0);
    new.segment_id := seg.id;
    new.event_video_seconds := extract(epoch from (new.occurred_at - game_start)) + offset_secs;

    -- Don't map events that occurred before the game started
    if new.event_video_seconds < 0 then
      new.segment_id := null;
      new.event_video_seconds := null;
    end if;
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

-- 5. Backfill function: re-maps all events using wall-clock time
create or replace function public.backfill_event_segments(target_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  updated_count integer := 0;
  game_start timestamptz;
  seg_id uuid;
  offset_secs numeric;
begin
  -- Only super admins can run this
  if not public.is_super_admin() then
    raise exception 'Permission denied: super_admin role required';
  end if;

  -- Get game start time
  select g.game_started_at into game_start
    from public.games g
   where g.id = target_game_id;

  if game_start is null then
    raise exception 'Game has no start time set. A tracker must tap "Game Started" first.';
  end if;

  -- Get the first (primary) video segment for this game
  select vs.id, coalesce(vs.video_offset_seconds, 0)
    into seg_id, offset_secs
    from public.video_segments vs
   where vs.game_id = target_game_id
   order by vs.segment_start_game_seconds asc
   limit 1;

  -- Clear existing mappings
  update public.events
     set segment_id = null,
         event_video_seconds = null
   where game_id = target_game_id;

  if seg_id is null then
    return 0;
  end if;

  -- Re-map events using wall-clock time
  update public.events e
     set segment_id = seg_id,
         event_video_seconds = extract(epoch from (e.occurred_at - game_start)) + offset_secs
   where e.game_id = target_game_id
     and e.occurred_at >= game_start;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;
