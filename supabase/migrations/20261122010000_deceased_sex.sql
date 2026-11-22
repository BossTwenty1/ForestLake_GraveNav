begin;

-- Store an optional staff-entered value on the person. Existing records stay null.
alter table public.deceased
  add column sex text constraint deceased_sex_check check (sex in ('female', 'male'));

-- Carry sex through the existing versioned save and recovery path.
-- Legacy saves and recovery snapshots that omit sex retain the current value.
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
       'death_date',death_date,'public_display',public_display,'sex',sex) from public.deceased where deceased_id = (oldrow->>'deceased_id')::bigint);
   end if;
 elsif operation <> 'save' or p_entity in ('photo','account') then raise exception 'Select an existing record';
 end if;

 allowed := case p_entity
 when 'lot' then array['area_id','block_id','lot_owner_id','lot_code','legacy_location_code','legacy_pa_number','status','length_m','width_m','location_geom','coordinate_accuracy_m','grave_type','grave_policy_reference','approved_mausoleum_capacity']
 when 'lot_owner' then array['first_name','middle_name','last_name','suffix','aliases','address','representative_name','representative_contact','representative_relation']
 when 'burial_record' then array['display_name','birth_date','death_date','public_display','lot_id','interment_date','record_status','interment_status','remains_type','reference_no','service_provider','record_source','quality_notes','interment_order_number','interment_confirmed','inscription','sex']
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
       insert into public.deceased(display_name,birth_date,death_date,public_display,sex)
       values (btrim(patch->>'display_name'),(patch->>'birth_date')::date,(patch->>'death_date')::date,
         coalesce((patch->>'public_display')::boolean,false),patch->>'sex') returning deceased_id into person_id;
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
         death_date=(patch->>'death_date')::date,public_display=coalesce((patch->>'public_display')::boolean,false),
         sex=case when patch ? 'sex' then patch->>'sex' else sex end
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

commit;
