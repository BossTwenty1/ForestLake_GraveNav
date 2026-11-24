-- Conditional visitor profile portrait requests (max 1 active portrait per no-photo memorial)
-- with private admin-only submitter contact for verification before approval.
begin;

alter table public.photo
  add column if not exists submitted_by_contact text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'photo_submitted_by_contact_check'
  ) then
    alter table public.photo
      add constraint photo_submitted_by_contact_check
      check (submitted_by_contact is null or char_length(trim(submitted_by_contact)) between 5 and 120);
  end if;
end
$$;

alter table public.photo
  drop constraint if exists photo_uploader_source_check;

alter table public.photo
  add constraint photo_uploader_source_check
  check (
    uploaded_by is not null
    or (photo_kind = 'tribute' and submitted_by_name is not null)
    or (photo_kind = 'portrait' and submitted_by_name is not null and submitted_by_contact is not null)
  );

-- Atomically enforce both caps:
-- 1) Visitor tribute gallery: max 5 active (pending + approved) per memorial.
-- 2) Visitor portrait request (uploaded_by is null): only allowed when no active portrait exists.
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
  elsif new.photo_kind = 'portrait' and new.uploaded_by is null and new.approval_status in ('pending', 'approved') then
    perform pg_advisory_xact_lock(hashtext('gravenav_portrait_limit:' || new.burial_id::text));
    select count(*)
      into active_count
      from public.photo
     where burial_id = new.burial_id
       and photo_kind = 'portrait'
       and approval_status in ('pending', 'approved')
       and (tg_op = 'INSERT' or photo_id <> new.photo_id);
    if active_count >= 1 then
      raise exception 'This memorial already has a profile portrait or a portrait awaiting review.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Update aggregate-only public slot RPC to also report portrait availability (never leaks contact/paths).
create or replace function public.get_memorial_gallery_slots(p_burial_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approved integer := 0;
  v_pending integer := 0;
  v_portrait_approved integer := 0;
  v_portrait_pending integer := 0;
  v_max constant integer := 5;
begin
  if p_burial_id is null or p_burial_id <= 0 then
    return jsonb_build_object(
      'approved', 0,
      'pending', 0,
      'maxSlots', v_max,
      'remaining', 0,
      'portraitApproved', 0,
      'portraitPending', 0,
      'canSubmitPortrait', false
    );
  end if;

  if not exists (
    select 1 from public.public_burial_records where burial_id = p_burial_id
  ) then
    return jsonb_build_object(
      'approved', 0,
      'pending', 0,
      'maxSlots', v_max,
      'remaining', 0,
      'portraitApproved', 0,
      'portraitPending', 0,
      'canSubmitPortrait', false
    );
  end if;

  select
    count(*) filter (where photo_kind = 'tribute' and approval_status = 'approved' and public_display),
    count(*) filter (where photo_kind = 'tribute' and approval_status = 'pending'),
    count(*) filter (where photo_kind = 'portrait' and approval_status = 'approved' and public_display),
    count(*) filter (where photo_kind = 'portrait' and approval_status = 'pending')
    into v_approved, v_pending, v_portrait_approved, v_portrait_pending
    from public.photo
   where burial_id = p_burial_id;

  return jsonb_build_object(
    'approved', v_approved,
    'pending', v_pending,
    'maxSlots', v_max,
    'remaining', greatest(0, v_max - (v_approved + v_pending)),
    'portraitApproved', v_portrait_approved,
    'portraitPending', v_portrait_pending,
    'canSubmitPortrait', (v_portrait_approved + v_portrait_pending) = 0
  );
end;
$$;

revoke all on function public.get_memorial_gallery_slots(bigint) from public;
grant execute on function public.get_memorial_gallery_slots(bigint) to anon, authenticated;

commit;
