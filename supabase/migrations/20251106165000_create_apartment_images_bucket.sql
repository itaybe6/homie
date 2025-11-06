-- Create public storage bucket for apartment images + policies (idempotent)
insert into storage.buckets (id, name, public)
values ('apartment-images', 'apartment-images', true)
on conflict (id) do nothing;

-- Recreate policies in an idempotent way
drop policy if exists "Public read apartment-images" on storage.objects;
drop policy if exists "Authenticated insert apartment-images" on storage.objects;
drop policy if exists "Owner update apartment-images" on storage.objects;
drop policy if exists "Owner delete apartment-images" on storage.objects;

-- Allow public read of images in this bucket
create policy "Public read apartment-images"
on storage.objects for select
using (bucket_id = 'apartment-images');

-- Allow authenticated users to upload to this bucket
create policy "Authenticated insert apartment-images"
on storage.objects for insert to authenticated
with check (bucket_id = 'apartment-images');

-- Allow owners to update their own images
create policy "Owner update apartment-images"
on storage.objects for update to authenticated
using (bucket_id = 'apartment-images' and owner = auth.uid())
with check (bucket_id = 'apartment-images' and owner = auth.uid());

-- Allow owners to delete their own images
create policy "Owner delete apartment-images"
on storage.objects for delete to authenticated
using (bucket_id = 'apartment-images' and owner = auth.uid());


