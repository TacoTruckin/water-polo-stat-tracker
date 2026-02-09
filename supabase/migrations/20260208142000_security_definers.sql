-- Align security definer functions used by RLS and event mapping

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

create or replace function public.map_event_to_segment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
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
