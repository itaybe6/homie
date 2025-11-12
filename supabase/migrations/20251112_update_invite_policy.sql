-- Make invite INSERT allowed for group creator or any active member.
-- This avoids ambiguous RLS failures and supports the initial case where the
-- creator invites the first partner before any member rows exist.

alter table if exists public.profile_group_invites enable row level security;

-- Drop the simple inviter-only policy if it exists
do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='profile_group_invites'
      and policyname='invites_insert_inviter'
  ) then
    drop policy "invites_insert_inviter" on public.profile_group_invites;
  end if;
end $$;

-- Create a stricter, explicit policy that ties the inviter to the group
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='profile_group_invites'
      and policyname='invites_insert_creator_or_member'
  ) then
    create policy "invites_insert_creator_or_member" on public.profile_group_invites
      for insert
      with check (
        auth.uid() = inviter_id
        and (
          exists (
            select 1
            from public.profile_groups g
            where g.id = profile_group_invites.group_id
              and g.created_by = auth.uid()
          )
          or exists (
            select 1
            from public.profile_group_members m
            where m.group_id = profile_group_invites.group_id
              and m.user_id = auth.uid()
              and m.status = 'ACTIVE'
          )
        )
      );
  end if;
end $$;


