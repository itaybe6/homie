-- Ensure required extension for gen_random_uuid()
create extension if not exists "pgcrypto";
-- Create requests table to track join requests and similar actions
create table if not exists public.apartments_request (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.users (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  apartment_id uuid references public.apartments (id) on delete cascade,
  type text not null default 'JOIN_APT',
  status text not null default 'PENDING',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_apartments_request_sender on public.apartments_request (sender_id, created_at desc);
create index if not exists idx_apartments_request_recipient on public.apartments_request (recipient_id, created_at desc);
create index if not exists idx_apartments_request_apartment on public.apartments_request (apartment_id);

-- Optional: simple RLS (assumes RLS enabled on project)
-- enable row level security
alter table public.apartments_request enable row level security;

-- Policies: sender or recipient can read row
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'apartments_request' and policyname = 'Requests read own rows') then
    create policy "Requests read own rows" on public.apartments_request
    for select using (auth.uid() = sender_id or auth.uid() = recipient_id);
  end if;
end $$;

-- Insert: only as authenticated user (sender_id must equal auth.uid())
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'apartments_request' and policyname = 'Requests insert by sender') then
    create policy "Requests insert by sender" on public.apartments_request
    for insert with check (auth.uid() = sender_id);
  end if;
end $$;

-- Update: sender or recipient can update (e.g., cancel or approve)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'apartments_request' and policyname = 'Requests update by parties') then
    create policy "Requests update by parties" on public.apartments_request
    for update using (auth.uid() = sender_id or auth.uid() = recipient_id);
  end if;
end $$;


