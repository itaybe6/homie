-- Merged profiles (roommate groups)
-- This migration creates 3 tables:
-- 1) profile_groups           - the merged profile/group entity
-- 2) profile_group_members    - users that belong to a group (up to 4 active)
-- 3) profile_group_invites    - invitations with approval flow
-- Plus RLS policies and a SECURITY DEFINER RPC to accept an invite.

create extension if not exists "pgcrypto";

-- Groups
create table if not exists public.profile_groups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.users (id) on delete cascade,
  status text not null default 'PENDING', -- PENDING until at least 2 accept; ACTIVE afterwards
  name text,                               -- optional custom label/title
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_groups_status_check
    check (status in ('PENDING', 'ACTIVE', 'ARCHIVED', 'CANCELLED'))
);

create index if not exists profile_groups_status_idx on public.profile_groups (status);
create index if not exists profile_groups_created_by_idx on public.profile_groups (created_by);

-- Members
create table if not exists public.profile_group_members (
  group_id uuid not null references public.profile_groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member', -- owner|member
  status text not null default 'ACTIVE', -- ACTIVE|LEFT|REMOVED
  joined_at timestamptz not null default now(),
  constraint profile_group_members_role_check check (role in ('owner', 'member')),
  constraint profile_group_members_status_check check (status in ('ACTIVE', 'LEFT', 'REMOVED')),
  constraint profile_group_members_pk primary key (group_id, user_id)
);

create index if not exists profile_group_members_group_idx on public.profile_group_members (group_id);
create index if not exists profile_group_members_user_idx on public.profile_group_members (user_id);

-- A user can be active in at most one group at a time
create unique index if not exists uq_active_member_single_group
  on public.profile_group_members (user_id)
  where status = 'ACTIVE';

-- Invites
create table if not exists public.profile_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.profile_groups (id) on delete cascade,
  inviter_id uuid not null references public.users (id) on delete cascade,
  invitee_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'PENDING', -- PENDING|ACCEPTED|DECLINED|CANCELLED|EXPIRED
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz,
  constraint profile_group_invites_status_check
    check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);

create index if not exists profile_group_invites_group_idx on public.profile_group_invites (group_id);
create index if not exists profile_group_invites_invitee_idx on public.profile_group_invites (invitee_id, status);
create index if not exists profile_group_invites_inviter_idx on public.profile_group_invites (inviter_id, status);

-- Avoid duplicate active invites to the same user for the same group
create unique index if not exists uq_pending_invite_per_group_user
  on public.profile_group_invites (group_id, invitee_id)
  where status = 'PENDING';

-- Utility: set updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profile_groups_updated on public.profile_groups;
create trigger trg_profile_groups_updated
before update on public.profile_groups
for each row execute function public.set_updated_at();

-- Capacity enforcement (max 4 ACTIVE members)
create or replace function public.enforce_group_capacity()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if (tg_op = 'INSERT' and new.status = 'ACTIVE')
     or (tg_op = 'UPDATE' and new.status = 'ACTIVE' and (old.status is distinct from new.status)) then
    select count(*) into active_count
    from public.profile_group_members
    where group_id = new.group_id and status = 'ACTIVE';
    if active_count >= 4 then
      raise exception 'Group % already has 4 active members', new.group_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_group_capacity on public.profile_group_members;
create trigger trg_enforce_group_capacity
before insert or update on public.profile_group_members
for each row execute function public.enforce_group_capacity();

-- RLS
alter table public.profile_groups enable row level security;
alter table public.profile_group_members enable row level security;
alter table public.profile_group_invites enable row level security;

-- profile_groups policies
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_groups' and policyname='groups_select_members_or_creator'
  ) then
    create policy groups_select_members_or_creator on public.profile_groups
      for select using (
        auth.uid() = created_by
        or exists (
          select 1 from public.profile_group_members m
          where m.group_id = profile_groups.id and m.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_groups' and policyname='groups_insert_creator'
  ) then
    create policy groups_insert_creator on public.profile_groups
      for insert with check (auth.uid() = created_by);
  end if;
end $$;

-- Allow only creator (or future: owner) to update group
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_groups' and policyname='groups_update_creator'
  ) then
    create policy groups_update_creator on public.profile_groups
      for update using (auth.uid() = created_by);
  end if;
end $$;

-- profile_group_members policies
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_members' and policyname='members_select_same_group'
  ) then
    create policy members_select_same_group on public.profile_group_members
      for select using (
        exists (
          select 1 from public.profile_group_members m2
          where m2.group_id = profile_group_members.group_id
            and m2.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- Disallow direct writes to members; membership is added via RPC after acceptance
revoke insert, update, delete on public.profile_group_members from anon, authenticated;

-- profile_group_invites policies
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_invites' and policyname='invites_select_parties'
  ) then
    create policy invites_select_parties on public.profile_group_invites
      for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_invites' and policyname='invites_insert_inviter'
  ) then
    create policy invites_insert_inviter on public.profile_group_invites
      for insert with check (auth.uid() = inviter_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='profile_group_invites' and policyname='invites_update_by_parties'
  ) then
    create policy invites_update_by_parties on public.profile_group_invites
      for update using (
        -- invitee can accept/decline; inviter can cancel
        auth.uid() = invitee_id or auth.uid() = inviter_id
      );
  end if;
end $$;

-- RPC: accept invite. Adds membership (if capacity allows) and transitions group to ACTIVE
create or replace function public.accept_profile_group_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_invitee uuid;
  v_status text;
  v_active_count integer;
  v_creator uuid;
begin
  select group_id, invitee_id, status
    into v_group_id, v_invitee, v_status
  from public.profile_group_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_invitee <> auth.uid() then
    raise exception 'Only the invitee can accept this invite';
  end if;

  if v_status <> 'PENDING' then
    raise exception 'Invite is not pending';
  end if;

  -- capacity check
  select count(*) into v_active_count
  from public.profile_group_members
  where group_id = v_group_id and status = 'ACTIVE';
  if v_active_count >= 4 then
    raise exception 'Group already has 4 active members';
  end if;

  -- Add invitee as ACTIVE member
  insert into public.profile_group_members (group_id, user_id, role, status)
  values (v_group_id, auth.uid(), 'member', 'ACTIVE')
  on conflict (group_id, user_id) do update set status = 'ACTIVE';

  -- Ensure creator is a member (owner)
  select created_by into v_creator from public.profile_groups where id = v_group_id;
  insert into public.profile_group_members (group_id, user_id, role, status)
  values (v_group_id, v_creator, 'owner', 'ACTIVE')
  on conflict do nothing;

  -- Mark invite accepted
  update public.profile_group_invites
     set status = 'ACCEPTED', responded_at = now()
   where id = p_invite_id;

  -- If at least two active members -> ACTIVE
  select count(*) into v_active_count
  from public.profile_group_members
  where group_id = v_group_id and status = 'ACTIVE';
  if v_active_count >= 2 then
    update public.profile_groups set status = 'ACTIVE', updated_at = now()
    where id = v_group_id and status = 'PENDING';
  end if;

  return v_group_id;
end;
$$;

grant execute on function public.accept_profile_group_invite(uuid) to authenticated;


