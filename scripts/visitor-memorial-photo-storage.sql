-- Review and apply separately in the intended environment, after provisioning
-- a private bucket named gravenav-memorial-photos. This grants no writes.
begin;
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'gravenav-memorial-photos' and public is false) then
    raise exception 'Provision a private gravenav-memorial-photos bucket before applying this policy';
  end if;
end
$$;

drop policy if exists visitor_read_approved_memorial_photos on storage.objects;
create policy visitor_read_approved_memorial_photos on storage.objects
for select to anon
using (
  bucket_id = 'gravenav-memorial-photos'
  and exists (
    select 1
    from public.public_burial_photos as photo
    where photo.storage_path = storage.objects.name
      and photo.storage_path like 'burial/' || photo.burial_id::text || '/%'
  )
);
commit;
