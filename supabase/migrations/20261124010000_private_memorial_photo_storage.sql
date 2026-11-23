-- Private memorial photos shared by the existing staff and visitor workflows.
begin;

do $$
begin
  if exists (
    select 1 from storage.buckets
    where id <> 'burial-photos'
      and (id ilike '%photo%' or name ilike '%photo%')
  ) then
    raise exception 'An existing photo bucket requires review before provisioning burial-photos';
  end if;
end
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'burial-photos',
  'burial-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy burial_photos_staff_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'burial-photos'
  and name ~ '^burial/[1-9][0-9]*/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$'
  and public.is_active_admin_or_manager()
);

create policy burial_photos_staff_select on storage.objects
for select to authenticated
using (
  bucket_id = 'burial-photos'
  and name ~ '^burial/[1-9][0-9]*/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$'
  and public.is_active_admin_or_manager()
);

create policy burial_photos_staff_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'burial-photos'
  and name ~ '^burial/[1-9][0-9]*/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$'
  and public.is_active_admin_or_manager()
);

create policy burial_photos_public_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'burial-photos'
  and name ~ '^burial/[1-9][0-9]*/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$'
  and exists (
    select 1 from public.public_burial_photos p
    where p.storage_path = storage.objects.name
  )
);

commit;
