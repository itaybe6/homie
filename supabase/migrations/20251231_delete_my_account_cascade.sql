-- Cascading account deletion for the currently authenticated user.
-- Deletes all related rows (group memberships/invites, notifications, matches, requests, survey),
-- and handles apartments:
-- - If the user is the owner_id: transfer ownership to the first partner in partner_ids.
-- - If no partners remain: delete the apartment.
-- - Always remove the user from partner_ids of other apartments.
--
-- Note: This migration is defensive. If a table doesn't exist in the target DB,
-- it will skip that part to avoid breaking deploys across environments.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $fn$
declare
  v_uid uuid := auth.uid();
  v_group_ids uuid[];
  v_gid uuid;
  v_remaining_active int;
  r_apt record;
  v_partner_col_udt text;
  v_partner_ids uuid[];
  v_clean_partners uuid[];
  v_new_owner uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Avoid concurrent double-deletes / races for same user.
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  -- 1) Group related cleanup (shared profiles)
  if to_regclass('public.profile_group_invites') is not null then
    delete from public.profile_group_invites
    where inviter_id = v_uid
       or invitee_id = v_uid;
  end if;

  if to_regclass('public.profile_group_members') is not null then
    select array_agg(distinct group_id) into v_group_ids
    from public.profile_group_members
    where user_id = v_uid
      and status = 'ACTIVE';

    -- Remove the user's memberships (any status)
    delete from public.profile_group_members
    where user_id = v_uid;

    -- If any affected group is now <= 1 ACTIVE member, dissolve it.
    if v_group_ids is not null then
      foreach v_gid in array v_group_ids loop
        select count(*) into v_remaining_active
        from public.profile_group_members
        where group_id = v_gid
          and status = 'ACTIVE';

        if coalesce(v_remaining_active, 0) <= 1 then
          -- Remove any remaining memberships
          delete from public.profile_group_members
          where group_id = v_gid;

          -- Remove any invites for the group
          if to_regclass('public.profile_group_invites') is not null then
            delete from public.profile_group_invites
            where group_id = v_gid;
          end if;

          -- Delete group row (if table exists)
          if to_regclass('public.profile_groups') is not null then
            delete from public.profile_groups
            where id = v_gid;
          end if;
        end if;
      end loop;
    end if;
  end if;

  -- 2) Requests / matches / notifications cleanup
  if to_regclass('public.notifications') is not null then
    delete from public.notifications
    where sender_id = v_uid
       or recipient_id = v_uid;
  end if;

  if to_regclass('public.matches') is not null then
    delete from public.matches
    where sender_id = v_uid
       or receiver_id = v_uid;
  end if;

  if to_regclass('public.apartments_request') is not null then
    delete from public.apartments_request
    where sender_id = v_uid
       or recipient_id = v_uid;
  end if;

  if to_regclass('public.user_survey_responses') is not null then
    delete from public.user_survey_responses
    where user_id = v_uid;
  end if;

  -- 3) Apartments cleanup + ownership transfer
  if to_regclass('public.apartments') is not null then
    -- Detect partner_ids column type (uuid[], text[], jsonb, etc.)
    select c.udt_name into v_partner_col_udt
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'apartments'
      and c.column_name = 'partner_ids';

    -- Remove user from partner list where they are not necessarily owner
    if v_partner_col_udt = '_uuid' then
      update public.apartments
      set partner_ids = array_remove(partner_ids, v_uid)
      where partner_ids is not null
        and partner_ids @> array[v_uid];
    elsif v_partner_col_udt = '_text' then
      update public.apartments
      set partner_ids = array_remove(partner_ids, v_uid::text)
      where partner_ids is not null
        and partner_ids @> array[v_uid::text];
    elsif v_partner_col_udt = 'jsonb' then
      update public.apartments
      set partner_ids = (
        select coalesce(jsonb_agg(elem), '[]'::jsonb)
        from jsonb_array_elements_text(partner_ids) elem
        where elem <> v_uid::text
      )
      where partner_ids is not null
        and partner_ids @> to_jsonb(array[v_uid::text]);
    end if;

    -- For apartments owned by the user, either transfer or delete
    for r_apt in
      select id, partner_ids
      from public.apartments
      where owner_id = v_uid
      for update
    loop
      if v_partner_col_udt = 'jsonb' then
        select coalesce(array_agg(value::uuid), '{}'::uuid[]) into v_clean_partners
        from jsonb_array_elements_text(coalesce(r_apt.partner_ids, '[]'::jsonb)) t(value)
        where value <> v_uid::text;
      else
        v_partner_ids := coalesce(r_apt.partner_ids::uuid[], '{}'::uuid[]);
        v_clean_partners := array_remove(v_partner_ids, v_uid);
      end if;

      v_new_owner := v_clean_partners[1];

      if v_new_owner is null then
        delete from public.apartments
        where id = r_apt.id;
      else
        if v_partner_col_udt = '_uuid' then
          update public.apartments
          set owner_id = v_new_owner,
              partner_ids = array_remove(v_clean_partners, v_new_owner)
          where id = r_apt.id;
        elsif v_partner_col_udt = '_text' then
          update public.apartments
          set owner_id = v_new_owner,
              partner_ids = array_remove((v_clean_partners::text[]), v_new_owner::text)
          where id = r_apt.id;
        elsif v_partner_col_udt = 'jsonb' then
          update public.apartments
          set owner_id = v_new_owner,
              partner_ids = to_jsonb(array_remove(v_clean_partners, v_new_owner))
          where id = r_apt.id;
        else
          -- Fallback: only transfer owner_id
          update public.apartments
          set owner_id = v_new_owner
          where id = r_apt.id;
        end if;
      end if;
    end loop;

    -- Final pass: ensure the user isn't left in partner_ids due to transfer ordering
    if v_partner_col_udt = '_uuid' then
      update public.apartments
      set partner_ids = array_remove(partner_ids, v_uid)
      where partner_ids is not null
        and partner_ids @> array[v_uid];
    elsif v_partner_col_udt = '_text' then
      update public.apartments
      set partner_ids = array_remove(partner_ids, v_uid::text)
      where partner_ids is not null
        and partner_ids @> array[v_uid::text];
    elsif v_partner_col_udt = 'jsonb' then
      update public.apartments
      set partner_ids = (
        select coalesce(jsonb_agg(elem), '[]'::jsonb)
        from jsonb_array_elements_text(partner_ids) elem
        where elem <> v_uid::text
      )
      where partner_ids is not null
        and partner_ids @> to_jsonb(array[v_uid::text]);
    end if;
  end if;

  -- 4) Delete profile row
  if to_regclass('public.users') is not null then
    delete from public.users
    where id = v_uid;
  end if;

  -- 5) Delete auth user (removes ability to login again)
  if to_regclass('auth.users') is not null then
    delete from auth.users
    where id = v_uid;
  end if;
end;
$fn$;

grant execute on function public.delete_my_account() to authenticated;

