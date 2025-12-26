-- Users (profile) table RLS + optional trigger to auto-create a profile row on signup.
-- This fixes: "new row violates row-level security policy for table 'users'".
--
-- Notes:
-- - Assumes profile table is `public.users` keyed by `id` (uuid) that matches `auth.uid()`.
-- - If your project uses a different profile table name, adjust accordingly.
-- - The trigger uses Auth user metadata (raw_user_meta_data) set during signup.

do $$
begin
  if to_regclass('public.users') is null then
    raise notice 'public.users table not found; skipping users RLS setup';
    return;
  end if;

  -- Enable RLS (safe if already enabled)
  alter table public.users enable row level security;

  -- Policies
  drop policy if exists "users_select_authenticated" on public.users;
  drop policy if exists "users_insert_own_row" on public.users;
  drop policy if exists "users_update_own_row" on public.users;
  drop policy if exists "users_delete_own_row" on public.users;

  -- Allow reading profiles (the app displays other users)
  create policy "users_select_authenticated"
    on public.users
    for select
    to authenticated
    using (true);

  -- Allow a user to create their own profile row
  create policy "users_insert_own_row"
    on public.users
    for insert
    to authenticated
    with check (id = auth.uid());

  -- Allow a user to update their own profile
  create policy "users_update_own_row"
    on public.users
    for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

  -- Allow a user to delete their own profile (used by settings screens)
  create policy "users_delete_own_row"
    on public.users
    for delete
    to authenticated
    using (id = auth.uid());
end $$;

-- Optional: auto-create a profile row when a new auth user is created.
-- This avoids client-side INSERT failing when email confirmation is enabled (no session yet).
do $$
begin
  if to_regclass('auth.users') is null or to_regclass('public.users') is null then
    raise notice 'auth.users or public.users not found; skipping auth trigger setup';
    return;
  end if;

  create or replace function public.handle_new_auth_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    insert into public.users (
      id,
      email,
      full_name,
      role,
      phone,
      age,
      bio,
      gender,
      city,
      avatar_url,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data->>'full_name', ''),
      coalesce(new.raw_user_meta_data->>'role', 'user'),
      nullif(new.raw_user_meta_data->>'phone', ''),
      case
        when (new.raw_user_meta_data->>'age') is null then null
        else (new.raw_user_meta_data->>'age')::int
      end,
      nullif(new.raw_user_meta_data->>'bio', ''),
      nullif(new.raw_user_meta_data->>'gender', ''),
      nullif(new.raw_user_meta_data->>'city', ''),
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      now(),
      now()
    )
    on conflict (id) do update
      set email = excluded.email,
          updated_at = now();

    return new;
  end;
  $fn$;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_create_profile'
  ) then
    create trigger on_auth_user_created_create_profile
      after insert on auth.users
      for each row execute procedure public.handle_new_auth_user();
  end if;
end $$;


