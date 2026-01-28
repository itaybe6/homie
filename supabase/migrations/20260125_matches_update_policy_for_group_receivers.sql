-- Allow approving/rejecting match requests that target a merged profile (receiver_group_id).
-- Without this, a group member may be blocked by RLS from updating the match row
-- (row often has receiver_id = null until someone approves).

do $$
begin
  if to_regclass('public.matches') is null then
    raise notice 'public.matches table not found; skipping matches update policy setup';
    return;
  end if;

  -- Create an additional UPDATE policy (policies are OR-ed).
  -- This broadens update rights for:
  -- - direct sender/receiver
  -- - members of receiver_group_id (merged profile target)
  -- - members of sender_group_id (if sender is associated to a group)
  drop policy if exists "matches_update_participants_or_group_members" on public.matches;

  create policy "matches_update_participants_or_group_members"
    on public.matches
    for update
    to authenticated
    using (
      sender_id::text = auth.uid()::text
      or receiver_id::text = auth.uid()::text
      or (
        receiver_group_id is not null
        and exists (
          select 1
          from public.profile_group_members pgm
          where pgm.group_id::text = public.matches.receiver_group_id::text
            and pgm.user_id::text = auth.uid()::text
            and pgm.status = 'ACTIVE'
        )
      )
      or (
        sender_group_id is not null
        and exists (
          select 1
          from public.profile_group_members pgm
          where pgm.group_id::text = public.matches.sender_group_id::text
            and pgm.user_id::text = auth.uid()::text
            and pgm.status = 'ACTIVE'
        )
      )
    )
    with check (
      sender_id::text = auth.uid()::text
      or receiver_id::text = auth.uid()::text
      or (
        receiver_group_id is not null
        and exists (
          select 1
          from public.profile_group_members pgm
          where pgm.group_id::text = public.matches.receiver_group_id::text
            and pgm.user_id::text = auth.uid()::text
            and pgm.status = 'ACTIVE'
        )
      )
      or (
        sender_group_id is not null
        and exists (
          select 1
          from public.profile_group_members pgm
          where pgm.group_id::text = public.matches.sender_group_id::text
            and pgm.user_id::text = auth.uid()::text
            and pgm.status = 'ACTIVE'
        )
      )
    );
end $$;

