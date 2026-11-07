begin;

alter table public.lot
  add column grave_type text,
  add column grave_policy_reference text,
  add column approved_mausoleum_capacity integer,
  add constraint lot_grave_policy_check check (
    case when grave_type is null then grave_policy_reference is null and approved_mausoleum_capacity is null
      else grave_type in ('regular', 'mausoleum')
        and nullif(btrim(grave_policy_reference), '') is not null
        and length(grave_policy_reference) <= 250
        and (approved_mausoleum_capacity is null or (grave_type = 'mausoleum' and approved_mausoleum_capacity > 0))
    end
  );

-- Existing assignments keep their IDs and reserve slot one. NULL confirmation marks
-- legacy records whose physical confirmation was not captured by the old system.
alter table public.burial_record
  add column interment_slot integer not null default 1 check (interment_slot > 0),
  add column interment_confirmed boolean,
  add constraint burial_lot_interment_slot_key unique (lot_id, interment_slot);
drop index public.burial_record_single_plot_key;

create function public.grave_interment_limit(p_type text, p_approved_capacity integer)
returns integer language sql immutable set search_path = pg_catalog
as $$
  select case p_type when 'regular' then 6 when 'mausoleum' then coalesce(p_approved_capacity, 0) else 1 end
$$;

-- Private write fence: force a real write under snapshot isolation without
-- changing staff-visible plot revisions or coordinate history.
create table public.grave_interment_write_fence (
  lot_id bigint primary key references public.lot(lot_id) on delete cascade
);
alter table public.grave_interment_write_fence enable row level security;
revoke all on table public.grave_interment_write_fence from public, anon, authenticated;

create function public.guard_grave_policy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare highest_slot integer;
begin
  if tg_op = 'UPDATE' then
    if (new.grave_type, new.grave_policy_reference, new.approved_mausoleum_capacity)
      is not distinct from (old.grave_type, old.grave_policy_reference, old.approved_mausoleum_capacity) then
      return new;
    end if;
  elsif new.grave_type is null and new.grave_policy_reference is null and new.approved_mausoleum_capacity is null then
    return new;
  end if;
  if not public.is_active_admin() then
    raise exception 'Only administrators may approve grave classification or mausoleum capacity' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    insert into public.grave_interment_write_fence(lot_id) values (new.lot_id)
      on conflict (lot_id) do update set lot_id = excluded.lot_id;
  end if;
  select max(interment_slot) into highest_slot from public.burial_record where lot_id = new.lot_id;
  if highest_slot > greatest(1, public.grave_interment_limit(new.grave_type, new.approved_mausoleum_capacity)) then
    raise exception 'Approved capacity cannot be reduced below existing reservations';
  end if;
  return new;
end
$$;

create trigger lot_grave_policy before insert or update on public.lot
  for each row execute function public.guard_grave_policy();

create function public.reserve_interment_slot()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  plot public.lot%rowtype;
  new_slot boolean := tg_op = 'INSERT';
  check_order boolean := tg_op = 'INSERT';
  legacy_active boolean := false;
begin
  new.interment_order_number := nullif(btrim(new.interment_order_number), '');
  if tg_op = 'UPDATE' then
    -- Only pre-migration rows can carry an unknown confirmation state.
    if old.interment_confirmed is false and new.interment_confirmed is null then
      new.interment_confirmed := false;
    end if;
    new_slot := new.lot_id is distinct from old.lot_id;
    check_order := new_slot or new.interment_order_number is distinct from old.interment_order_number
      or (new.interment_confirmed is true and old.interment_confirmed is not true);
    legacy_active := not new_slot and old.interment_confirmed is null and old.record_status = 'active';
    if old.interment_confirmed is true and (new.interment_confirmed is not true
      or new.interment_order_number is distinct from old.interment_order_number) then
      raise exception 'Confirmed interment approval and order are retained; refer corrections for reconciliation';
    end if;
    if new_slot then
      perform 1 from public.lot where lot_id in (old.lot_id, new.lot_id)
        order by lot_id for no key update;
      if old.interment_confirmed is true or exists (
        select 1 from public.lot where lot_id = old.lot_id and grave_type is not null
      ) then
        raise exception 'Moving a classified or confirmed interment requires a separate reconciliation';
      end if;
    else
      new.interment_slot := old.interment_slot;
    end if;
  else
    new.interment_confirmed := coalesce(new.interment_confirmed, false);
  end if;

  if new_slot or check_order or new.interment_confirmed is true then
    select * into plot from public.lot where lot_id = new.lot_id and deleted_at is null for no key update;
    if not found then raise exception 'The plot is unavailable'; end if;
    insert into public.grave_interment_write_fence(lot_id) values (new.lot_id)
      on conflict (lot_id) do update set lot_id = excluded.lot_id;
  else
    select * into plot from public.lot where lot_id = new.lot_id and deleted_at is null;
  end if;
  if not found then raise exception 'The plot is unavailable'; end if;

  if new_slot then
    if plot.status <> 'AVAILABLE' then raise exception 'The selected plot is not available'; end if;
    if plot.grave_type = 'mausoleum' and plot.approved_mausoleum_capacity is null then
      raise exception 'This mausoleum needs an approved arrangement and capacity before admission';
    end if;
    select coalesce(max(interment_slot), 0) + 1 into new.interment_slot
      from public.burial_record where lot_id = new.lot_id;
    if new.interment_slot > public.grave_interment_limit(plot.grave_type, plot.approved_mausoleum_capacity) then
      if plot.grave_type is null then raise exception 'The selected plot already has a burial record'; end if;
      raise exception 'The plot has no remaining approved interment capacity';
    end if;
  end if;

  if check_order and new.interment_order_number is not null and exists (
    select 1 from public.burial_record b
    where b.lot_id = new.lot_id and b.burial_id is distinct from new.burial_id
      and lower(btrim(b.interment_order_number)) = lower(new.interment_order_number)
  ) then raise exception 'This interment order already has a record on the plot; reconcile it before proceeding'; end if;

  if new.interment_confirmed is true and exists (
    select 1 from public.deceased incoming
    join public.burial_record existing on existing.lot_id = new.lot_id
      -- A pending duplicate cannot block editing or recovery of a confirmed burial.
      and existing.interment_confirmed is not false
      and existing.burial_id is distinct from new.burial_id and existing.deceased_id <> new.deceased_id
    join public.deceased known on known.deceased_id = existing.deceased_id
    where incoming.deceased_id = new.deceased_id
      and lower(regexp_replace(btrim(incoming.display_name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(known.display_name), '\s+', ' ', 'g'))
      and (incoming.birth_date is not null or incoming.death_date is not null)
      and (incoming.birth_date, incoming.death_date) is not distinct from (known.birth_date, known.death_date)
  ) then raise exception 'A matching person already has an association at this plot; reconcile before proceeding'; end if;

  if new.interment_confirmed is true and (new.interment_order_number is null or new.interment_date is null) then
    raise exception 'Confirm an interment only with a reviewed order and interment date';
  end if;
  if plot.grave_type is not null and new.record_status = 'active'
    and new.interment_confirmed is not true and not legacy_active then
    raise exception 'Resolve and confirm the interment before making its record active';
  end if;
  return new;
end
$$;

create trigger burial_interment_slot before insert or update on public.burial_record
  for each row execute function public.reserve_interment_slot();

revoke all on function public.guard_grave_policy(), public.reserve_interment_slot(), public.grave_interment_limit(text, integer) from public, anon, authenticated;

-- Kept behind the existing role, revision, request receipt and record history boundary.
create or replace function public.staff_save_record(
 p_entity text, p_id text, p_revision integer, p_values jsonb,
 p_request_id uuid, p_operation text default 'save'
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
 actor uuid := auth.uid(); admin boolean := public.is_active_admin();
 pk text; allowed text[]; oldrow jsonb; patch jsonb := coalesce(p_values, '{}'::jsonb);
 request jsonb; prior public.staff_mutation; saved_result jsonb; saved_id text := p_id;
 assignments text; columns_sql text; values_sql text; new_revision integer;
 history public.record_history; operation text := p_operation;
 person_id bigint;
begin
 if actor is null or not public.is_active_admin_or_manager() then
   raise exception 'An active staff account is required' using errcode = '42501'; end if;
 if p_entity not in ('lot','lot_owner','burial_record','photo','account')
   or operation not in ('save','delete','restore','revert','review','approve','activate','deactivate','role') then
   raise exception 'Unsupported operation'; end if;
 if (operation <> 'save' or p_entity in ('account','photo')) and not admin then
   raise exception 'Only administrators may review, recover, remove, or manage accounts' using errcode = '42501'; end if;
 if p_request_id is null then raise exception 'A request identifier is required'; end if;
 request := jsonb_build_object('entity',p_entity,'id',p_id,'revision',p_revision,'values',patch,'operation',operation);
 insert into public.staff_mutation(actor_id,request_id,request) values(actor,p_request_id,request) on conflict do nothing;
 select * into prior from public.staff_mutation where actor_id = actor and request_id = p_request_id for update;
 if prior.request <> request then raise exception 'Request identifier was reused for different changes'; end if;
 if prior.result is not null then return prior.result; end if;

 pk := case p_entity when 'lot' then 'lot_id' when 'lot_owner' then 'lot_owner_id'
   when 'burial_record' then 'burial_id' when 'photo' then 'photo_id' else 'account_id' end;
 if p_id is not null then
   execute format('select to_jsonb(t) from public.%I t where %I::text = $1 for update',p_entity,pk) into oldrow using p_id;
   if oldrow is null then raise exception 'Record not found'; end if;
   if p_revision is null or (oldrow->>'revision')::integer <> p_revision then
     raise exception 'Another staff member changed this record. Reload it before saving.' using errcode = '40001'; end if;
   if p_entity = 'burial_record' then
     perform 1 from public.deceased where deceased_id = (oldrow->>'deceased_id')::bigint for update;
     oldrow := oldrow || (select jsonb_build_object('display_name',display_name,'birth_date',birth_date,
       'death_date',death_date,'public_display',public_display) from public.deceased where deceased_id = (oldrow->>'deceased_id')::bigint);
   end if;
 elsif operation <> 'save' or p_entity in ('photo','account') then raise exception 'Select an existing record';
 end if;

 allowed := case p_entity
 when 'lot' then array['area_id','block_id','lot_owner_id','lot_code','legacy_location_code','legacy_pa_number','status','length_m','width_m','location_geom','coordinate_accuracy_m','grave_type','grave_policy_reference','approved_mausoleum_capacity']
 when 'lot_owner' then array['first_name','middle_name','last_name','suffix','aliases','address','representative_name','representative_contact','representative_relation']
 when 'burial_record' then array['display_name','birth_date','death_date','public_display','lot_id','interment_date','record_status','interment_status','remains_type','reference_no','service_provider','record_source','quality_notes','interment_order_number','interment_confirmed']
 else array[]::text[] end;

 if operation = 'revert' then
   select * into history from public.record_history where history_id = (patch->>'history_id')::bigint
     and entity = p_entity and record_id = p_id;
   if not found or history.after_revision <> p_revision then
     raise exception 'Only the latest unchanged version can be undone. Review the history and edit the current record instead.'; end if;
   select coalesce(jsonb_object_agg(key,value),'{}') into patch from jsonb_each(history.before_values) where key = any(allowed);
   -- Reverting an edit does not silently republish a deleted record.
   if oldrow->>'deleted_at' is not null then raise exception 'Restore the removed record first'; end if;
   operation := 'save';
 end if;

 if operation = 'save' then
   if oldrow->>'deleted_at' is not null then raise exception 'Restore the removed record before editing'; end if;
   if exists(select 1 from jsonb_object_keys(patch) key where not key = any(allowed)) then raise exception 'Unsupported record fields'; end if;
   if p_entity in ('account','photo') then raise exception 'Use the review or account action'; end if;
   if p_entity = 'burial_record' then
     if nullif(btrim(patch->>'display_name'),'') is null then raise exception 'A display name is required'; end if;
     if p_id is null then
       insert into public.deceased(display_name,birth_date,death_date,public_display)
       values (btrim(patch->>'display_name'),(patch->>'birth_date')::date,(patch->>'death_date')::date,
         coalesce((patch->>'public_display')::boolean,false)) returning deceased_id into person_id;
       insert into public.burial_record(deceased_id,lot_id,created_by,updated_by,interment_date,record_status,
         interment_status,remains_type,reference_no,service_provider,record_source,quality_notes,
         interment_order_number,interment_confirmed)
       values (person_id,(patch->>'lot_id')::bigint,actor,actor,(patch->>'interment_date')::date,
         patch->>'record_status',patch->>'interment_status',patch->>'remains_type',patch->>'reference_no',
         patch->>'service_provider',patch->>'record_source',patch->>'quality_notes',
         patch->>'interment_order_number',coalesce((patch->>'interment_confirmed')::boolean,false))
       returning burial_id::text into saved_id;
     else
       update public.deceased set display_name=btrim(patch->>'display_name'),birth_date=(patch->>'birth_date')::date,
         death_date=(patch->>'death_date')::date,public_display=coalesce((patch->>'public_display')::boolean,false)
         where deceased_id=(oldrow->>'deceased_id')::bigint;
       update public.burial_record set lot_id=(patch->>'lot_id')::bigint,updated_by=actor,
         interment_date=(patch->>'interment_date')::date,record_status=patch->>'record_status',
         interment_status=patch->>'interment_status',remains_type=patch->>'remains_type',reference_no=patch->>'reference_no',
         service_provider=patch->>'service_provider',record_source=patch->>'record_source',quality_notes=patch->>'quality_notes',
         interment_order_number=case when patch ? 'interment_order_number' then patch->>'interment_order_number' else interment_order_number end,
         interment_confirmed=case when patch ? 'interment_confirmed' then (patch->>'interment_confirmed')::boolean else interment_confirmed end
         where burial_id=p_id::bigint;
     end if;
   else
     if p_entity = 'lot' then
       if nullif(trim(patch->>'lot_code'),'') is null then raise exception 'A plot code is required'; end if;
       if patch->>'lot_owner_id' is not null then
         perform 1 from public.lot_owner where lot_owner_id = (patch->>'lot_owner_id')::bigint and deleted_at is null for update;
         if not found then raise exception 'The owner is unavailable'; end if;
       end if;
       -- GeoJSON is converted explicitly; recovery snapshots use the stored PostGIS representation.
       if jsonb_typeof(patch->'location_geom') = 'object' then
         if patch->'location_geom'->>'type' <> 'Point'
           or jsonb_array_length(patch->'location_geom'->'coordinates') <> 2
           or not ((patch->'location_geom'->'coordinates'->>0)::numeric between -180 and 180)
           or not ((patch->'location_geom'->'coordinates'->>1)::numeric between -90 and 90) then
           raise exception 'Enter a valid longitude and latitude'; end if;
         patch := jsonb_set(patch,'{location_geom}',to_jsonb(extensions.st_geomfromgeojson((patch->'location_geom')::text)::extensions.geography));
       end if;
       if p_id is null or p_operation = 'revert' or patch->'location_geom' is distinct from oldrow->'location_geom'
         or patch->'area_id' is distinct from oldrow->'area_id' then
         patch := patch || jsonb_build_object('coordinate_verified',false,'coordinate_status','pending','coordinate_rejection_reason',null);
       end if;
     end if;
     select string_agg(format('%I = r.%I',key,key),', '),string_agg(format('%I',key),', '),string_agg(format('r.%I',key),', ')
       into assignments,columns_sql,values_sql from jsonb_object_keys(patch) key;
     if assignments is null then raise exception 'No fields to save'; end if;
     if p_id is null then
       execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning %I::text',
         p_entity,columns_sql,values_sql,p_entity,pk) into saved_id using patch;
     else
       execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.%I::text=$2',p_entity,assignments,p_entity,pk) using patch,p_id;
     end if;
   end if;
 elsif operation in ('delete','restore') then
   if p_entity not in ('lot','lot_owner','burial_record') then raise exception 'This record cannot be removed here'; end if;
   if operation = 'delete' then
     if oldrow->>'deleted_at' is not null then raise exception 'Record is already removed'; end if;
     if p_entity = 'lot' and exists(select 1 from public.burial_record where lot_id=p_id::bigint) then raise exception 'A plot with a burial record cannot be removed'; end if;
     if p_entity = 'lot_owner' and exists(select 1 from public.lot where lot_owner_id=p_id::bigint) then raise exception 'An owner assigned to a plot cannot be removed'; end if;
     execute format('update public.%I set deleted_at=clock_timestamp() where %I::text=$1',p_entity,pk) using p_id;
   else
     if oldrow->>'deleted_at' is null then raise exception 'Record is not removed'; end if;
     execute format('update public.%I set deleted_at=null where %I::text=$1',p_entity,pk) using p_id;
   end if;
 elsif operation = 'review' then
   if p_entity = 'lot' then
     if oldrow->>'location_geom' is null or oldrow->>'deleted_at' is not null then raise exception 'A current coordinate is required'; end if;
     if patch->>'status' not in ('verified','rejected') or patch->>'status' is null then raise exception 'Choose verify or reject'; end if;
     if patch->>'status' = 'rejected' and nullif(trim(patch->>'reason'),'') is null then raise exception 'A rejection reason is required'; end if;
     update public.lot set coordinate_status=patch->>'status',coordinate_verified=(patch->>'status'='verified'),
       coordinate_rejection_reason=case when patch->>'status'='rejected' then left(trim(patch->>'reason'),2000) end where lot_id=p_id::bigint;
   elsif p_entity = 'photo' then
     if patch->>'status' not in ('approved','rejected','pending') or patch->>'status' is null then raise exception 'Invalid photo status'; end if;
     update public.photo set approval_status=patch->>'status',public_display=(patch->>'status'='approved'),reviewed_by=actor where photo_id=p_id::bigint;
   else raise exception 'Unsupported review'; end if;
 elsif p_entity = 'account' then
   case operation
     when 'approve' then perform public.admin_approve_account(p_id::uuid);
     when 'activate' then perform public.admin_activate_account(p_id::uuid);
     when 'deactivate' then perform public.admin_deactivate_account(p_id::uuid,coalesce(patch->>'value','SUSPENDED'));
     when 'role' then perform public.admin_change_account_role(p_id::uuid,patch->>'value');
     else raise exception 'Unsupported account action';
   end case;
 else raise exception 'Unsupported operation'; end if;

 execute format('select revision from public.%I where %I::text=$1',p_entity,pk) into new_revision using saved_id;
 if oldrow is not null and p_entity in ('lot','lot_owner','burial_record') then
   insert into public.record_history(entity,record_id,actor_id,operation,before_values,after_revision)
     values(p_entity,saved_id,actor,p_operation,oldrow,new_revision);
 end if;
 saved_result := jsonb_build_object('id',saved_id,'revision',new_revision);
 update public.staff_mutation set result=saved_result where actor_id=actor and request_id=p_request_id;
 return saved_result;
end $$;

create or replace function public.staff_burial_records(
  p_query text default '',
  p_section text default 'all',
  p_status text default 'all',
  p_verification text default 'all',
  p_date_filter text default 'all',
  p_sort text default 'updated',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  q text := public.search_normalize(left(coalesce(p_query, ''), 160));
  section_filter text := left(coalesce(nullif(trim(p_section), ''), 'all'), 160);
  status_filter text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  verification_filter text := lower(coalesce(nullif(trim(p_verification), ''), 'all'));
  date_filter text := lower(coalesce(nullif(trim(p_date_filter), ''), 'all'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'updated'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'desc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  if status_filter not in ('all', 'active', 'pending', 'archived') then
    raise exception 'Invalid burial record status filter';
  end if;
  if verification_filter not in ('all', 'verified', 'pending', 'rejected') then
    raise exception 'Invalid coordinate verification filter';
  end if;
  if date_filter not in ('all', 'this-year', 'last-five-years', 'undated') then
    raise exception 'Invalid burial date filter';
  end if;
  if sort_key not in ('updated', 'name', 'plot', 'interment-date', 'status') then
    raise exception 'Invalid burial record sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid burial record sort direction';
  end if;

  with record_source as materialized (
    select
      br.revision,
      br.burial_id,
      br.deceased_id,
      br.lot_id,
      d.display_name,
      d.birth_date,
      d.death_date,
      d.public_display,
      br.interment_date,
      br.record_status,
      br.interment_status,
      br.remains_type,
      br.reference_no, br.interment_order_number, br.interment_confirmed,
      br.service_provider,
      br.record_source,
      br.quality_notes,
      br.updated_at,
      l.lot_code,
      a.area_name,
      l.location_geom,
      l.px_loc_x,
      l.px_loc_y,
      l.coordinate_status,
      l.coordinate_verified
    from public.burial_record as br
    join public.deceased as d on d.deceased_id = br.deceased_id
    join public.lot as l on l.lot_id = br.lot_id
    left join public.area as a on a.area_id = l.area_id
    where br.deleted_at is null
      and l.deleted_at is null
  ),
  filtered as materialized (
    select source.*
    from record_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ',
              source.display_name,
              source.reference_no,
              source.burial_id::text,
              source.lot_code,
              source.area_name
            ))
          ) = 0
        )
      )
      and (section_filter = 'all' or source.area_name = section_filter)
      and (status_filter = 'all' or source.record_status = status_filter)
      and (
        verification_filter = 'all'
        or (
          verification_filter = 'verified'
          and source.coordinate_verified
          and source.coordinate_status = 'verified'
        )
        or (verification_filter = 'rejected' and source.coordinate_status = 'rejected')
        or (
          verification_filter = 'pending'
          and not (
            source.coordinate_verified
            and source.coordinate_status = 'verified'
          )
          and source.coordinate_status <> 'rejected'
        )
      )
      and (
        date_filter = 'all'
        or (date_filter = 'undated' and source.interment_date is null)
        or (
          date_filter = 'this-year'
          and extract(year from source.interment_date) = extract(year from current_date)
        )
        or (
          date_filter = 'last-five-years'
          and source.interment_date >= make_date(extract(year from current_date)::integer - 4, 1, 1)
        )
      )
  ),
  page_rows as (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'name' and sort_direction = 'asc' then display_name end asc,
      case when sort_key = 'name' and sort_direction = 'desc' then display_name end desc,
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'interment-date' and sort_direction = 'asc' then interment_date end asc nulls last,
      case when sort_key = 'interment-date' and sort_direction = 'desc' then interment_date end desc nulls last,
      case when sort_key = 'status' and sort_direction = 'asc' then record_status end asc,
      case when sort_key = 'status' and sort_direction = 'desc' then record_status end desc,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      burial_id desc
    limit page_size
    offset (page_number - 1) * page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'burialId', page.burial_id,
        'name', page.display_name,
        'deceasedId', page.deceased_id,
        'lotId', page.lot_id,
        'plot', page.lot_code,
        'section', coalesce(page.area_name, 'Unassigned'),
        'recordStatus', page.record_status,
        'birthDate', page.birth_date,
        'deathDate', page.death_date,
        'publicDisplay', page.public_display,
        'intermentDate', page.interment_date,
        'intermentStatus', page.interment_status,
        'remainsType', page.remains_type,
        'referenceNo', page.reference_no,
        'intermentOrderNumber', page.interment_order_number,
        'intermentConfirmed', page.interment_confirmed,
        'serviceProvider', page.service_provider,
        'recordSource', page.record_source,
        'qualityNotes', page.quality_notes,
        'updatedAt', page.updated_at,
        'location', case
          when page.location_geom is null then null
          else jsonb_build_object(
            'longitude', extensions.st_x(page.location_geom::extensions.geometry),
            'latitude', extensions.st_y(page.location_geom::extensions.geometry)
          )
        end,
        'pixelLocation', case
          when page.px_loc_x is null or page.px_loc_y is null then null
          else jsonb_build_object('x', page.px_loc_x, 'y', page.px_loc_y)
        end,
        'coordinateStatus', page.coordinate_status,
        'coordinateVerified', page.coordinate_verified
      ) order by
        case when sort_key = 'name' and sort_direction = 'asc' then page.display_name end asc,
        case when sort_key = 'name' and sort_direction = 'desc' then page.display_name end desc,
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'interment-date' and sort_direction = 'asc' then page.interment_date end asc nulls last,
        case when sort_key = 'interment-date' and sort_direction = 'desc' then page.interment_date end desc nulls last,
        case when sort_key = 'status' and sort_direction = 'asc' then page.record_status end asc,
        case when sort_key = 'status' and sort_direction = 'desc' then page.record_status end desc,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.burial_id desc
      )
      from page_rows as page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from record_source),
    'sections', coalesce((
      select jsonb_agg(section.area_name order by section.area_name)
      from (
        select distinct area_name
        from record_source
        where area_name is not null
      ) as section
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.staff_plot_management(
  p_query text default '',
  p_area text default 'all',
  p_state text default 'all',
  p_verification text default 'all',
  p_sort text default 'updated',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  q text := public.search_normalize(left(coalesce(p_query, ''), 160));
  area_filter text := lower(coalesce(nullif(trim(p_area), ''), 'all'));
  area_id_filter integer;
  state_filter text := lower(coalesce(nullif(trim(p_state), ''), 'all'));
  verification_filter text := lower(coalesce(nullif(trim(p_verification), ''), 'all'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'updated'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'desc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;

  if area_filter <> 'all' and area_filter !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Invalid plot area filter';
  end if;
  area_id_filter := case when area_filter = 'all' then null else area_filter::integer end;
  if state_filter not in ('all', 'available', 'occupied', 'booked', 'hold') then
    raise exception 'Invalid operational plot state filter';
  end if;
  if verification_filter not in ('all', 'missing', 'pending', 'verified', 'rejected') then
    raise exception 'Invalid coordinate verification filter';
  end if;
  if sort_key not in ('updated', 'plot', 'area', 'state', 'coordinate') then
    raise exception 'Invalid plot sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid plot sort direction';
  end if;

  with assigned as materialized (
    select
      br.lot_id,
      (array_agg(br.burial_id order by br.deleted_at nulls first, br.burial_id))[1] as burial_id,
      bool_and(br.deleted_at is not null) as burial_deleted,
      (array_agg(d.display_name order by br.deleted_at nulls first, br.burial_id))[1] as deceased_name,
      string_agg(d.display_name, ' ') as search_names,
      count(*) filter (where br.interment_confirmed is true) as confirmed_count,
      max(br.interment_slot) as reserved,
      jsonb_agg(jsonb_build_object('id', br.burial_id, 'name', d.display_name,
        'status', br.record_status, 'confirmed', br.interment_confirmed,
        'removed', br.deleted_at is not null) order by br.interment_slot) as roster
    from public.burial_record as br
    left join public.deceased as d on d.deceased_id = br.deceased_id
    group by br.lot_id
  ),
  plot_source as materialized (
    select
      l.revision,
      l.lot_id,
      l.lot_code,
      l.area_id,
      l.block_id,
      l.lot_owner_id,
      l.legacy_location_code,
      l.legacy_pa_number,
      l.status as stored_status,
      l.grave_type, l.grave_policy_reference, l.approved_mausoleum_capacity,
      coalesce(assigned.confirmed_count, 0) as confirmed_count,
      greatest(0, public.grave_interment_limit(l.grave_type, l.approved_mausoleum_capacity)
        - coalesce(assigned.reserved, 0)) as remaining,
      coalesce(assigned.roster, '[]'::jsonb) as roster,
      l.length_m,
      l.width_m,
      l.px_loc_x,
      l.px_loc_y,
      l.location_geom,
      l.coordinate_accuracy_m,
      l.coordinate_status,
      l.coordinate_verified,
      l.coordinate_rejection_reason,
      l.updated_at,
      a.area_code,
      a.area_name,
      assigned.burial_id,
      assigned.burial_deleted,
      assigned.deceased_name,
      assigned.search_names,
      case
        when assigned.lot_id is not null then 'occupied'
        when l.status = 'BOOKED' then 'booked'
        when l.status = 'HOLD' then 'hold'
        else 'available'
      end as operational_state,
      case
        when l.location_geom is null then 'missing'
        when l.coordinate_status = 'rejected' then 'rejected'
        when l.coordinate_status = 'verified' and l.coordinate_verified then 'verified'
        else 'pending'
      end as coordinate_state
    from public.lot as l
    left join public.area as a on a.area_id = l.area_id
    left join assigned on assigned.lot_id = l.lot_id
    where l.deleted_at is null
  ),
  filtered as materialized (
    select source.*
    from plot_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ',
              source.lot_code,
              source.legacy_location_code,
              source.legacy_pa_number,
              source.area_code,
              source.area_name,
              source.search_names
            ))
          ) = 0
        )
      )
      and (area_id_filter is null or source.area_id = area_id_filter)
      and (state_filter = 'all' or source.operational_state = state_filter)
      and (verification_filter = 'all' or source.coordinate_state = verification_filter)
  ),
  page_rows as (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'area' and sort_direction = 'asc' then area_name end asc nulls last,
      case when sort_key = 'area' and sort_direction = 'desc' then area_name end desc nulls last,
      case when sort_key = 'state' and sort_direction = 'asc' then operational_state end asc,
      case when sort_key = 'state' and sort_direction = 'desc' then operational_state end desc,
      case when sort_key = 'coordinate' and sort_direction = 'asc' then coordinate_state end asc,
      case when sort_key = 'coordinate' and sort_direction = 'desc' then coordinate_state end desc,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      lot_id desc
    limit page_size
    offset (page_number - 1) * page_size
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'lotId', page.lot_id,
        'lotCode', page.lot_code,
        'areaId', page.area_id,
        'blockId', page.block_id,
        'lotOwnerId', page.lot_owner_id,
        'legacyLocationCode', page.legacy_location_code,
        'legacyPaNumber', page.legacy_pa_number,
        'status', page.stored_status,
        'graveType', page.grave_type,
        'gravePolicyReference', page.grave_policy_reference,
        'approvedMausoleumCapacity', page.approved_mausoleum_capacity,
        'confirmedCount', page.confirmed_count,
        'remainingInterments', page.remaining,
        'interments', page.roster,
        'lengthM', page.length_m,
        'widthM', page.width_m,
        'pxLocX', page.px_loc_x,
        'pxLocY', page.px_loc_y,
        'location', case
          when page.location_geom is null then null
          else jsonb_build_object(
            'longitude', extensions.st_x(page.location_geom::extensions.geometry),
            'latitude', extensions.st_y(page.location_geom::extensions.geometry)
          )
        end,
        'coordinateAccuracyM', page.coordinate_accuracy_m,
        'coordinateStatus', page.coordinate_status,
        'coordinateVerified', page.coordinate_verified,
        'coordinateRejectionReason', page.coordinate_rejection_reason,
        'updatedAt', page.updated_at,
        'areaCode', page.area_code,
        'areaName', page.area_name,
        'operationalState', page.operational_state,
        'coordinateState', page.coordinate_state,
        'assignedBurialId', page.burial_id,
        'assignedDeceasedName', page.deceased_name,
        'assignedBurialDeleted', coalesce(page.burial_deleted, false)
      ) order by
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'area' and sort_direction = 'asc' then page.area_name end asc nulls last,
        case when sort_key = 'area' and sort_direction = 'desc' then page.area_name end desc nulls last,
        case when sort_key = 'state' and sort_direction = 'asc' then page.operational_state end asc,
        case when sort_key = 'state' and sort_direction = 'desc' then page.operational_state end desc,
        case when sort_key = 'coordinate' and sort_direction = 'asc' then page.coordinate_state end asc,
        case when sort_key = 'coordinate' and sort_direction = 'desc' then page.coordinate_state end desc,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.lot_id desc
      )
      from page_rows as page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from plot_source),
    'summary', (
      select jsonb_build_object(
        'total', count(*),
        'occupied', count(*) filter (where operational_state = 'occupied'),
        'available', count(*) filter (where operational_state = 'available'),
        'booked', count(*) filter (where operational_state = 'booked'),
        'onHold', count(*) filter (where operational_state = 'hold'),
        'needsVerification', count(*) filter (
          where location_geom is null or coordinate_status in ('pending', 'rejected')
        )
      )
      from plot_source
    ),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'areaId', area.area_id,
        'areaCode', area.area_code,
        'label', area.area_name
      ) order by area.area_name, area.area_id)
      from (
        select distinct area_id, area_code, area_name
        from plot_source
        where area_id is not null
      ) as area
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.staff_coordinate_verification(
  p_query text default '',
  p_area text default 'all',
  p_state text default 'actionable',
  p_sort text default 'priority',
  p_direction text default 'asc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  q text := public.search_normalize(left(coalesce(p_query, ''), 160));
  area_filter text := lower(coalesce(nullif(trim(p_area), ''), 'all'));
  area_id_filter integer;
  state_filter text := lower(coalesce(nullif(trim(p_state), ''), 'actionable'));
  sort_key text := lower(coalesce(nullif(trim(p_sort), ''), 'priority'));
  sort_direction text := lower(coalesce(nullif(trim(p_direction), ''), 'asc'));
  page_number integer := greatest(1, least(coalesce(p_page, 1), 100000));
  page_size integer := greatest(10, least(coalesce(p_page_size, 20), 50));
  result jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'An active administrator account is required' using errcode = '42501';
  end if;

  if area_filter <> 'all' and area_filter !~ '^[1-9][0-9]{0,9}$' then
    raise exception 'Invalid coordinate area filter';
  end if;
  area_id_filter := case when area_filter = 'all' then null else area_filter::integer end;
  if state_filter not in ('actionable', 'all', 'missing', 'pending', 'rejected', 'verified') then
    raise exception 'Invalid coordinate state filter';
  end if;
  if sort_key not in ('priority', 'updated', 'plot', 'area', 'status', 'accuracy') then
    raise exception 'Invalid coordinate verification sort';
  end if;
  if sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid coordinate verification sort direction';
  end if;

  with assigned as materialized (
    select
      br.lot_id,
      (array_agg(br.burial_id order by br.deleted_at nulls first, br.burial_id))[1] as burial_id,
      bool_and(br.deleted_at is not null) as burial_deleted,
      (array_agg(d.display_name order by br.deleted_at nulls first, br.burial_id))[1] as deceased_name,
      string_agg(d.display_name, ' ') as search_names
    from public.burial_record as br
    left join public.deceased as d on d.deceased_id = br.deceased_id
    group by br.lot_id
  ),
  coordinate_source as materialized (
    select
      l.revision,
      l.lot_id,
      l.lot_code,
      l.area_id,
      l.location_geom,
      l.coordinate_accuracy_m,
      l.coordinate_status,
      l.coordinate_verified,
      l.coordinate_rejection_reason,
      l.updated_at,
      a.area_code,
      a.area_name,
      assigned.burial_id,
      assigned.burial_deleted,
      assigned.deceased_name,
      assigned.search_names,
      case
        when l.location_geom is null then 'missing'
        when l.coordinate_status = 'rejected' then 'rejected'
        when l.coordinate_status = 'verified' and l.coordinate_verified then 'verified'
        else 'pending'
      end as coordinate_state
    from public.lot as l
    left join public.area as a on a.area_id = l.area_id
    left join assigned on assigned.lot_id = l.lot_id
    where l.deleted_at is null
  ),
  filtered as materialized (
    select source.*
    from coordinate_source as source
    where (
        q = ''
        or not exists (
          select 1
          from regexp_split_to_table(q, ' +') as token
          where position(
            token in public.search_normalize(concat_ws(
              ' ', source.lot_code, source.area_code, source.area_name, source.search_names
            ))
          ) = 0
        )
      )
      and (area_id_filter is null or source.area_id = area_id_filter)
      and (
        state_filter = 'all'
        or state_filter = source.coordinate_state
        or (state_filter = 'actionable' and source.coordinate_state in ('missing', 'pending', 'rejected'))
      )
  ),
  page_rows as materialized (
    select filtered.*
    from filtered
    order by
      case when sort_key = 'priority' and coordinate_state = 'rejected' then 1
           when sort_key = 'priority' and coordinate_state = 'pending' then 2
           when sort_key = 'priority' and coordinate_state = 'missing' then 3
           when sort_key = 'priority' then 4 end asc,
      case when sort_key = 'plot' and sort_direction = 'asc' then lot_code end asc,
      case when sort_key = 'plot' and sort_direction = 'desc' then lot_code end desc,
      case when sort_key = 'area' and sort_direction = 'asc' then area_name end asc nulls last,
      case when sort_key = 'area' and sort_direction = 'desc' then area_name end desc nulls last,
      case when sort_key = 'status' and sort_direction = 'asc' then coordinate_state end asc,
      case when sort_key = 'status' and sort_direction = 'desc' then coordinate_state end desc,
      case when sort_key = 'accuracy' and sort_direction = 'asc' then coordinate_accuracy_m end asc nulls last,
      case when sort_key = 'accuracy' and sort_direction = 'desc' then coordinate_accuracy_m end desc nulls last,
      case when sort_key = 'updated' and sort_direction = 'asc' then updated_at end asc,
      case when sort_key = 'updated' and sort_direction = 'desc' then updated_at end desc,
      updated_at desc,
      lot_id desc
    limit page_size
    offset (page_number - 1) * page_size
  ),
  coordinate_events as materialized (
    select
      audit.record_id::bigint as lot_id,
      audit.audit_id,
      audit.created_at,
      account.username as actor_name,
      case
        when audit.action = 'verify' and audit.new_values ->> 'coordinate_status' = 'verified'
          then 'verified'
        when audit.action = 'verify' and audit.new_values ->> 'coordinate_status' = 'rejected'
          then 'rejected'
        when audit.action = 'update'
          and (audit.old_values -> 'location_geom') is distinct from (audit.new_values -> 'location_geom')
          and audit.new_values -> 'location_geom' is not null
          then 'updated'
        when audit.action = 'insert' and audit.new_values ->> 'location_geom' is not null
          then 'submitted'
        else null
      end as event_type,
      audit.new_values ->> 'coordinate_rejection_reason' as reason,
      row_number() over (
        partition by audit.record_id
        order by audit.created_at desc, audit.audit_id desc
      ) as event_number
    from public.audit_log as audit
    join page_rows as page on page.lot_id::text = audit.record_id
    left join public.account as account on account.account_id = audit.actor_account_id
    where audit.table_name = 'lot'
      and (
        audit.action = 'verify'
        or (
          audit.action in ('insert', 'update')
          and (audit.old_values -> 'location_geom') is distinct from (audit.new_values -> 'location_geom')
        )
      )
  ),
  history_by_lot as materialized (
    select
      events.lot_id,
      jsonb_agg(jsonb_build_object(
        'auditId', events.audit_id,
        'event', events.event_type,
        'actorName', events.actor_name,
        'reason', events.reason,
        'createdAt', events.created_at
      ) order by events.created_at desc, events.audit_id desc) as history
    from coordinate_events as events
    where events.event_type is not null and events.event_number <= 5
    group by events.lot_id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', page.revision,
        'lotId', page.lot_id,
        'lotCode', page.lot_code,
        'areaId', page.area_id,
        'areaCode', page.area_code,
        'areaName', page.area_name,
        'coordinateState', page.coordinate_state,
        'location', case
          when page.location_geom is null then null
          else jsonb_build_object(
            'longitude', extensions.st_x(page.location_geom::extensions.geometry),
            'latitude', extensions.st_y(page.location_geom::extensions.geometry)
          )
        end,
        'coordinateAccuracyM', page.coordinate_accuracy_m,
        'coordinateStatus', page.coordinate_status,
        'coordinateVerified', page.coordinate_verified,
        'rejectionReason', page.coordinate_rejection_reason,
        'updatedAt', page.updated_at,
        'assignedBurialId', page.burial_id,
        'assignedDeceasedName', page.deceased_name,
        'assignedBurialDeleted', coalesce(page.burial_deleted, false),
        'history', coalesce(history.history, '[]'::jsonb)
      ) order by
        case when sort_key = 'priority' and page.coordinate_state = 'rejected' then 1
             when sort_key = 'priority' and page.coordinate_state = 'pending' then 2
             when sort_key = 'priority' and page.coordinate_state = 'missing' then 3
             when sort_key = 'priority' then 4 end asc,
        case when sort_key = 'plot' and sort_direction = 'asc' then page.lot_code end asc,
        case when sort_key = 'plot' and sort_direction = 'desc' then page.lot_code end desc,
        case when sort_key = 'area' and sort_direction = 'asc' then page.area_name end asc nulls last,
        case when sort_key = 'area' and sort_direction = 'desc' then page.area_name end desc nulls last,
        case when sort_key = 'status' and sort_direction = 'asc' then page.coordinate_state end asc,
        case when sort_key = 'status' and sort_direction = 'desc' then page.coordinate_state end desc,
        case when sort_key = 'accuracy' and sort_direction = 'asc' then page.coordinate_accuracy_m end asc nulls last,
        case when sort_key = 'accuracy' and sort_direction = 'desc' then page.coordinate_accuracy_m end desc nulls last,
        case when sort_key = 'updated' and sort_direction = 'asc' then page.updated_at end asc,
        case when sort_key = 'updated' and sort_direction = 'desc' then page.updated_at end desc,
        page.updated_at desc,
        page.lot_id desc
      )
      from page_rows as page
      left join history_by_lot as history on history.lot_id = page.lot_id
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from coordinate_source),
    'summary', (
      select jsonb_build_object(
        'needsVerification', count(*) filter (where coordinate_state in ('missing', 'pending', 'rejected')),
        'missing', count(*) filter (where coordinate_state = 'missing'),
        'pending', count(*) filter (where coordinate_state = 'pending'),
        'rejected', count(*) filter (where coordinate_state = 'rejected'),
        'verified', count(*) filter (where coordinate_state = 'verified')
      )
      from coordinate_source
    ),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'areaId', area.area_id,
        'areaCode', area.area_code,
        'label', area.area_name
      ) order by area.area_name, area.area_id)
      from (
        select distinct area_id, area_code, area_name
        from coordinate_source
        where area_id is not null
      ) as area
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create function public.staff_interment_plot_options()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_active_admin_or_manager() then
    raise exception 'An active staff account is required' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'lotId', lot_id, 'lotCode', lot_code, 'section', area_name, 'status', 'AVAILABLE',
      'graveType', grave_type, 'confirmedCount', confirmed, 'remaining', capacity - reserved
    ) order by lot_code, lot_id), '[]'::jsonb)
    from (
      select l.lot_id, l.lot_code, l.grave_type, a.area_name,
        public.grave_interment_limit(l.grave_type, l.approved_mausoleum_capacity) as capacity,
        coalesce(max(b.interment_slot), 0) as reserved,
        count(*) filter (where b.interment_confirmed is true) as confirmed
      from public.lot l join public.area a on a.area_id = l.area_id
      left join public.burial_record b on b.lot_id = l.lot_id
      where l.deleted_at is null and l.status = 'AVAILABLE'
      group by l.lot_id, a.area_name
    ) choices where capacity > reserved
  );
end
$$;

create function public.public_shared_plot_burials(p_burial_id bigint)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', visible.burial_id::text, 'name', visible.display_name
  ) order by visible.display_name, visible.burial_id), '[]'::jsonb)
  from public.burial_record anchor
  join public.public_burial_records approved on approved.burial_id = anchor.burial_id
  join public.burial_record sibling on sibling.lot_id = anchor.lot_id and sibling.burial_id <> anchor.burial_id
  join public.public_burial_records visible on visible.burial_id = sibling.burial_id
  where anchor.burial_id = p_burial_id
$$;

revoke all on function public.staff_interment_plot_options(), public.public_shared_plot_burials(bigint) from public, anon, authenticated;
grant execute on function public.staff_interment_plot_options() to authenticated;
grant execute on function public.public_shared_plot_burials(bigint) to anon, authenticated;

commit;
