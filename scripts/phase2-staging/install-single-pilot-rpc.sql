-- REVIEW ONLY: install separately after hosted approval; never auto-run with application migrations.
-- One authenticated fictional pilot. No caller-controlled data and no JWT claim assignment.
begin;
create function public.execute_phase2_single_pilot_3721() returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
set default_transaction_isolation = 'repeatable read'
set statement_timeout = '30s'
set lock_timeout = '5s'
as $pilot$
declare
 actor uuid := auth.uid();
 owner_values constant jsonb := '{"first_name":"Diana","last_name":"Tahanan","aliases":"GRAVENAV_PHASE2_PROJECT_SAMPLE_V1:DEMO-OWN-0001:f20993b15d71761b056a3c878b29125bfdd1f5cca743604bcea9ed830f4e87b2","address":""}'::jsonb;
 burial_values constant jsonb := '{"display_name":"Tomas Kuwento","birth_date":"1925-01-01","death_date":"2012-01-01","lot_id":"3721","interment_date":"2012-01-03","record_status":"active","public_display":true,"interment_status":"PERMANENT","remains_type":"ASH","reference_no":"DEMO-INT-0001","interment_order_number":"DEMO-INT-0001","interment_confirmed":false,"record_source":"GRAVENAV_PHASE2_PROJECT_SAMPLE_V1","quality_notes":"{\"data_classification\":\"PROJECT_SAMPLE_FICTIONAL\",\"person_id\":\"DEMO-PER-0001\",\"interment_id\":\"DEMO-INT-0001\",\"source_row_key\":\"f20993b15d71761b056a3c878b29125bfdd1f5cca743604bcea9ed830f4e87b2\",\"display_reference\":\"BPG-A · Block 1 · Lot 9\",\"pdf_page\":2,\"pdf_locator\":\"p2 box 86.76,505.34,105.00,519.32\",\"cad_candidate_id\":\"lawn:2363\",\"cad_instance_path\":\"18F9/C22/23E\",\"existing_lot_id\":\"3721\",\"expected_revision\":2,\"area_id\":\"5\",\"block_id\":\"1\",\"binding_kind\":\"NEW_SYNTHETIC_PROJECT_ASSIGNMENT\",\"historical_cad_identity_verified\":false,\"forest_lake_physical_assignment_verified\":false}"}'::jsonb;
 owner_request constant uuid := '8f450bc1-d70a-5a4c-828d-87f287dcf1ee';
 lot_request constant uuid := 'd773dd88-bb5f-5771-8680-e1fb0e2b560a';
 burial_request constant uuid := 'a3f272ea-2b62-5977-8113-963e480fd080';
 target public.lot; current_row public.lot; before_row record;
 saved_owner jsonb; saved_lot jsonb; saved_burial jsonb; lot_values jsonb;
 prior_owner public.staff_mutation; prior_lot public.staff_mutation; prior_burial public.staff_mutation;
 replayed boolean := false; n integer;
begin
 -- JWT verification belongs to Supabase Auth/PostgREST. Never establish a subject here.
 if actor is distinct from '9f08a285-a1e2-444f-b07e-b897e43e6c92'::uuid
    or auth.role() is distinct from 'authenticated' then
  raise exception 'Authenticated PUGI administrator required' using errcode='42501';
 end if;
 perform 1 from public.account a join public.role r using(role_id)
 where a.account_id=actor and a.username='PUGI' and a.is_active
   and a.account_status='ACTIVE' and r.role_name='ADMIN' for share of a,r;
 if not found or not public.is_active_admin() then
  raise exception 'PUGI authorization changed' using errcode='42501';
 end if;
 if current_setting('transaction_isolation') <> 'repeatable read' then
  raise exception 'Repeatable-read RPC transaction required';
 end if;
 if (select count(*) from supabase_migrations.schema_migrations where version in
  ('20261107000000','20261107010000','20261116010000','20261117010000'))<>4 then
  raise exception 'Four approved migrations required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('GRAVENAV_PHASE2_PROJECT_SAMPLE_V1',0));
 select * into target from public.lot where lot_id=3721 for update;
 if not found then raise exception 'Target identity/revision/policy changed';end if;
 select * into prior_owner from public.staff_mutation where actor_id=actor and request_id=owner_request;
 select * into prior_lot from public.staff_mutation where actor_id=actor and request_id=lot_request;
 select * into prior_burial from public.staff_mutation where actor_id=actor and request_id=burial_request;
 if prior_owner.request_id is not null or prior_lot.request_id is not null or prior_burial.request_id is not null then
  if prior_owner.result is null or prior_lot.result is null or prior_burial.result is null then
   raise exception 'Incomplete pilot receipts; inspect before retry';
  end if;
  saved_owner:=prior_owner.result;saved_lot:=prior_lot.result;saved_burial:=prior_burial.result;
  lot_values:=jsonb_build_object('lot_code',target.lot_code,'area_id',target.area_id,
   'location_geom',to_jsonb(target)->'location_geom','lot_owner_id',saved_owner->>'id','status','AVAILABLE');
  if prior_owner.request is distinct from jsonb_build_object('entity','lot_owner','id',null,'revision',null,'values',owner_values,'operation','save')
   or prior_lot.request is distinct from jsonb_build_object('entity','lot','id','3721','revision',2,'values',lot_values,'operation','save')
   or prior_burial.request is distinct from jsonb_build_object('entity','burial_record','id',null,'revision',null,'values',burial_values,'operation','save') then
   raise exception 'Receipt fingerprint conflict';
  end if;
  if not exists(select 1 from public.record_history h where h.entity='lot' and h.record_id='3721'
   and h.actor_id=actor and h.operation='save' and h.after_revision=3
   and (to_jsonb(target)-array['lot_owner_id','status','revision','updated_at']) =
       (h.before_values-array['lot_owner_id','status','revision','updated_at'])) then
   raise exception 'Committed pilot preservation mismatch';
  end if;
  replayed:=true;
 else
  if target.revision<>2 or target.lot_code<>'BPG-A-0001' or target.area_id<>5
   or target.block_id is distinct from 1::bigint or target.deleted_at is not null
   or target.lot_owner_id is not null or target.status<>'HOLD' or target.grave_type is not null then
   raise exception 'Target identity/revision/policy changed';
  end if;
  if exists(select 1 from public.burial_record where lot_id=target.lot_id) then
   raise exception 'Existing interment association; stop';
  end if;
  if nullif(btrim(target.legacy_location_code),'') is not null or nullif(btrim(target.legacy_pa_number),'') is not null
   or exists(select 1 from public.plot_geometry where lot_id=target.lot_id)
   or exists(select 1 from public.grave_access_point where lot_id=target.lot_id) then
   raise exception 'Conflicting source-purpose reference; stop';
  end if;
  if exists(select 1 from public.burial_record where record_source='GRAVENAV_PHASE2_PROJECT_SAMPLE_V1'
    and (reference_no='DEMO-INT-0001' or quality_notes::jsonb->>'source_row_key'=(burial_values->>'quality_notes')::jsonb->>'source_row_key'))
   or exists(select 1 from public.lot_owner where aliases=owner_values->>'aliases') then
   raise exception 'Sample source ID already exists; inspect receipt, never duplicate';
  end if;
  -- Same preservation guard as the reviewed SQL, held in a local record instead of a temp table.
  select to_jsonb(l)-array['lot_owner_id','status','revision','updated_at'] as stable_target,
   (select md5(coalesce(string_agg(md5(to_jsonb(other)::text),'' order by md5(to_jsonb(other)::text)),'')) from public.lot other where lot_id<>3721) as other_lots_digest,
   (select count(*) from public.lot_owner) as owners_before,(select count(*) from public.deceased) as people_before,
   (select count(*) from public.burial_record) as burials_before into before_row from public.lot l where lot_id=3721;
  saved_owner:=public.staff_save_record('lot_owner',null,null,owner_values,owner_request,'save');
  lot_values:=jsonb_build_object('lot_code',target.lot_code,'area_id',target.area_id,
   'location_geom',to_jsonb(target)->'location_geom','lot_owner_id',saved_owner->>'id','status','AVAILABLE');
  saved_lot:=public.staff_save_record('lot',target.lot_id::text,target.revision,lot_values,lot_request,'save');
  saved_burial:=public.staff_save_record('burial_record',null,null,burial_values,burial_request,'save');
  select * into current_row from public.lot where lot_id=3721;
  if (to_jsonb(current_row)-array['lot_owner_id','status','revision','updated_at']) is distinct from before_row.stable_target then raise exception 'Unapproved target fields changed';end if;
  if current_row.lot_code<>'BPG-A-0001' or current_row.status<>'AVAILABLE' or current_row.revision<>3 or current_row.lot_owner_id is null then raise exception 'Pilot lot update mismatch';end if;
  if (select md5(coalesce(string_agg(md5(to_jsonb(l)::text),'' order by md5(to_jsonb(l)::text)),'')) from public.lot l where lot_id<>3721)<>before_row.other_lots_digest then raise exception 'Another lot changed';end if;
  if (select count(*) from public.lot_owner)<>before_row.owners_before+1 or (select count(*) from public.deceased)<>before_row.people_before+1 or (select count(*) from public.burial_record)<>before_row.burials_before+1 then raise exception 'Unexpected record count change';end if;
 end if;
 if saved_lot is distinct from jsonb_build_object('id','3721','revision',3) then raise exception 'Pilot lot receipt mismatch';end if;
 select count(*) into n from public.burial_record b join public.deceased d using(deceased_id)
 join public.lot l using(lot_id) join public.lot_owner o on o.lot_owner_id=l.lot_owner_id
 where b.burial_id=(saved_burial->>'id')::bigint and b.lot_id=3721
  and l.lot_code='BPG-A-0001' and l.area_id=5 and l.block_id=1 and l.revision=3
  and l.status='AVAILABLE' and l.deleted_at is null and o.lot_owner_id=(saved_owner->>'id')::bigint
  and o.first_name='Diana' and o.last_name='Tahanan' and o.aliases=owner_values->>'aliases' and o.deleted_at is null
  and d.display_name='Tomas Kuwento' and d.birth_date='1925-01-01' and d.death_date='2012-01-01' and d.public_display
  and b.reference_no='DEMO-INT-0001' and b.interment_order_number='DEMO-INT-0001'
  and b.record_source='GRAVENAV_PHASE2_PROJECT_SAMPLE_V1' and b.interment_confirmed is false
  and b.interment_slot=1 and b.record_status='active' and b.deleted_at is null
  and b.interment_date='2012-01-03' and b.interment_status='PERMANENT' and b.remains_type='ASH'
  and b.created_by=actor and b.updated_by=actor
  and b.quality_notes::jsonb=(burial_values->>'quality_notes')::jsonb;
 if n<>1 then raise exception 'Exact fictional pilot identity mismatch';end if;
 return jsonb_build_object('actor_id',actor,'replayed',replayed,'existing_lot_id','3721',
  'internal_lot_code','BPG-A-0001','synthetic_plot_reference','BPG A / Block 1 / Lot 9',
  'source_row_key',(burial_values->>'quality_notes')::jsonb->>'source_row_key',
  'historical_cad_identity_verified',false,'forest_lake_physical_assignment_verified',false,
  'receipts',(select jsonb_agg(jsonb_build_object('request_id',request_id,'result',result) order by request_id)
   from public.staff_mutation where actor_id=actor and request_id in(owner_request,lot_request,burial_request)));
end $pilot$;
revoke all on function public.execute_phase2_single_pilot_3721() from public,anon,authenticated,service_role;
grant execute on function public.execute_phase2_single_pilot_3721() to authenticated;
comment on function public.execute_phase2_single_pilot_3721() is
 'Temporary fixed fictional pilot for lot 3721; genuine authenticated PUGI ADMIN only. Remove after verified success.';
notify pgrst, 'reload schema';
commit;
