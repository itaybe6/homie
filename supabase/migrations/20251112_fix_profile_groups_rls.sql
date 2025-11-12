-- Fix RLS infinite recursion: simplify members SELECT policy to own rows only
-- The previous policy self-joined profile_group_members, causing recursion when
-- other policies referenced it. We replace it with a simple "user_id = auth.uid()".

alter table if exists public.profile_group_members enable row level security;

do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_members' and policyname='members_select_same_group'
  ) then
    drop policy "members_select_same_group" on public.profile_group_members;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_members' and policyname='members_select_own'
  ) then
    create policy "members_select_own" on public.profile_group_members
      for select using (user_id = auth.uid());
  end if;
end $$;

-- Re-affirm: writes are handled via RPC; block direct writes
revoke insert, update, delete on public.profile_group_members from anon, authenticated;


