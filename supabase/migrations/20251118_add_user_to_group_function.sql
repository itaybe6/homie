-- Function: add_user_to_group
-- Adds (or re-activates) a user in a profile group, bypassing RLS via SECURITY DEFINER.

create or replace function public.add_user_to_group(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_group_members (group_id, user_id, status)
  values (p_group_id, p_user_id, 'ACTIVE')
  on conflict (group_id, user_id) do update
    set status = 'ACTIVE',
        updated_at = now();
end;
$$;

-- Limit execution to authenticated users (same role as the client app).
revoke all on function public.add_user_to_group(uuid, uuid) from public;
grant execute on function public.add_user_to_group(uuid, uuid) to authenticated;


