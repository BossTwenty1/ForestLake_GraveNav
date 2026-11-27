-- Create a pending burial only for an explicitly mapped operational plot.
-- The normal audited writer and its slot/capacity rules remain authoritative.
begin;
create or replace function public.staff_create_mapped_burial(
  p_candidate text, p_plan_sha256 text, p_expected_lot_id bigint, p_expected_lot_code text,
  p_values jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare plot public.lot%rowtype; linked_id bigint; birth date; death date; interment date; payload jsonb;
  owner_values jsonb; owner_mode text; owner_id bigint; owner_receipt jsonb; owner_request uuid; lot_request uuid;
  actor uuid := auth.uid(); request jsonb; prior public.staff_mutation%rowtype; receipt jsonb; burial_request uuid;
begin
  if not public.is_active_admin_or_manager() then raise exception 'Active staff access is required' using errcode='42501'; end if;
  if p_candidate is null or p_candidate !~ '^(lawn|estates):[1-9][0-9]*$' or length(p_candidate)>24
      or p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$' or p_request_id is null
      or p_expected_lot_id is null or p_expected_lot_code is null or jsonb_typeof(p_values) is distinct from 'object'
      or to_regclass('gis_private.capstone_planning_lot') is null then
    raise exception 'Invalid map plot request' using errcode='22023';
  end if;
  request := jsonb_build_object('entity','map_burial','candidate',p_candidate,'plan',p_plan_sha256,
    'lot_id',p_expected_lot_id,'lot_code',p_expected_lot_code,'values',p_values);
  insert into public.staff_mutation(actor_id,request_id,request) values(actor,p_request_id,request) on conflict do nothing;
  select * into prior from public.staff_mutation where actor_id=actor and request_id=p_request_id for update;
  if prior.request<>request then raise exception 'Request identifier was reused for different changes' using errcode='22023'; end if;
  if prior.result is not null then return prior.result; end if;
  execute 'select lot_id from gis_private.capstone_planning_lot where cad_candidate_id=$1 and plan_sha256=$2 for share'
    into linked_id using p_candidate, p_plan_sha256;
  if linked_id is distinct from p_expected_lot_id then raise exception 'The plot link changed; reopen the map' using errcode='40001'; end if;
  select * into plot from public.lot where lot_id=linked_id and deleted_at is null for no key update;
  if not found or plot.lot_code is distinct from p_expected_lot_code or plot.lot_code ~ '^P2S-[0-9a-f]{64}$'
      or plot.grave_type not in ('regular','mausoleum') or plot.grave_type is null then
    raise exception 'The mapped plot is not ready for burial records' using errcode='22023';
  end if;
  if plot.status <> 'AVAILABLE' then raise exception 'Change the plot status to available before adding a burial' using errcode='22023'; end if;
  if nullif(btrim(p_values->>'display_name'),'') is null or length(btrim(p_values->>'display_name'))>200
      or coalesce(p_values->>'sex','') not in ('female','male')
      or coalesce(p_values->>'interment_status','') not in ('PERMANENT','TEMPORARY')
      or coalesce(p_values->>'remains_type','') not in ('FRESH','ASH','BONE')
      or nullif(p_values->>'birth_date','') is null or nullif(p_values->>'death_date','') is null then
    raise exception 'Complete all required burial fields' using errcode='22023';
  end if;
  begin
    birth := (p_values->>'birth_date')::date; death := (p_values->>'death_date')::date;
    interment := nullif(p_values->>'interment_date','')::date;
  exception when others then raise exception 'Enter valid dates' using errcode='22023'; end;
  if birth>death or death>current_date or (interment is not null and interment<death) then
    raise exception 'Check the birth, death, and interment dates' using errcode='22023';
  end if;
  if length(coalesce(p_values->>'inscription',''))>600 then raise exception 'Inscription is too long' using errcode='22023'; end if;
  if p_values ? 'public_display' and jsonb_typeof(p_values->'public_display') <> 'boolean' then
    raise exception 'Choose whether to show the memorial publicly' using errcode='22023';
  end if;
  owner_values := coalesce(p_values->'owner','{"mode":"none"}'::jsonb);
  owner_mode := owner_values->>'mode';
  if jsonb_typeof(owner_values) is distinct from 'object' or coalesce(owner_mode,'') not in ('none','existing','new') then
    raise exception 'Choose a valid owner option' using errcode='22023';
  end if;
  if owner_mode='existing' then
    if coalesce(owner_values->>'id','') !~ '^[1-9][0-9]{0,14}$' then raise exception 'Choose an owner' using errcode='22023'; end if;
    owner_id := (owner_values->>'id')::bigint;
    perform 1 from public.lot_owner where lot_owner_id=owner_id and deleted_at is null for update;
    if not found then raise exception 'The owner is unavailable' using errcode='22023'; end if;
  elsif owner_mode='new' then
    if nullif(btrim(owner_values->>'first_name'),'') is null or nullif(btrim(owner_values->>'last_name'),'') is null
      or nullif(btrim(owner_values->>'address'),'') is null then
      raise exception 'First name, last name, and address are required for the owner' using errcode='22023';
    end if;
    owner_request := md5(p_request_id::text || ':map-owner')::uuid;
    owner_receipt := public.staff_save_record('lot_owner',null,null,jsonb_build_object(
      'first_name',btrim(owner_values->>'first_name'),'middle_name',nullif(btrim(owner_values->>'middle_name'),''),
      'last_name',btrim(owner_values->>'last_name'),'suffix',nullif(btrim(owner_values->>'suffix'),''),
      'aliases',nullif(btrim(owner_values->>'aliases'),''),'address',btrim(owner_values->>'address'),
      'representative_name',nullif(btrim(owner_values->>'representative_name'),''),
      'representative_relation',nullif(btrim(owner_values->>'representative_relation'),''),
      'representative_contact',nullif(btrim(owner_values->>'representative_contact'),'')),owner_request,'save');
    owner_id := (owner_receipt->>'id')::bigint;
  end if;
  if owner_id is not null and plot.lot_owner_id is not null and plot.lot_owner_id<>owner_id then
    raise exception 'This plot already has a different owner; review the owner before proceeding' using errcode='22023';
  end if;
  if owner_id is not null and plot.lot_owner_id is null then
    lot_request := md5(p_request_id::text || ':map-lot-owner')::uuid;
    perform public.staff_save_record('lot',plot.lot_id::text,plot.revision,
      jsonb_build_object('lot_code',plot.lot_code,'area_id',plot.area_id,'lot_owner_id',owner_id,
        'location_geom',to_jsonb(plot)->'location_geom'),lot_request,'save');
  end if;
  payload := jsonb_build_object('lot_id',linked_id,'display_name',btrim(p_values->>'display_name'),
    'sex',p_values->>'sex','birth_date',birth,'death_date',death,'interment_date',interment,
    'interment_status',p_values->>'interment_status','remains_type',p_values->>'remains_type',
    'inscription',nullif(btrim(p_values->>'inscription'),''),'record_status','pending',
    'interment_confirmed',false,'public_display',coalesce((p_values->>'public_display')::boolean,false),
    'record_source','GRAVENAV_MAP_PUBLIC_V1');
  burial_request := md5(p_request_id::text || ':map-burial')::uuid;
  receipt := public.staff_save_record('burial_record',null,null,payload,burial_request,'save');
  update public.staff_mutation set result=receipt where actor_id=actor and request_id=p_request_id;
  return receipt;
end;
$$;
revoke all on function public.staff_create_mapped_burial(text,text,bigint,text,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_create_mapped_burial(text,text,bigint,text,jsonb,uuid) to authenticated;
commit;
