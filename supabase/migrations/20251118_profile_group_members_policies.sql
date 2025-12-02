-- Enable RLS on profile_group_members
alter table if exists public.profile_group_members enable row level security;

-- Drop all existing policies to start fresh
drop policy if exists "pgm_any_authenticated_insert" on public.profile_group_members;
drop policy if exists "pgm_any_authenticated_update" on public.profile_group_members;
drop policy if exists "pgm_any_authenticated_select" on public.profile_group_members;
drop policy if exists "pgm_self_add_to_group" on public.profile_group_members;
drop policy if exists "pgm_creator_add_members" on public.profile_group_members;
drop policy if exists "pgm_active_member_add_members" on public.profile_group_members;
drop policy if exists "pgm_update_by_self_or_creator" on public.profile_group_members;

-- Policy: Any authenticated user can SELECT (read) group members
create policy "pgm_authenticated_select"
on public.profile_group_members
for select
to authenticated
using (true);

-- Policy: Any authenticated user can INSERT (add) any user to any group
create policy "pgm_authenticated_insert"
on public.profile_group_members
for insert
to authenticated
with check (true);

-- Policy: Any authenticated user can UPDATE group members
create policy "pgm_authenticated_update"
on public.profile_group_members
for update
to authenticated
using (true)
with check (true);

-- Policy: Any authenticated user can DELETE group members
create policy "pgm_authenticated_delete"
on public.profile_group_members
for delete
to authenticated
using (true);
