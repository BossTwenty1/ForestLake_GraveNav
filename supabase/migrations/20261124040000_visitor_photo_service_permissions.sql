-- Server-only visitor photo submissions need explicit privileges in this schema.
-- Keep public eligibility, photo RLS, private contacts and staff moderation unchanged.
begin;

grant select on public.public_burial_records to service_role;
grant select, insert on public.photo to service_role;
grant usage on sequence public.photo_photo_id_seq to service_role;

commit;
