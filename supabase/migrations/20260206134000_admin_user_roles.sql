-- Restrict profile role updates to super_admin, prevent last admin demotion

DO $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles') then
    drop policy if exists "Profiles can be updated by owner or super_admin" on public.profiles;
    drop policy if exists "Profiles update self non-role" on public.profiles;
    drop policy if exists "Profiles update by super_admin" on public.profiles;
  end if;
end $$;

create policy "Profiles update self non-role"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = (select role from public.profiles where user_id = auth.uid())
  );

create policy "Profiles update by super_admin"
  on public.profiles for update
  using (public.is_super_admin())
  with check (
    public.is_super_admin()
    and (
      user_id <> auth.uid()
      or role <> 'tracker'
      or (select count(*) from public.profiles where role = 'super_admin') > 1
    )
  );
