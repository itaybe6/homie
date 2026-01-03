-- Fix join_apartment_with_passcode() to support partner_ids being uuid[] / text[] / jsonb.
-- Some environments store partner_ids as uuid[] (udt_name = '_uuid').

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
  v_uid uuid;
  v_uid_text text;
  v_partner_col_udt text;

  v_apt_id uuid;
  v_partner_ids_uuid uuid[];
  v_partner_ids_text text[];
  v_partner_ids_jsonb jsonb;

  v_code text;
  v_try int := 0;
begin
  v_uid := auth.uid();
  v_uid_text := auth.uid()::text;
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_passcode is null or p_passcode !~ '^[0-9]{6}$' then
    raise exception 'invalid_passcode_format';
  end if;

  -- Detect partner_ids type (uuid[]/text[]/jsonb)
  select c.udt_name into v_partner_col_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'apartments'
    and c.column_name = 'partner_ids';

  -- Find apartment + load partner_ids in the right type
  if v_partner_col_udt = '_uuid' then
    if p_apartment_id is not null then
      select a.id, coalesce(a.partner_ids, '{}'::uuid[])
        into v_apt_id, v_partner_ids_uuid
      from public.apartments a
      where a.id = p_apartment_id
        and a.join_passcode = p_passcode
      limit 1;
    else
      select a.id, coalesce(a.partner_ids, '{}'::uuid[])
        into v_apt_id, v_partner_ids_uuid
      from public.apartments a
      where a.join_passcode = p_passcode
      limit 1;
    end if;

    if v_apt_id is null then
      raise exception 'wrong_passcode';
    end if;

    if not (v_uid = any(v_partner_ids_uuid)) then
      v_partner_ids_uuid := array_append(v_partner_ids_uuid, v_uid);
    end if;

  elsif v_partner_col_udt = '_text' then
    if p_apartment_id is not null then
      select a.id, coalesce(a.partner_ids, '{}'::text[])
        into v_apt_id, v_partner_ids_text
      from public.apartments a
      where a.id = p_apartment_id
        and a.join_passcode = p_passcode
      limit 1;
    else
      select a.id, coalesce(a.partner_ids, '{}'::text[])
        into v_apt_id, v_partner_ids_text
      from public.apartments a
      where a.join_passcode = p_passcode
      limit 1;
    end if;

    if v_apt_id is null then
      raise exception 'wrong_passcode';
    end if;

    if not (v_uid_text = any(v_partner_ids_text)) then
      v_partner_ids_text := array_append(v_partner_ids_text, v_uid_text);
    end if;

  elsif v_partner_col_udt = 'jsonb' then
    if p_apartment_id is not null then
      select a.id, coalesce(a.partner_ids, '[]'::jsonb)
        into v_apt_id, v_partner_ids_jsonb
      from public.apartments a
      where a.id = p_apartment_id
        and a.join_passcode = p_passcode
      limit 1;
    else
      select a.id, coalesce(a.partner_ids, '[]'::jsonb)
        into v_apt_id, v_partner_ids_jsonb
      from public.apartments a
      where a.join_passcode = p_passcode
      limit 1;
    end if;

    if v_apt_id is null then
      raise exception 'wrong_passcode';
    end if;

    if not (v_partner_ids_jsonb @> to_jsonb(array[v_uid_text])) then
      v_partner_ids_jsonb := v_partner_ids_jsonb || to_jsonb(array[v_uid_text]);
    end if;

  else
    raise exception 'unsupported_partner_ids_type';
  end if;

  -- Rotate to a new unique 6-digit code (leverages the unique index).
  loop
    v_try := v_try + 1;
    if v_try > 30 then
      raise exception 'failed_to_generate_unique_passcode';
    end if;

    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

    begin
      if v_partner_col_udt = '_uuid' then
        update public.apartments
           set partner_ids = v_partner_ids_uuid,
               join_passcode = v_code
         where id = v_apt_id;
      elsif v_partner_col_udt = '_text' then
        update public.apartments
           set partner_ids = v_partner_ids_text,
               join_passcode = v_code
         where id = v_apt_id;
      else
        update public.apartments
           set partner_ids = v_partner_ids_jsonb,
               join_passcode = v_code
         where id = v_apt_id;
      end if;
      exit;
    exception
      when unique_violation then
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

