-- Allow authenticated users to read ACTIVE groups and their ACTIVE members,
-- so the app can present merged profiles in the public browse screen.

alter table if exists public.profile_groups enable row level security;
alter table if exists public.profile_group_members enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_groups' and policyname='groups_select_public_active'
  ) then
    create policy groups_select_public_active on public.profile_groups
      for select using (status = 'ACTIVE');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_members' and policyname='members_select_public_active'
  ) then
    create policy members_select_public_active on public.profile_group_members
      for select using (status = 'ACTIVE');
  end if;
end $$;


