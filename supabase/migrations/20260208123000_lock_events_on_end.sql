-- Prevent inserts when a session is ended

drop policy if exists "Events insert by session owner" on public.events;

create policy "Events insert by session owner"
  on public.events for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.created_by = auth.uid()
        and s.status <> 'ended'
    )
  );
