-- Allow super admins to audit/update events

drop policy if exists "Events update admin" on public.events;

create policy "Events update admin"
  on public.events for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
