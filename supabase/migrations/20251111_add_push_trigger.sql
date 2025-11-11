-- Enable HTTP extension (for outbound HTTPS to Expo push API)
create extension if not exists http with schema extensions;

-- Store Expo push token per user
alter table public.users
  add column if not exists expo_push_token text;

-- Trigger function: on new notification, send Expo push to recipient (best-effort)
create or replace function public.trigger_send_expo_push()
returns trigger
language plpgsql
as $$
declare
  token text;
  v_title text;
  v_body text;
begin
  select u.expo_push_token
    into token
    from public.users u
   where u.id = new.recipient_id;

  if token is null or length(token) = 0 then
    return new;
  end if;

  v_title := coalesce(new.title, 'התראה חדשה');
  v_body  := coalesce(new.description, new.title, 'יש לך התראה חדשה');

  begin
    perform
      1
    from extensions.http_post(
      'https://exp.host/--/api/v2/push/send',
      json_build_object(
        'to', token,
        'title', v_title,
        'body', v_body,
        'sound', 'default'
      )::text,
      'application/json'
    );
  exception
    when others then
      -- Do not block the insert if push fails
      null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_expo_push on public.notifications;
create trigger trg_notify_expo_push
after insert on public.notifications
for each row
execute function public.trigger_send_expo_push();



