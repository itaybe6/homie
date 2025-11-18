alter table if exists public.profile_group_members enable row level security;

-- Allow authenticated users to add themselves to a group
drop policy if exists "pgm_self_add_to_group" on public.profile_group_members;
create policy "pgm_self_add_to_group"
on public.profile_group_members
for insert
to authenticated
with check (
  user_id = auth.uid()
);

-- Allow the creator of the group to add any member to that group
drop policy if exists "pgm_creator_add_members" on public.profile_group_members;
create policy "pgm_creator_add_members"
on public.profile_group_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profile_groups g
    where g.id = profile_group_members.group_id
      and g.created_by = auth.uid()
  )
);

-- Allow updates by the member themself or the group's creator (e.g., to set status ACTIVE)
drop policy if exists "pgm_update_by_self_or_creator" on public.profile_group_members;
create policy "pgm_update_by_self_or_creator"
on public.profile_group_members
for update
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profile_groups g
    where g.id = profile_group_members.group_id
      and g.created_by = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.profile_groups g
    where g.id = profile_group_members.group_id
      and g.created_by = auth.uid()
  )
);


