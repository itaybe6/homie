-- Drop the server-side helper function; ניהול החברות בקבוצה יעשה כולו מהקליינט.

drop function if exists public.add_user_to_group(uuid, uuid);


