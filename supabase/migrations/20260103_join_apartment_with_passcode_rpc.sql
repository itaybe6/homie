-- Join an apartment using a 6-digit passcode.
-- Behavior:
-- - Adds the current auth user (auth.uid()) into apartments.partner_ids (if not already there)
-- - Rotates apartments.join_passcode to a NEW 6-digit code (unique)
-- - Returns the apartment id + the new code
--
-- This is SECURITY DEFINER so it can work even when RLS is enabled on apartments.

create or replace function public.join_apartment_with_passcode(
  p_passcode text,
  p_apartment_id uuid default null
)
returns table (
  apartment_id uuid,
  new_passcode text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text;
  v_apt_id uuid;
  v_partner_ids text[];
  v_code text;
  v_try int := 0;
begin
  v_uid := auth.uid()::text;
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_passcode is null or p_passcode !~ '^[0-9]{6}$' then
    raise exception 'invalid_passcode_format';
  end if;

  -- Find the apartment either by id+code, or by code alone (fallback).
  if p_apartment_id is not null then
    select a.id, coalesce(a.partner_ids, '{}'::text[])
      into v_apt_id, v_partner_ids
    from public.apartments a
    where a.id = p_apartment_id
      and a.join_passcode = p_passcode
    limit 1;
  else
    select a.id, coalesce(a.partner_ids, '{}'::text[])
      into v_apt_id, v_partner_ids
    from public.apartments a
    where a.join_passcode = p_passcode
    limit 1;
  end if;

  if v_apt_id is null then
    raise exception 'wrong_passcode';
  end if;

  -- Add user to partner_ids (idempotent)
  if not (v_uid = any(v_partner_ids)) then
    v_partner_ids := array_append(v_partner_ids, v_uid);
  end if;

  -- Rotate to a new unique 6-digit code (leverages the unique index).
  loop
    v_try := v_try + 1;
    if v_try > 30 then
      raise exception 'failed_to_generate_unique_passcode';
    end if;

    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

    begin
      update public.apartments
         set partner_ids = v_partner_ids,
             join_passcode = v_code
       where id = v_apt_id;
      exit;
    exception
      when unique_violation then
        -- Collision on join_passcode unique index; retry.
        null;
    end;
  end loop;

  apartment_id := v_apt_id;
  new_passcode := v_code;
  return next;
end;
$$;

revoke all on function public.join_apartment_with_passcode(text, uuid) from public;
grant execute on function public.join_apartment_with_passcode(text, uuid) to authenticated;

