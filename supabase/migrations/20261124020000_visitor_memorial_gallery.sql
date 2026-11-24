-- Moderated visitor remembrance photo gallery (max 5 active tribute photos per memorial).
-- Keeps official profile portraits (photo_kind = 'portrait') strictly separate from
-- visitor-submitted gallery photos (photo_kind = 'tribute').
begin;

alter table public.photo
  alter column uploaded_by drop not null;

alter table public.photo
  add column if not exists photo_kind text not null default 'portrait',
  add column if not exists submitted_by_name text,
  add column if not exists submitted_by_relation text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photo_kind_check'
  ) then
    alter table public.photo
      add constraint photo_kind_check
      check (photo_kind in ('portrait', 'tribute'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'photo_submitted_by_name_check'
  ) then
    alter table public.photo
      add constraint photo_submitted_by_name_check
      check (submitted_by_name is null or char_length(trim(submitted_by_name)) between 1 and 80);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'photo_submitted_by_relation_check'
  ) then
    alter table public.photo
      add constraint photo_submitted_by_relation_check
      check (submitted_by_relation is null or submitted_by_relation in ('Family', 'Relative', 'Friend', 'Visitor'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'photo_uploader_source_check'
  ) then
    alter table public.photo
      add constraint photo_uploader_source_check
      check (
        (photo_kind = 'portrait' and uploaded_by is not null)
        or (photo_kind = 'tribute' and (uploaded_by is not null or submitted_by_name is not null))
      );
  end if;
end
$$;

create index if not exists photo_burial_kind_status_idx
  on public.photo (burial_id, photo_kind, approval_status);

-- Enforce max 5 active (pending + approved) visitor tribute photos per memorial atomically.
create or replace function public.enforce_visitor_tribute_photo_limit()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.photo_kind = 'tribute' and new.approval_status in ('pending', 'approved') then
    perform pg_advisory_xact_lock(hashtext('gravenav_tribute_limit:' || new.burial_id::text));
    select count(*)
      into active_count
      from public.photo
     where burial_id = new.burial_id
       and photo_kind = 'tribute'
       and approval_status in ('pending', 'approved')
       and (tg_op = 'INSERT' or photo_id <> new.photo_id);
    if active_count >= 5 then
      raise exception 'This memorial gallery has reached its 5-photo limit.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_visitor_tribute_photo_limit on public.photo;
create trigger trg_enforce_visitor_tribute_photo_limit
before insert or update of burial_id, photo_kind, approval_status
on public.photo
for each row
execute function public.enforce_visitor_tribute_photo_limit();

-- Expose photo_kind and approved submitter attribution on the safe public view.
create or replace view public.public_burial_photos
with (security_barrier = true)
as
select
  p.photo_id,
  p.burial_id,
  p.storage_path,
  p.file_name,
  p.caption,
  p.captured_at,
  p.photo_kind,
  p.submitted_by_name,
  p.submitted_by_relation
from public.photo p
join public.public_burial_records br using (burial_id)
where p.approval_status = 'approved'
  and p.public_display;

revoke all on public.public_burial_photos from public;
grant select on public.public_burial_photos to anon, authenticated;

-- Aggregate-only public slot count RPC (never exposes pending photo paths or metadata).
create or replace function public.get_memorial_gallery_slots(p_burial_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved integer := 0;
  v_pending integer := 0;
  v_max constant integer := 5;
begin
  if p_burial_id is null or p_burial_id <= 0 then
    return jsonb_build_object('approved', 0, 'pending', 0, 'maxSlots', v_max, 'remaining', 0);
  end if;

  if not exists (
    select 1 from public.public_burial_records where burial_id = p_burial_id
  ) then
    return jsonb_build_object('approved', 0, 'pending', 0, 'maxSlots', v_max, 'remaining', 0);
  end if;

  select
    count(*) filter (where approval_status = 'approved' and public_display),
    count(*) filter (where approval_status = 'pending')
    into v_approved, v_pending
    from public.photo
   where burial_id = p_burial_id
     and photo_kind = 'tribute';

  return jsonb_build_object(
    'approved', v_approved,
    'pending', v_pending,
    'maxSlots', v_max,
    'remaining', greatest(0, v_max - (v_approved + v_pending))
  );
end;
$$;

revoke all on function public.get_memorial_gallery_slots(bigint) from public;
grant execute on function public.get_memorial_gallery_slots(bigint) to anon, authenticated;

commit;
