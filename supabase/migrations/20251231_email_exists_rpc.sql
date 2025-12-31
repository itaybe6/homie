-- RPC helper to check whether an email is already registered (exists in auth.users).
-- Purpose: prevent "register" flow (OTP) from silently turning into "login" for existing emails.
--
-- Security note: This exposes email existence to anonymous clients (can be used for enumeration).
-- If you need to reduce abuse, consider rate limiting via Edge Function / CAPTCHA / WAF.

do $$
begin
  if to_regclass('auth.users') is null then
    raise notice 'auth.users not found; skipping email_exists rpc';
    return;
  end if;

  create or replace function public.email_exists(email_to_check text)
  returns boolean
  language plpgsql
  security definer
  set search_path = auth, public
  as $fn$
  begin
    if email_to_check is null or btrim(email_to_check) = '' then
      return false;
    end if;

    return exists (
      select 1
      from auth.users u
      where lower(u.email) = lower(btrim(email_to_check))
      limit 1
    );
  end;
  $fn$;

  -- Allow calling the function from the client (anon/authenticated).
  grant execute on function public.email_exists(text) to anon, authenticated;
end $$;


