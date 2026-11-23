begin;

-- Add an optional public memorial inscription (epitaph) to burial records so
-- administrators can author and update remembrance quotes dynamically.
alter table public.burial_record
  add column if not exists inscription text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'burial_record_inscription_length'
      and conrelid = 'public.burial_record'::regclass
  ) then
    alter table public.burial_record
      add constraint burial_record_inscription_length
      check (inscription is null or char_length(btrim(inscription)) <= 600);
  end if;
end $$;

-- Expose br.inscription through the allowlisted public read boundary while
-- preserving the optional local capstone visitor selection view when installed.
do $$
begin
  if to_regclass('gis_private.capstone_visitor_selection') is not null then
    execute $view$
      create or replace view public.public_burial_records with (security_barrier = true) as
      select br.burial_id,d.display_name,d.birth_date,d.death_date,br.record_status,l.lot_code,
       (case when br.record_status='active' then l.location_geom end)::extensions.geography(Point,4326) as location_geom,
       case when br.record_status='active' then l.px_loc_x end as px_loc_x,
       case when br.record_status='active' then l.px_loc_y end as px_loc_y,
       case when br.record_status='active' then l.coordinate_verified else false end as location_verified,
       coalesce(a.area_name,la.area_name) as area_name,s.sector_name,b.block_number,br.interment_date,
       case when br.record_status='active' then l.coordinate_status end as coordinate_status,
       public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) as synthetic_plot_reference,
       br.inscription
      from public.burial_record br join public.deceased d using(deceased_id) join public.lot l using(lot_id)
      left join public.area a on a.area_id=l.area_id left join public.block b using(block_id)
      left join public.sector s using(sector_id) left join public.area la on la.area_id=s.area_id
      where d.public_display and br.deleted_at is null and l.deleted_at is null
       and (br.record_status='active' or (
         br.record_status='pending' and br.interment_confirmed is false
         and l.location_geom is null and l.coordinate_verified is false
         and public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) is not null
         and exists (
           select 1 from gis_private.capstone_visitor_selection selected
           where selected.burial_id=br.burial_id and selected.deceased_id=d.deceased_id and selected.lot_id=l.lot_id
         )
       ))
    $view$;
  else
    execute $view$
      create or replace view public.public_burial_records with (security_barrier = true) as
      select br.burial_id,d.display_name,d.birth_date,d.death_date,br.record_status,l.lot_code,l.location_geom,
       l.px_loc_x,l.px_loc_y,l.coordinate_verified as location_verified,
       coalesce(a.area_name,la.area_name) as area_name,s.sector_name,b.block_number,br.interment_date,
       l.coordinate_status,
       public.project_sample_plot_reference(br.record_source,br.quality_notes,l.lot_id::text) as synthetic_plot_reference,
       br.inscription
      from public.burial_record br join public.deceased d using(deceased_id) join public.lot l using(lot_id)
      left join public.area a on a.area_id=l.area_id left join public.block b using(block_id)
      left join public.sector s using(sector_id) left join public.area la on la.area_id=s.area_id
      where br.record_status='active' and d.public_display and br.deleted_at is null and l.deleted_at is null
    $view$;
  end if;
end $$;

revoke all on public.public_burial_records from public;
grant select on public.public_burial_records to anon, authenticated;

-- Allow active staff to create, edit, and revert memorial inscriptions through
-- the existing versioned, idempotent, audited save RPC.
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
 when 'burial_record' then array['display_name','birth_date','death_date','public_display','lot_id','interment_date','record_status','interment_status','remains_type','reference_no','service_provider','record_source','quality_notes','interment_order_number','interment_confirmed','inscription']
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
         interment_order_number,interment_confirmed,inscription)
       values (person_id,(patch->>'lot_id')::bigint,actor,actor,(patch->>'interment_date')::date,
         patch->>'record_status',patch->>'interment_status',patch->>'remains_type',patch->>'reference_no',
         patch->>'service_provider',patch->>'record_source',patch->>'quality_notes',
         patch->>'interment_order_number',coalesce((patch->>'interment_confirmed')::boolean,false),
         nullif(btrim(patch->>'inscription'),''))
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
         interment_confirmed=case when patch ? 'interment_confirmed' then (patch->>'interment_confirmed')::boolean else interment_confirmed end,
         inscription=case when patch ? 'inscription' then nullif(btrim(patch->>'inscription'),'') else inscription end
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
      br.inscription,
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
        'inscription', page.inscription,
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

commit;
