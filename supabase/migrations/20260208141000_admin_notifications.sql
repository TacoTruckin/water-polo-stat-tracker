-- Admin notifications for new user signups

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'open' check (status in ('open', 'completed')),
  message text not null,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

alter table public.admin_notifications enable row level security;

create policy "Admin notifications select admin"
  on public.admin_notifications for select
  using (public.is_super_admin());

create policy "Admin notifications update admin"
  on public.admin_notifications for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "Admin notifications delete admin"
  on public.admin_notifications for delete
  using (public.is_super_admin());

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

  insert into public.admin_notifications (type, status, message, user_id, user_email)
  values (
    'USER_SIGNUP',
    'open',
    coalesce(new.email, 'New user signup'),
    new.id,
    new.email
  );

  return new;
end;
$$;
