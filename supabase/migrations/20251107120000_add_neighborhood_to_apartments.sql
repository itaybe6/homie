-- Add optional neighborhood field to apartments (idempotent)
alter table if exists public.apartments
  add column if not exists neighborhood text;

-- Optional: simple index to speed up text queries on neighborhood
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_apartments_neighborhood'
  ) then
    create index idx_apartments_neighborhood on public.apartments using gin (neighborhood gin_trgm_ops);
  end if;
exception when undefined_object then
  -- pg_trgm extension may not be installed; ignore silently
  null;
end $$;


